import { buildAppleLookupUrl } from '../../podcasts/appleApi'
import { fetchAndParseRss } from '../../podcasts/rss'
import type { ParsedPodcast } from '../../podcasts/types'
import { dedupeGenres, type FeedLookupMeta } from './feedUtils'

export type FeedRepositoryLoadOptions = {
  signal?: AbortSignal
}

export interface IFeedRepository {
  loadFeed(url: string, options?: FeedRepositoryLoadOptions): Promise<ParsedPodcast>
  loadLookupMeta(url: string, options?: FeedRepositoryLoadOptions): Promise<FeedLookupMeta | null>
}

type CacheEntry<T> = {
  value: T
  cachedAtMs: number
}

export type FeedRepositoryOptions = {
  feedCacheMaxEntries?: number
  lookupCacheMaxEntries?: number
  feedCacheTtlMs?: number | null
  lookupCacheTtlMs?: number | null
  now?: () => number
}

function clampCacheEntries(value: number | undefined, fallback: number): number {
  const parsed = Number.isFinite(value) ? Math.trunc(value as number) : fallback
  return Math.max(1, parsed)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export class FeedRepository implements IFeedRepository {
  private readonly feedCache = new Map<string, CacheEntry<ParsedPodcast>>()
  private readonly lookupCache = new Map<string, CacheEntry<FeedLookupMeta | null>>()
  private readonly feedCacheMaxEntries: number
  private readonly lookupCacheMaxEntries: number
  private readonly feedCacheTtlMs: number | null
  private readonly lookupCacheTtlMs: number | null
  private readonly now: () => number

  constructor(options: FeedRepositoryOptions = {}) {
    this.feedCacheMaxEntries = clampCacheEntries(options.feedCacheMaxEntries, 20)
    this.lookupCacheMaxEntries = clampCacheEntries(options.lookupCacheMaxEntries, 20)
    this.feedCacheTtlMs = options.feedCacheTtlMs ?? null
    this.lookupCacheTtlMs = options.lookupCacheTtlMs ?? null
    this.now = options.now ?? Date.now
  }

  private isExpired(cachedAtMs: number, ttlMs: number | null): boolean {
    if (ttlMs === null || ttlMs <= 0) return false
    return this.now() - cachedAtMs > ttlMs
  }

  private getCached<T>(cache: Map<string, CacheEntry<T>>, key: string, ttlMs: number | null): T | undefined {
    const entry = cache.get(key)
    if (!entry) return undefined
    if (this.isExpired(entry.cachedAtMs, ttlMs)) {
      cache.delete(key)
      return undefined
    }

    // LRU: move key to the most recent position on hit.
    cache.delete(key)
    cache.set(key, entry)
    return entry.value
  }

  private setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, maxEntries: number): void {
    if (cache.has(key)) cache.delete(key)
    cache.set(key, { value, cachedAtMs: this.now() })
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value as string | undefined
      if (!oldestKey) break
      cache.delete(oldestKey)
    }
  }

  async loadFeed(url: string, options: FeedRepositoryLoadOptions = {}): Promise<ParsedPodcast> {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const cached = this.getCached(this.feedCache, url, this.feedCacheTtlMs)
    if (cached) return cached

    const parsed = await fetchAndParseRss(url, { signal: options.signal })
    this.setCached(this.feedCache, url, parsed, this.feedCacheMaxEntries)
    return parsed
  }

  async loadLookupMeta(url: string, options: FeedRepositoryLoadOptions = {}): Promise<FeedLookupMeta | null> {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const cached = this.getCached(this.lookupCache, url, this.lookupCacheTtlMs)
    if (typeof cached !== 'undefined') return cached

    try {
      const res = await fetch(buildAppleLookupUrl(url), { signal: options.signal })
      if (!res.ok) {
        this.setCached(this.lookupCache, url, null, this.lookupCacheMaxEntries)
        return null
      }

      const data = (await res.json()) as {
        results?: Array<{
          artworkUrl600?: string
          artworkUrl512?: string
          artworkUrl100?: string
          primaryGenreName?: string
          genres?: string[]
        }>
      }

      const item = data?.results?.[0]
      const artworkUrl = item?.artworkUrl600 || item?.artworkUrl512 || item?.artworkUrl100 || null
      const genres = dedupeGenres([item?.primaryGenreName, ...(item?.genres ?? [])])
      const out: FeedLookupMeta = { artworkUrl, genres }
      this.setCached(this.lookupCache, url, out, this.lookupCacheMaxEntries)
      return out
    } catch (error) {
      if (isAbortError(error)) throw error
      this.setCached(this.lookupCache, url, null, this.lookupCacheMaxEntries)
      return null
    }
  }

  seedFeed(url: string, podcast: ParsedPodcast): void {
    this.setCached(this.feedCache, url, podcast, this.feedCacheMaxEntries)
  }

  getCachedFeed(url: string): ParsedPodcast | undefined {
    return this.getCached(this.feedCache, url, this.feedCacheTtlMs)
  }

  clearFeedCache(): void {
    this.feedCache.clear()
  }
}
