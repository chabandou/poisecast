import type { ParsedPodcast } from '../../podcasts/types'

export const FEED_CACHE_SCHEMA_VERSION = 2
export const FEED_IMAGE_CACHE_SCHEMA_VERSION = 2

type PersistedFeedCacheV2 = {
  version: typeof FEED_CACHE_SCHEMA_VERSION
  savedAtMs: number
  entries: Array<[string, ParsedPodcast]>
}

type PersistedFeedImageCacheV2 = {
  version: typeof FEED_IMAGE_CACHE_SCHEMA_VERSION
  savedAtMs: number
  images: Record<string, string>
}

type LoadResult<T> = {
  value: T
  migratedFromLegacy: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeFeedCacheEntries(raw: unknown, maxEntries: number): Array<[string, ParsedPodcast]> {
  if (!Array.isArray(raw)) return []

  const entries: Array<[string, ParsedPodcast]> = []
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) continue
    const [url, parsedPodcast] = item
    if (typeof url !== 'string' || !url.trim()) continue
    if (!isRecord(parsedPodcast)) continue
    entries.push([url, parsedPodcast as ParsedPodcast])
    if (entries.length >= maxEntries) break
  }
  return entries
}

function normalizeImageRecord(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || !key.trim()) continue
    if (typeof value !== 'string' || !value.trim()) continue
    out[key] = value
  }
  return out
}

export function loadPersistedFeedCache(
  storage: Pick<Storage, 'getItem'>,
  storageKey: string,
  maxEntries: number,
): LoadResult<Map<string, ParsedPodcast>> {
  const empty = { value: new Map<string, ParsedPodcast>(), migratedFromLegacy: false }
  const raw = storage.getItem(storageKey)
  if (!raw) return empty

  try {
    const parsed = JSON.parse(raw) as unknown

    if (isRecord(parsed) && parsed.version === FEED_CACHE_SCHEMA_VERSION) {
      const entries = normalizeFeedCacheEntries(parsed.entries, maxEntries)
      return {
        value: new Map(entries),
        migratedFromLegacy: false,
      }
    }

    if (isRecord(parsed) && 'entries' in parsed) {
      const entries = normalizeFeedCacheEntries(parsed.entries, maxEntries)
      return {
        value: new Map(entries),
        migratedFromLegacy: true,
      }
    }

    if (Array.isArray(parsed)) {
      const entries = normalizeFeedCacheEntries(parsed, maxEntries)
      return {
        value: new Map(entries),
        migratedFromLegacy: true,
      }
    }
  } catch {
    // Ignore malformed storage payloads.
  }

  return empty
}

export function persistFeedCache(
  storage: Pick<Storage, 'setItem'>,
  storageKey: string,
  cache: Map<string, ParsedPodcast>,
  now = Date.now,
): void {
  const payload: PersistedFeedCacheV2 = {
    version: FEED_CACHE_SCHEMA_VERSION,
    savedAtMs: now(),
    entries: Array.from(cache.entries()),
  }
  storage.setItem(storageKey, JSON.stringify(payload))
}

export function loadPersistedFeedImages(
  storage: Pick<Storage, 'getItem'>,
  storageKey: string,
): LoadResult<Record<string, string>> {
  const empty = { value: {}, migratedFromLegacy: false }
  const raw = storage.getItem(storageKey)
  if (!raw) return empty

  try {
    const parsed = JSON.parse(raw) as unknown

    if (isRecord(parsed) && parsed.version === FEED_IMAGE_CACHE_SCHEMA_VERSION) {
      return {
        value: normalizeImageRecord(parsed.images),
        migratedFromLegacy: false,
      }
    }

    if (isRecord(parsed) && 'images' in parsed) {
      return {
        value: normalizeImageRecord(parsed.images),
        migratedFromLegacy: true,
      }
    }

    if (isRecord(parsed)) {
      return {
        value: normalizeImageRecord(parsed),
        migratedFromLegacy: true,
      }
    }
  } catch {
    // Ignore malformed storage payloads.
  }

  return empty
}

export function persistFeedImages(
  storage: Pick<Storage, 'setItem'>,
  storageKey: string,
  images: Record<string, string>,
  now = Date.now,
): void {
  const payload: PersistedFeedImageCacheV2 = {
    version: FEED_IMAGE_CACHE_SCHEMA_VERSION,
    savedAtMs: now(),
    images,
  }
  storage.setItem(storageKey, JSON.stringify(payload))
}
