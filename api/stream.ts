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

const MAX_URL_LENGTH = 8_192
const RATE_WINDOW_MS = parseNumberEnv(process.env.STREAM_PROXY_RATE_WINDOW_MS, 60_000, 1_000, 600_000)
const RATE_MAX_REQUESTS = parseNumberEnv(process.env.STREAM_PROXY_RATE_MAX_REQUESTS, 120, 1, 10_000)
const RATE_MAX_INFLIGHT = parseNumberEnv(process.env.STREAM_PROXY_RATE_MAX_INFLIGHT, 8, 1, 256)
const RATE_BLOCK_MS = parseNumberEnv(process.env.STREAM_PROXY_RATE_BLOCK_MS, 120_000, 1_000, 3_600_000)
const RATE_STATE_MAX_ENTRIES = parseNumberEnv(process.env.STREAM_PROXY_RATE_MAX_ENTRIES, 5_000, 100, 100_000)
const ALLOWLIST = parseHostListEnv(process.env.STREAM_PROXY_ALLOWLIST)
const BLOCKLIST = parseHostListEnv(process.env.STREAM_PROXY_BLOCKLIST)

type RateEntry = {
  windowStart: number
  requestCount: number
  inFlight: number
  blockedUntil: number
  lastSeen: number
}

const RATE_STATE = new Map<string, RateEntry>()

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

function parseHostListEnv(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function parseNumberEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function hostMatchesPattern(hostname: string, pattern: string): boolean {
  if (!pattern) return false
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2)
    return hostname === suffix || hostname.endsWith(`.${suffix}`)
  }
  return hostname === pattern
}

function isHostAllowedByPolicy(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (BLOCKLIST.some((p) => hostMatchesPattern(h, p))) return false
  if (ALLOWLIST.length > 0) return ALLOWLIST.some((p) => hostMatchesPattern(h, p))
  return true
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function getClientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = firstHeaderValue(req.headers['x-forwarded-for'])
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  const realIp = firstHeaderValue(req.headers['x-real-ip'])
  if (realIp) return realIp.trim()
  const cfIp = firstHeaderValue(req.headers['cf-connecting-ip'])
  if (cfIp) return cfIp.trim()
  return 'unknown'
}

function cleanupRateState(now: number): void {
  const staleCutoff = now - Math.max(RATE_WINDOW_MS + RATE_BLOCK_MS, 300_000)
  for (const [key, entry] of RATE_STATE.entries()) {
    if (entry.inFlight === 0 && entry.lastSeen < staleCutoff) {
      RATE_STATE.delete(key)
    }
  }

  if (RATE_STATE.size <= RATE_STATE_MAX_ENTRIES) return

  const entries = Array.from(RATE_STATE.entries())
  entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen)
  const toDrop = RATE_STATE.size - RATE_STATE_MAX_ENTRIES
  for (let i = 0; i < toDrop; i += 1) {
    const key = entries[i]?.[0]
    if (key) RATE_STATE.delete(key)
  }
}

function tryAcquireRateSlot(ip: string, now: number): { ok: true } | { ok: false; retryAfterSeconds: number } {
  cleanupRateState(now)

  const entry =
    RATE_STATE.get(ip) ??
    {
      windowStart: now,
      requestCount: 0,
      inFlight: 0,
      blockedUntil: 0,
      lastSeen: now,
    }

  if (now < entry.blockedUntil) {
    entry.lastSeen = now
    RATE_STATE.set(ip, entry)
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)) }
  }

  if (now - entry.windowStart >= RATE_WINDOW_MS) {
    entry.windowStart = now
    entry.requestCount = 0
  }

  if (entry.inFlight >= RATE_MAX_INFLIGHT) {
    entry.lastSeen = now
    RATE_STATE.set(ip, entry)
    return { ok: false, retryAfterSeconds: 1 }
  }

  if (entry.requestCount >= RATE_MAX_REQUESTS) {
    entry.blockedUntil = now + RATE_BLOCK_MS
    entry.lastSeen = now
    RATE_STATE.set(ip, entry)
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(RATE_BLOCK_MS / 1000)) }
  }

  entry.requestCount += 1
  entry.inFlight += 1
  entry.lastSeen = now
  RATE_STATE.set(ip, entry)
  return { ok: true }
}

function releaseRateSlot(ip: string): void {
  const entry = RATE_STATE.get(ip)
  if (!entry) return
  entry.inFlight = Math.max(0, entry.inFlight - 1)
  entry.lastSeen = Date.now()
  RATE_STATE.set(ip, entry)
}

function readQueryUrl(req: { query?: Record<string, string | string[] | undefined> }): string | null {
  const raw = req.query?.url
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

function parseTargetUrl(raw: string): URL | null {
  if (raw.length > MAX_URL_LENGTH) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.username || parsed.password) return null
    if (isBlockedHostname(parsed.hostname)) return null
    if (!isHostAllowedByPolicy(parsed.hostname)) return null
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

  const clientIp = getClientIp(req)
  const rateGate = tryAcquireRateSlot(clientIp, Date.now())
  if (!rateGate.ok) {
    res.setHeader('retry-after', String(rateGate.retryAfterSeconds))
    res.status(429).json({ error: 'Rate limit exceeded' })
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
  } finally {
    releaseRateSlot(clientIp)
  }
}
