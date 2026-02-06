import { Readable } from 'node:stream'

const PASSTHROUGH_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
]

export const config = {
  runtime: 'nodejs',
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) && isPrivateIPv4(h)) return true
  if (h === '::1' || h === '[::1]') return true
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true
  return false
}

function readQueryUrl(req: { query?: Record<string, string | string[] | undefined> }): string | null {
  const raw = req.query?.url
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

function parseTargetUrl(raw: string): URL | null {
  if (raw.length > 8_192) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (isBlockedHostname(parsed.hostname)) return null
    return parsed
  } catch {
    return null
  }
}

async function fetchWithSafeRedirects(
  initialUrl: URL,
  init: RequestInit,
  maxRedirects = 5,
): Promise<Response> {
  let current = initialUrl
  for (let i = 0; i <= maxRedirects; i += 1) {
    const res = await fetch(current, { ...init, redirect: 'manual' })
    if (res.status < 300 || res.status > 399) return res

    const location = res.headers.get('location')
    if (!location) return res

    const next = new URL(location, current)
    if (next.protocol !== 'http:' && next.protocol !== 'https:') {
      throw new Error('Blocked redirect protocol')
    }
    if (isBlockedHostname(next.hostname)) {
      throw new Error('Blocked redirect target')
    }
    current = next
  }
  throw new Error('Too many redirects')
}

export default async function handler(
  req: {
    method?: string
    headers: Record<string, string | string[] | undefined>
    query?: Record<string, string | string[] | undefined>
  },
  res: {
    status: (code: number) => { json: (body: unknown) => void; end: (body?: string) => void }
    setHeader: (name: string, value: string) => void
    end: (body?: string) => void
    writableEnded?: boolean
  },
) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const raw = readQueryUrl(req)
  if (!raw) {
    res.status(400).json({ error: 'Missing "url" query parameter' })
    return
  }

  const target = parseTargetUrl(raw)
  if (!target) {
    res.status(400).json({ error: 'Invalid or blocked URL' })
    return
  }

  const upstreamHeaders: Record<string, string> = {}
  const range = req.headers.range
  const ifRange = req.headers['if-range']

  if (typeof range === 'string' && range.trim()) upstreamHeaders.range = range
  if (typeof ifRange === 'string' && ifRange.trim()) upstreamHeaders['if-range'] = ifRange

  try {
    const upstream = await fetchWithSafeRedirects(target, {
      method: req.method,
      headers: upstreamHeaders,
      cache: 'no-store',
    })

    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }

    // Keep proxy responses transient; audio hosts control canonical caching.
    res.setHeader('cache-control', 'private, no-store')
    res.status(upstream.status)

    if (req.method === 'HEAD' || !upstream.body) {
      res.end()
      return
    }

    const body = Readable.fromWeb(upstream.body as unknown as ReadableStream<Uint8Array>)
    body.on('error', () => {
      if (!res.writableEnded) res.end()
    })
    body.pipe(res as unknown as NodeJS.WritableStream)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    res.status(502).json({ error: 'Upstream fetch failed', detail: message })
  }
}
