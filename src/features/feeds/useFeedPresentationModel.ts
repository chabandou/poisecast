import { useMemo } from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import type { ParsedPodcast } from '../../podcasts/types'
import { normalizeFeedUrlKey, type LibraryFeedStats } from './feedUtils'

export type LibrarySortMode = 'updated' | 'alpha' | 'count'

export type LibraryFeedViewItem = DefaultFeed & {
  imageUrl: string | null
  isArtworkLoading: boolean
  episodeCount: number
  latestPubMs: number | null
  isActive: boolean
  isLoading: boolean
}

type UseFeedPresentationModelOptions = {
  libraryFeeds: DefaultFeed[]
  rssUrl: string
  isShowInfoLoading: boolean
  podcast: ParsedPodcast | null
  episodesAllCount: number
  episodesCount: number
  feedImages: Record<string, string>
  libraryArtworkLoadingByUrl: Record<string, boolean>
  libraryQuery: string
  librarySortMode: LibrarySortMode
  libraryStatsByUrl: Record<string, LibraryFeedStats>
  loadingFeedUrl: string | null
  sourceKind: 'remote' | 'local'
}

type TitleParts = { head: string; accent?: string }
type FeedViewIndex = {
  feed: DefaultFeed
  normalizedRssUrl: string
  rssLower: string
  titleLower: string
}

function normalizeFeedDescription(value?: string, maxLen = 420): string | null {
  if (!value) return null
  const plain =
    new DOMParser()
      .parseFromString(value, 'text/html')
      .body.textContent?.replace(/\s+/g, ' ')
      .trim() ?? ''
  if (!plain) return null
  return plain.length > maxLen ? `${plain.slice(0, maxLen - 1)}…` : plain
}

function feedHostFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toUpperCase()
  } catch {
    return 'UNKNOWN_HOST'
  }
}

function splitTitle(title: string): TitleParts {
  const t = title.trim()
  if (!t) return { head: '—' }
  const separators = [': ', ' - ', ' — ']
  for (const separator of separators) {
    const index = t.indexOf(separator)
    if (index > 10 && index < t.length - 8) {
      return {
        head: t.slice(0, index + separator.length).trimEnd(),
        accent: t.slice(index + separator.length).trim(),
      }
    }
  }
  return { head: t }
}

