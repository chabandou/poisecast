import { useMemo } from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import type { ParsedPodcast } from '../../podcasts/types'
import { normalizeFeedUrlKey, type LibraryFeedStats } from './feedUtils'

export type LibrarySortMode = 'updated' | 'alpha' | 'count'

export type LibraryFeedViewItem = DefaultFeed & {
  imageUrl: string | null
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
  libraryQuery: string
  librarySortMode: LibrarySortMode
  libraryStatsByUrl: Record<string, LibraryFeedStats>
  loadingFeedUrl: string | null
  sourceKind: 'remote' | 'local'
}

type TitleParts = { head: string; accent?: string }

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
  libraryQuery,
  librarySortMode,
  libraryStatsByUrl,
  loadingFeedUrl,
  sourceKind,
}: UseFeedPresentationModelOptions) {
  const activeSource = useMemo(
    () =>
      libraryFeeds.find((feed) => normalizeFeedUrlKey(feed.rssUrl) === normalizeFeedUrlKey(rssUrl)),
    [libraryFeeds, rssUrl],
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
    const filtered = libraryFeeds
      .filter((feed) => {
        if (!normalizedQuery) return true
        return (
          feed.title.toLowerCase().includes(normalizedQuery) ||
          feed.rssUrl.toLowerCase().includes(normalizedQuery)
        )
      })
      .map((feed) => {
        const stats = libraryStatsByUrl[feed.rssUrl]
        return {
          ...feed,
          imageUrl: libraryImageByUrl[feed.rssUrl] ?? null,
          episodeCount: stats?.episodeCount ?? 0,
          latestPubMs: stats?.latestPubMs ?? null,
          isActive: normalizeFeedUrlKey(feed.rssUrl) === normalizeFeedUrlKey(rssUrl),
          isLoading:
            loadingFeedUrl !== null &&
            normalizeFeedUrlKey(feed.rssUrl) === normalizeFeedUrlKey(loadingFeedUrl),
        }
      })

    filtered.sort((a, b) => {
      if (librarySortMode === 'alpha') {
        return a.title.localeCompare(b.title)
      }
      if (librarySortMode === 'count') {
        if (a.episodeCount !== b.episodeCount) {
          return b.episodeCount - a.episodeCount
        }
        return a.title.localeCompare(b.title)
      }
      const aLatest = a.latestPubMs
      const bLatest = b.latestPubMs
      if (aLatest === null && bLatest !== null) return 1
      if (aLatest !== null && bLatest === null) return -1
      if (aLatest !== null && bLatest !== null && aLatest !== bLatest) {
        return bLatest - aLatest
      }
      return a.title.localeCompare(b.title)
    })

    return filtered
  }, [
    libraryFeeds,
    libraryImageByUrl,
    libraryQuery,
    librarySortMode,
    libraryStatsByUrl,
    loadingFeedUrl,
    rssUrl,
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
