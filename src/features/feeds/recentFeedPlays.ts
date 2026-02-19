import { normalizeFeedUrlKey } from './feedUtils'

export const RECENT_FEED_PLAYS_STORAGE_KEY = 'poisecast.recentFeedPlays.v1'
const MAX_RECENT_FEED_PLAYS = 120

export type RecentFeedPlay = {
  rssUrl: string
  episodeTitle: string
  playedAt: number
  feedTitle?: string
}

type RecentFeedPlayCandidate = {
  rssUrl?: unknown
  episodeTitle?: unknown
  playedAt?: unknown
  feedTitle?: unknown
}

function normalizeRecentFeedPlay(value: unknown): RecentFeedPlay | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as RecentFeedPlayCandidate
  if (typeof candidate.rssUrl !== 'string') return null
  if (typeof candidate.episodeTitle !== 'string') return null

  const rssUrl = candidate.rssUrl.trim()
  const episodeTitle = candidate.episodeTitle.trim()
  if (!rssUrl || !episodeTitle) return null

  const playedAtRaw = Number(candidate.playedAt)
  if (!Number.isFinite(playedAtRaw) || playedAtRaw <= 0) return null
  const playedAt = Math.floor(playedAtRaw)

  const feedTitle =
    typeof candidate.feedTitle === 'string' && candidate.feedTitle.trim().length > 0
      ? candidate.feedTitle.trim()
      : undefined

  return {
    rssUrl,
    episodeTitle,
    playedAt,
    ...(feedTitle ? { feedTitle } : {}),
  }
}

function dedupeAndSortRecentFeedPlays(values: RecentFeedPlay[]): RecentFeedPlay[] {
  const byUrl = new Map<string, RecentFeedPlay>()
  for (const value of values) {
    const key = normalizeFeedUrlKey(value.rssUrl)
    if (!key) continue
    const existing = byUrl.get(key)
    if (!existing || value.playedAt > existing.playedAt) {
      byUrl.set(key, value)
    }
  }
  return [...byUrl.values()]
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, MAX_RECENT_FEED_PLAYS)
}

export function loadPersistedRecentFeedPlays(storage: Pick<Storage, 'getItem'> = localStorage): RecentFeedPlay[] {
  try {
    const raw = storage.getItem(RECENT_FEED_PLAYS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return dedupeAndSortRecentFeedPlays(
      parsed
        .map((value) => normalizeRecentFeedPlay(value))
        .filter((value): value is RecentFeedPlay => value !== null),
    )
  } catch {
    return []
  }
}

export function upsertRecentFeedPlay(plays: RecentFeedPlay[], nextPlay: RecentFeedPlay): RecentFeedPlay[] {
  return dedupeAndSortRecentFeedPlays([...plays, nextPlay])
}