export function useFeedPresentationModel({
  libraryFeeds,
  rssUrl,
  isShowInfoLoading,
  podcast,
  episodesAllCount,
  episodesCount,
  feedImages,
  libraryArtworkLoadingByUrl,
  libraryQuery,
  librarySortMode,
  libraryStatsByUrl,
  loadingFeedUrl,
  sourceKind,
}: UseFeedPresentationModelOptions) {
  const titleCollator = useMemo(
    () =>
      new Intl.Collator(undefined, {
        sensitivity: 'base',
      }),
    [],
  )
  const normalizedRssUrl = useMemo(() => normalizeFeedUrlKey(rssUrl), [rssUrl])
  const normalizedLoadingFeedUrl = useMemo(
    () => (loadingFeedUrl ? normalizeFeedUrlKey(loadingFeedUrl) : null),
    [loadingFeedUrl],
  )
  const feedViewIndex = useMemo<FeedViewIndex[]>(
    () =>
      libraryFeeds.map((feed) => ({
        feed,
        normalizedRssUrl: normalizeFeedUrlKey(feed.rssUrl),
        rssLower: feed.rssUrl.toLowerCase(),
        titleLower: feed.title.toLowerCase(),
      })),
    [libraryFeeds],
  )
  const activeSource = useMemo(
    () => feedViewIndex.find((item) => item.normalizedRssUrl === normalizedRssUrl)?.feed,
    [feedViewIndex, normalizedRssUrl],
  )

  const showHost = useMemo(() => feedHostFromUrl(rssUrl), [rssUrl])

  const showTitleRaw = isShowInfoLoading
    ? 'LOADING SHOW...'
    : (podcast?.feed.title || activeSource?.title || 'SELECT A SOURCE')

  const showTitleParts = useMemo(() => splitTitle(showTitleRaw), [showTitleRaw])

  const showNetworkLabel = isShowInfoLoading
    ? '/// Loading feed metadata...'
    : `/// Source: ${showHost} · ${episodesAllCount} entries`

  const sectionTagLabel = isShowInfoLoading
    ? '/// LOADING ENTRIES'
    : `/// ${episodesCount} ENTRIES`

  const showArtwork = podcast?.feed.imageUrl || feedImages[rssUrl] || null

  const libraryImageByUrl = useMemo(() => {
    const imageByUrl = { ...feedImages }
    if (podcast?.feed.imageUrl) {
      imageByUrl[rssUrl] = podcast.feed.imageUrl
    }
    return imageByUrl
  }, [feedImages, podcast, rssUrl])

  const libraryFeedsView = useMemo(() => {
    const normalizedQuery = libraryQuery.trim().toLowerCase()
    const filtered = feedViewIndex
      .filter((entry) => {
        if (!normalizedQuery) return true
        return (
          entry.titleLower.includes(normalizedQuery) ||
          entry.rssLower.includes(normalizedQuery)
        )
      })
      .map((entry) => {
        const { feed, normalizedRssUrl: normalizedFeedRssUrl } = entry
        const stats = libraryStatsByUrl[feed.rssUrl]
        return {
          ...feed,
          imageUrl: libraryImageByUrl[feed.rssUrl] ?? null,
          isArtworkLoading: Boolean(libraryArtworkLoadingByUrl[feed.rssUrl]),
          episodeCount: stats?.episodeCount ?? 0,
          latestPubMs: stats?.latestPubMs ?? null,
          isActive: normalizedFeedRssUrl === normalizedRssUrl,
          isLoading:
            normalizedLoadingFeedUrl !== null &&
            normalizedFeedRssUrl === normalizedLoadingFeedUrl,
        }
      })

    filtered.sort((a, b) => {
      if (librarySortMode === 'alpha') {
        return titleCollator.compare(a.title, b.title)
      }
      if (librarySortMode === 'count') {
        if (a.episodeCount !== b.episodeCount) {
          return b.episodeCount - a.episodeCount
        }
        return titleCollator.compare(a.title, b.title)
      }
      const aLatest = a.latestPubMs
      const bLatest = b.latestPubMs
      if (aLatest === null && bLatest !== null) return 1
      if (aLatest !== null && bLatest === null) return -1
      if (aLatest !== null && bLatest !== null && aLatest !== bLatest) {
        return bLatest - aLatest
      }
      return titleCollator.compare(a.title, b.title)
    })

    return filtered
  }, [
    feedViewIndex,
    libraryImageByUrl,
    libraryArtworkLoadingByUrl,
    libraryQuery,
    librarySortMode,
    libraryStatsByUrl,
    normalizedLoadingFeedUrl,
    normalizedRssUrl,
    titleCollator,
  ])

  const showDescription = useMemo(() => {
    if (isShowInfoLoading) return 'Loading selected feed…'
    const parsed = normalizeFeedDescription(podcast?.feed.description)
    if (parsed) return parsed
    if (activeSource) return `Feed URL: ${activeSource.rssUrl}`
    return 'Select a source from the sidebar to load show details.'
  }, [activeSource, isShowInfoLoading, podcast?.feed.description])

  const showGenres = useMemo(() => {
    if (isShowInfoLoading) return ['Loading...']
    if (sourceKind === 'local') return ['LOCAL FILE']
    const parsed = (podcast?.feed.genres ?? []).filter(
      (genre) => typeof genre === 'string' && genre.trim().length > 0,
    )
    if (parsed.length) return parsed.slice(0, 3)
    if (activeSource?.category?.trim()) return [activeSource.category.trim()]
    return ['Podcast']
  }, [activeSource, isShowInfoLoading, podcast, sourceKind])

  return {
    activeSource,
    showHost,
    showTitleRaw,
    showTitleParts,
    showNetworkLabel,
    sectionTagLabel,
    showArtwork,
    libraryFeedsView,
    showDescription,
    showGenres,
  }
}
