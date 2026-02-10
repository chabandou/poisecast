export const config = {
  runtime: 'nodejs',
}

type RequestLike = {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

type ResponseLike = {
  status: (code: number) => { json: (body: unknown) => void; end: (body?: string) => void }
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

type Endpoint = {
  url: URL
}

const APPLE_BASE = 'https://itunes.apple.com'
const MAX_TERM_LEN = 200

function readQuery(req: RequestLike, key: string): string | undefined {
  const raw = req.query?.[key]
  if (!raw) return undefined
  return Array.isArray(raw) ? raw[0] : raw
}

function parseLimit(raw: string | undefined, fallback = 12): number {
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(50, value))
}

function resolveEndpoint(req: RequestLike): Endpoint | { error: string } {
  const kind = readQuery(req, 'kind')

  if (kind === 'lookup') {
    const feedUrl = readQuery(req, 'feedUrl')?.trim()
    if (!feedUrl) return { error: 'Missing "feedUrl" query parameter' }

    try {
      const parsed = new URL(feedUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { error: 'Invalid "feedUrl" protocol' }
      }
    } catch {
      return { error: 'Invalid "feedUrl" query parameter' }
    }

    const url = new URL('/lookup', APPLE_BASE)
    url.searchParams.set('entity', 'podcast')
    url.searchParams.set('feedUrl', feedUrl)
    return { url }
  }

  if (kind === 'search') {
    const term = readQuery(req, 'term')?.trim()
    if (!term) return { error: 'Missing "term" query parameter' }

    const normalizedTerm = term.slice(0, MAX_TERM_LEN)
    const limit = parseLimit(readQuery(req, 'limit'), 12)
    const url = new URL('/search', APPLE_BASE)
    url.searchParams.set('media', 'podcast')
    url.searchParams.set('entity', 'podcast')
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('term', normalizedTerm)
    return { url }
  }

  return { error: 'Invalid "kind" query parameter' }
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const endpoint = resolveEndpoint(req)
  if ('error' in endpoint) {
    res.status(400).json({ error: endpoint.error })
    return
  }

  try {
    const upstream = await fetch(endpoint.url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      cache: 'no-store',
    })

    const body = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8'
    const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=300'

    res.setHeader('content-type', contentType)
    res.setHeader('cache-control', cacheControl)
    res.status(upstream.status).end(body)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    res.status(502).json({ error: 'Apple request failed', detail: message })
  }
}
