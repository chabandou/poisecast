import type { IncomingMessage, ServerResponse } from 'node:http'

export const STREAM_PROXY_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
] as const

type HeaderValue = string | string[] | undefined

type RateEntry = {
  windowStart: number
  requestCount: number
  inFlight: number
  blockedUntil: number
  lastSeen: number
}

function firstHeader(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value
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

function hostMatchesPattern(hostname: string, pattern: string): boolean {
  if (!pattern) return false
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2)
    return hostname === suffix || hostname.endsWith(`.${suffix}`)
  }
  return hostname === pattern
}

type StreamProxyCoreOptions = {
  maxUrlLength: number
  rateWindowMs: number
  rateMaxRequests: number
  rateMaxInflight: number
  rateBlockMs: number
  rateStateMaxEntries: number
  allowlist: string[]
  blocklist: string[]
}

export function createStreamProxyCoreFromEnv(env: NodeJS.ProcessEnv): StreamProxyCore {
  return new StreamProxyCore({
    maxUrlLength: 8_192,
    rateWindowMs: parseNumberEnv(env.STREAM_PROXY_RATE_WINDOW_MS, 60_000, 1_000, 600_000),
    rateMaxRequests: parseNumberEnv(env.STREAM_PROXY_RATE_MAX_REQUESTS, 120, 1, 10_000),
    rateMaxInflight: parseNumberEnv(env.STREAM_PROXY_RATE_MAX_INFLIGHT, 8, 1, 256),
    rateBlockMs: parseNumberEnv(env.STREAM_PROXY_RATE_BLOCK_MS, 120_000, 1_000, 3_600_000),
    rateStateMaxEntries: parseNumberEnv(env.STREAM_PROXY_RATE_MAX_ENTRIES, 5_000, 100, 100_000),
    allowlist: parseHostListEnv(env.STREAM_PROXY_ALLOWLIST),
    blocklist: parseHostListEnv(env.STREAM_PROXY_BLOCKLIST),
  })
}

export class StreamProxyCore {
  private readonly rateState = new Map<string, RateEntry>()
  private readonly options: StreamProxyCoreOptions

  constructor(options: StreamProxyCoreOptions) {
    this.options = options
  }

  private isHostAllowedByPolicy(hostname: string): boolean {
    const h = hostname.toLowerCase()
    if (this.options.blocklist.some((p) => hostMatchesPattern(h, p))) return false
    if (this.options.allowlist.length > 0) return this.options.allowlist.some((p) => hostMatchesPattern(h, p))
    return true
  }

  parseTarget(raw: string): URL | null {
    if (raw.length > this.options.maxUrlLength) return null
    try {
      const parsed = new URL(raw)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
      if (parsed.username || parsed.password) return null
      if (isBlockedHostname(parsed.hostname)) return null
      if (!this.isHostAllowedByPolicy(parsed.hostname)) return null
      return parsed
    } catch {
      return null
    }
  }

  getClientIp(headers: Record<string, HeaderValue>): string {
    const forwarded = firstHeader(headers['x-forwarded-for'])
    if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
    const realIp = firstHeader(headers['x-real-ip'])
    if (realIp) return realIp.trim()
    const cfIp = firstHeader(headers['cf-connecting-ip'])
    if (cfIp) return cfIp.trim()
    return 'unknown'
  }

  private cleanupRateState(now: number): void {
    const staleCutoff = now - Math.max(this.options.rateWindowMs + this.options.rateBlockMs, 300_000)
    for (const [key, entry] of this.rateState.entries()) {
      if (entry.inFlight === 0 && entry.lastSeen < staleCutoff) {
        this.rateState.delete(key)
      }
    }

    if (this.rateState.size <= this.options.rateStateMaxEntries) return

    const entries = Array.from(this.rateState.entries())
    entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen)
    const toDrop = this.rateState.size - this.options.rateStateMaxEntries
    for (let i = 0; i < toDrop; i += 1) {
      const key = entries[i]?.[0]
      if (key) this.rateState.delete(key)
    }
  }

  tryAcquireRateSlot(ip: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
    this.cleanupRateState(now)

    const entry =
      this.rateState.get(ip) ?? {
        windowStart: now,
        requestCount: 0,
        inFlight: 0,
        blockedUntil: 0,
        lastSeen: now,
      }

    if (now < entry.blockedUntil) {
      entry.lastSeen = now
      this.rateState.set(ip, entry)
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)) }
    }

    if (now - entry.windowStart >= this.options.rateWindowMs) {
      entry.windowStart = now
      entry.requestCount = 0
    }

    if (entry.inFlight >= this.options.rateMaxInflight) {
      entry.lastSeen = now
      this.rateState.set(ip, entry)
      return { ok: false, retryAfterSeconds: 1 }
    }

    if (entry.requestCount >= this.options.rateMaxRequests) {
      entry.blockedUntil = now + this.options.rateBlockMs
      entry.lastSeen = now
      this.rateState.set(ip, entry)
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(this.options.rateBlockMs / 1000)) }
    }

    entry.requestCount += 1
    entry.inFlight += 1
    entry.lastSeen = now
    this.rateState.set(ip, entry)
    return { ok: true }
  }

  releaseRateSlot(ip: string): void {
    const entry = this.rateState.get(ip)
    if (!entry) return
    entry.inFlight = Math.max(0, entry.inFlight - 1)
    entry.lastSeen = Date.now()
    this.rateState.set(ip, entry)
  }

  buildUpstreamHeaders(headers: Record<string, HeaderValue>): Record<string, string> {
    const upstreamHeaders: Record<string, string> = {}
    const range = firstHeader(headers.range)
    const ifRange = firstHeader(headers['if-range'])
    if (range && range.trim()) upstreamHeaders.range = range
    if (ifRange && ifRange.trim()) upstreamHeaders['if-range'] = ifRange
    return upstreamHeaders
  }

  async fetchWithSafeRedirects(initialUrl: URL, init: RequestInit, maxRedirects = 5): Promise<Response> {
    let current = initialUrl
    for (let i = 0; i <= maxRedirects; i += 1) {
      const res = await fetch(current, { ...init, redirect: 'manual' })
      if (res.status < 300 || res.status > 399) return res

      const location = res.headers.get('location')
      if (!location) return res

      const next = new URL(location, current)
      if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new Error('Blocked redirect protocol')
      if (next.username || next.password) throw new Error('Blocked redirect credentials')
      if (isBlockedHostname(next.hostname)) throw new Error('Blocked redirect target')
      if (!this.isHostAllowedByPolicy(next.hostname)) throw new Error('Blocked redirect target')
      current = next
    }
    throw new Error('Too many redirects')
  }

  copyStreamHeaders(upstream: Response, res: { setHeader: (name: string, value: string) => unknown }): void {
    for (const name of STREAM_PROXY_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }
  }

  readTargetQuery(req: { query?: Record<string, HeaderValue>; url?: string }): string | null {
    const rawQuery = req.query?.url
    if (rawQuery) return Array.isArray(rawQuery) ? (rawQuery[0] ?? null) : rawQuery

    if (!req.url) return null
    const parsed = new URL(req.url, 'http://localhost')
    return parsed.searchParams.get('url')
  }
}

export function sendJson(
  res: Pick<ServerResponse, 'setHeader' | 'end'> & { statusCode: number },
  statusCode: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body)
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

export function methodAllowed(method: string | undefined): method is 'GET' | 'HEAD' {
  return method === 'GET' || method === 'HEAD'
}

export type StreamProxyHttpRequest = Pick<IncomingMessage, 'method' | 'headers' | 'url'> & {
  query?: Record<string, HeaderValue>
}
