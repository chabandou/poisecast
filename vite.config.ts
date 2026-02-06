import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

function fileRevision(absPath: string): string {
  const h = createHash('sha256')
  h.update(readFileSync(absPath))
  return h.digest('hex').slice(0, 16)
}

const STREAM_PROXY_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
]
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

function firstHeader(value: string | string[] | undefined): string | undefined {
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

function isHostAllowedByPolicy(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (BLOCKLIST.some((p) => hostMatchesPattern(h, p))) return false
  if (ALLOWLIST.length > 0) return ALLOWLIST.some((p) => hostMatchesPattern(h, p))
  return true
}

function parseProxyTarget(raw: string): URL | null {
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

function getClientIp(req: IncomingMessage): string {
  const forwarded = firstHeader(req.headers['x-forwarded-for'])
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  const realIp = firstHeader(req.headers['x-real-ip'])
  if (realIp) return realIp.trim()
  const cfIp = firstHeader(req.headers['cf-connecting-ip'])
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

async function fetchWithSafeRedirects(initialUrl: URL, init: RequestInit, maxRedirects = 5): Promise<Response> {
  let current = initialUrl
  for (let i = 0; i <= maxRedirects; i += 1) {
    const res = await fetch(current, { ...init, redirect: 'manual' })
    if (res.status < 300 || res.status > 399) return res

    const location = res.headers.get('location')
    if (!location) return res

    const next = new URL(location, current)
    if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new Error('Blocked redirect protocol')
    if (isBlockedHostname(next.hostname)) throw new Error('Blocked redirect target')
    current = next
  }
  throw new Error('Too many redirects')
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

async function handleLocalStreamProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const parsed = new URL(req.url ?? '/', 'http://localhost')
  const rawTarget = parsed.searchParams.get('url')
  if (!rawTarget) {
    sendJson(res, 400, { error: 'Missing "url" query parameter' })
    return
  }

  const target = parseProxyTarget(rawTarget)
  if (!target) {
    sendJson(res, 400, { error: 'Invalid or blocked URL' })
    return
  }

  const clientIp = getClientIp(req)
  const rateGate = tryAcquireRateSlot(clientIp, Date.now())
  if (!rateGate.ok) {
    res.setHeader('retry-after', String(rateGate.retryAfterSeconds))
    sendJson(res, 429, { error: 'Rate limit exceeded' })
    return
  }

  const upstreamHeaders: Record<string, string> = {}
  const range = firstHeader(req.headers.range)
  const ifRange = firstHeader(req.headers['if-range'])
  if (range && range.trim()) upstreamHeaders.range = range
  if (ifRange && ifRange.trim()) upstreamHeaders['if-range'] = ifRange

  try {
    const upstream = await fetchWithSafeRedirects(target, { method, headers: upstreamHeaders, cache: 'no-store' })
    for (const name of STREAM_PROXY_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }

    res.setHeader('cache-control', 'private, no-store')
    res.statusCode = upstream.status

    if (method === 'HEAD' || !upstream.body) {
      res.end()
      return
    }

    const body = Readable.fromWeb(upstream.body as unknown as ReadableStream<Uint8Array>)
    body.on('error', () => {
      if (!res.writableEnded) res.end()
    })
    body.pipe(res)
  } catch (e) {
    sendJson(res, 502, { error: 'Upstream fetch failed', detail: e instanceof Error ? e.message : String(e) })
  } finally {
    releaseRateSlot(clientIp)
  }
}

function localStreamProxyPlugin(): Plugin {
  return {
    name: 'local-stream-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/stream', (req, res) => {
        void handleLocalStreamProxy(req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: ['onnxruntime-web'],
  },
  plugins: [
    react(),
    localStreamProxyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'Poisecast',
        short_name: 'Poisecast',
        description: 'Podcast player with optional client-side voice isolation.',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        id: '/',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache only the default model + core ORT WASM needed for first-run offline use.
        // Other models remain on-demand and will be cached when selected/used.
        globIgnores: ['**/*.wasm', '**/*.onnx'],

        // Workbox default is 2 MiB; our `.onnx` and `.wasm` exceed that by a lot.
        // This must be high enough for the largest ORT wasm (~25.5 MiB).
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,

        additionalManifestEntries: (() => {
          const here = path.dirname(fileURLToPath(import.meta.url))
          const pub = path.join(here, 'public')
          const files = [
            'models/denoiser_model.onnx',
            'ort/ort-wasm.wasm',
            'ort/ort-wasm-simd.wasm',
          ]

          return files.map((rel) => ({
            url: `/${rel.replace(/\\\\/g, '/')}`,
            revision: fileRevision(path.join(pub, rel)),
          }))
        })(),

        // Cache model files and RSS responses opportunistically.
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              request.destination === 'audio' ||
              request.url.endsWith('.onnx') ||
              request.url.endsWith('.wasm') ||
              request.url.includes('/models/') ||
              request.url.includes('/ort/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'poisecast-assets',
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'document' || request.url.endsWith('.xml'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'poisecast-feeds',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
})
