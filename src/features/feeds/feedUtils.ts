import { DEFAULT_FEEDS, type DefaultFeed } from '../../podcasts/defaultFeeds'
import type { ParsedPodcast, PodcastEpisode } from '../../podcasts/types'

export const LIBRARY_FEEDS_STORAGE_KEY = 'poisecast.libraryFeeds.v1'

export type LibraryFeedStats = { episodeCount: number; latestPubMs: number | null }

export type FeedLookupMeta = {
  artworkUrl: string | null
  genres: string[]
}

export function normalizeLookupGenre(value?: string): string | null {
  const v = value?.replace(/\s+/g, ' ').trim()
  if (!v) return null
  if (/^(podcast|podcasts|rss|feed)$/i.test(v)) return null
  return v
}

export function dedupeGenres(values: Array<string | undefined | null>, max = 6): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const genre = normalizeLookupGenre(value ?? undefined)
    if (!genre) continue
    const key = genre.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(genre)
    if (out.length >= max) break
  }
  return out
}

export function normalizeFeedEntry(value: unknown): DefaultFeed | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as {
    title?: unknown
    rssUrl?: unknown
    category?: unknown
  }

  if (typeof candidate.rssUrl !== 'string') return null
  const rssUrl = candidate.rssUrl.trim()
  if (!rssUrl) return null

  const title =
    typeof candidate.title === 'string' && candidate.title.trim().length > 0
      ? candidate.title.trim()
      : rssUrl
  const category =
    typeof candidate.category === 'string' && candidate.category.trim().length > 0
      ? candidate.category.trim()
      : undefined

  return {
    title,
    rssUrl,
    ...(category ? { category } : {}),
  }
}

export function normalizeFeedUrlKey(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}

export function dedupeFeedsByUrl(feeds: DefaultFeed[]): DefaultFeed[] {
  const seen = new Set<string>()
  const out: DefaultFeed[] = []
  for (const feed of feeds) {
    const key = normalizeFeedUrlKey(feed.rssUrl)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(feed)
  }
  return out
}

export function loadPersistedLibraryFeeds(storage: Pick<Storage, 'getItem'> = localStorage): DefaultFeed[] {
  try {
    const raw = storage.getItem(LIBRARY_FEEDS_STORAGE_KEY)
    if (!raw) return dedupeFeedsByUrl(DEFAULT_FEEDS)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return dedupeFeedsByUrl(DEFAULT_FEEDS)
    const normalized = dedupeFeedsByUrl(
      parsed.map((item) => normalizeFeedEntry(item)).filter((item): item is DefaultFeed => item !== null),
    )
    return normalized.length > 0 ? normalized : dedupeFeedsByUrl(DEFAULT_FEEDS)
  } catch {
    return dedupeFeedsByUrl(DEFAULT_FEEDS)
  }
}

export function getLatestEpisodePubMs(episodes: PodcastEpisode[]): number | null {
  let latest: number | null = null
  for (const episode of episodes) {
    if (!episode.pubDate) continue
    const parsed = new Date(episode.pubDate).getTime()
    if (Number.isNaN(parsed)) continue
    if (latest === null || parsed > latest) latest = parsed
  }
  return latest
}

export function summarizeFeedStats(parsedPodcast: ParsedPodcast): LibraryFeedStats {
  return {
    episodeCount: parsedPodcast.episodes.length,
    latestPubMs: getLatestEpisodePubMs(parsedPodcast.episodes),
  }
}
