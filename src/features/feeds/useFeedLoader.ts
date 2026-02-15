import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { PodcastEpisode, ParsedPodcast } from '../../podcasts/types'
import { FeedRepository, type IFeedRepository } from './feedRepository'
import { summarizeFeedStats } from './feedUtils'
import { ignoreError } from '../system/errors'
import {
  loadPersistedFeedCache,
  loadPersistedFeedImages,
  persistFeedCache,
  persistFeedImages,
} from './feedCacheStorage'
import {
  cancelLatestAsyncRun,
  createLatestAsyncState,
  finishLatestAsyncRun,
  isAbortError,
  isLatestAsyncRunActive,
  startLatestAsyncRun,
} from '../system/latestAsync'

export type LibraryFeedStats = { episodeCount: number; latestPubMs: number | null }

type FeedLookupMeta = {
  artworkUrl: string | null
  genres: string[]
}

type ResetProcessingStateOptions = {
  canDenoise?: boolean | null
}

type UseFeedLoaderOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  currentEpisodeGuid?: string
  cancelFooterCloseTimer: () => void
  setIsFooterClosing: (next: boolean) => void
  setEpisode: Dispatch<SetStateAction<PodcastEpisode | null>>
  setNowPlayingArtworkUrl: Dispatch<SetStateAction<string | null>>
  setSourceKind: Dispatch<SetStateAction<'remote' | 'local'>>
  resetProcessingState: (opts?: ResetProcessingStateOptions) => void
  setEpisodeQuery: Dispatch<SetStateAction<string>>
  feedCacheKey?: string
  feedImageCacheKey?: string
  maxFeedCache?: number
  repository?: IFeedRepository
  repositoryFeedCacheMaxEntries?: number
  repositoryLookupCacheMaxEntries?: number
  repositoryFeedCacheTtlMs?: number | null
  repositoryLookupCacheTtlMs?: number | null
}

type UseFeedLoaderResult = {
  rssLoading: boolean
  rssError: string | null
  podcast: ParsedPodcast | null
  loadingFeedUrl: string | null
  feedImages: Record<string, string>
  libraryArtworkLoadingByUrl: Record<string, boolean>
  libraryStatsByUrl: Record<string, LibraryFeedStats>
  loadFeed: (url: string) => Promise<void>
  initializeFeedCaches: () => void
  fetchLibraryFeedArtwork: (url: string) => Promise<void>
}

export function useFeedLoader({
  audioRef,
  currentEpisodeGuid,
  cancelFooterCloseTimer,
  setIsFooterClosing,
  setEpisode,
  setNowPlayingArtworkUrl,
  setSourceKind,
  resetProcessingState,
  setEpisodeQuery,
  feedCacheKey = 'poisecast.feedCache.v1',
  feedImageCacheKey = 'poisecast.feedImageCache.v1',
  maxFeedCache = 20,
  repository,
  repositoryFeedCacheMaxEntries,
  repositoryLookupCacheMaxEntries,
  repositoryFeedCacheTtlMs = null,
  repositoryLookupCacheTtlMs = null,
}: UseFeedLoaderOptions): UseFeedLoaderResult {
  const feedCacheRef = useRef<Map<string, ParsedPodcast>>(new Map())
  const feedImageFetchRef = useRef<Set<string>>(new Set())
  const feedImagesRef = useRef<Record<string, string>>({})
  const loadFeedTaskRef = useRef(createLatestAsyncState())
  const repositoryRef = useRef<IFeedRepository | null>(null)

  if (!repositoryRef.current) {
    repositoryRef.current =
      repository ??
      new FeedRepository({
        feedCacheMaxEntries: repositoryFeedCacheMaxEntries ?? maxFeedCache,
        lookupCacheMaxEntries: repositoryLookupCacheMaxEntries ?? maxFeedCache,
        feedCacheTtlMs: repositoryFeedCacheTtlMs,
        lookupCacheTtlMs: repositoryLookupCacheTtlMs,
      })
  }
  const repositoryImpl = repositoryRef.current

  const [rssLoading, setRssLoading] = useState(false)
  const [rssError, setRssError] = useState<string | null>(null)
  const [podcast, setPodcast] = useState<ParsedPodcast | null>(null)
  const [loadingFeedUrl, setLoadingFeedUrl] = useState<string | null>(null)
  const [feedImages, setFeedImages] = useState<Record<string, string>>({})
  const [libraryArtworkLoadingByUrl, setLibraryArtworkLoadingByUrl] = useState<
    Record<string, boolean>
  >({})
  const [libraryStatsByUrl, setLibraryStatsByUrl] = useState<Record<string, LibraryFeedStats>>({})

  useEffect(() => {
    feedImagesRef.current = feedImages
  }, [feedImages])

  const fetchFeedLookupMeta = useCallback(async (rssUrl: string, signal?: AbortSignal): Promise<FeedLookupMeta | null> => {
    return repositoryImpl.loadLookupMeta(rssUrl, { signal })
  }, [repositoryImpl])

  const fetchFeedArtwork = useCallback(async (rssUrl: string, signal?: AbortSignal): Promise<string | null> => {
    try {
      const parsed = await repositoryImpl.loadFeed(rssUrl, { signal })
      const feedImage = parsed.feed.imageUrl?.trim()
      if (feedImage) return feedImage
    } catch {
      // Fall through to lookup fallback below.
    }
    const meta = await fetchFeedLookupMeta(rssUrl, signal)
    return meta?.artworkUrl ?? null
  }, [fetchFeedLookupMeta, repositoryImpl])

  const initializeFeedCaches = useCallback(() => {
    try {
      const persistedFeedCache = loadPersistedFeedCache(localStorage, feedCacheKey, maxFeedCache)
      feedCacheRef.current = persistedFeedCache.value
      if (persistedFeedCache.migratedFromLegacy) {
        try {
          persistFeedCache(localStorage, feedCacheKey, feedCacheRef.current)
        } catch {
          ignoreError()
        }
      }

      const seededLibraryStats: Record<string, LibraryFeedStats> = {}
      for (const [url, cachedPodcast] of feedCacheRef.current.entries()) {
        seededLibraryStats[url] = summarizeFeedStats(cachedPodcast)
      }
      setLibraryStatsByUrl(seededLibraryStats)

      const persistedFeedImages = loadPersistedFeedImages(localStorage, feedImageCacheKey)
      setFeedImages(persistedFeedImages.value)
      if (persistedFeedImages.migratedFromLegacy) {
        try {
          persistFeedImages(localStorage, feedImageCacheKey, persistedFeedImages.value)
        } catch {
          ignoreError()
        }
      }
    } catch {
      ignoreError()
    }
  }, [feedCacheKey, feedImageCacheKey, maxFeedCache])

  const loadFeed = useCallback(async (url: string) => {
    const run = startLatestAsyncRun(loadFeedTaskRef.current)
    const isActive = () => isLatestAsyncRunActive(loadFeedTaskRef.current, run)

    cancelFooterCloseTimer()
    setIsFooterClosing(false)
    setLoadingFeedUrl(url)
    setRssLoading(true)
    setRssError(null)
    setPodcast(null)

    const audioEl = audioRef.current
    const shouldKeepCurrentEpisode =
      Boolean(currentEpisodeGuid) &&
      Boolean(audioEl) &&
      Boolean(audioEl?.src) &&
      !audioEl?.ended &&
      (!audioEl?.paused || (Number.isFinite(audioEl?.currentTime) && (audioEl?.currentTime ?? 0) > 0))

    if (!shouldKeepCurrentEpisode) {
      setEpisode(null)
      setNowPlayingArtworkUrl(null)
    }

    setSourceKind('remote')
    resetProcessingState({ canDenoise: null })
    setEpisodeQuery('')

    try {
      if (!isActive()) return
      const cached = feedCacheRef.current.get(url)
      let parsed = cached ?? (await repositoryImpl.loadFeed(url, { signal: run.signal }))
      if (!isActive()) return
      let cacheDirty = !cached

      let lookup: FeedLookupMeta | null = null
      if (!parsed.feed?.imageUrl || !parsed.feed?.genres?.length) {
        lookup = await fetchFeedLookupMeta(url, run.signal)
        if (!isActive()) return
      }

      if ((!parsed.feed?.genres || parsed.feed.genres.length === 0) && lookup?.genres?.length) {
        parsed = {
          ...parsed,
          feed: {
            ...parsed.feed,
            genres: lookup.genres,
          },
        }
        cacheDirty = true
      }

      if (cacheDirty) {
        feedCacheRef.current.set(url, parsed)
        if (feedCacheRef.current.size > maxFeedCache) {
          const firstKey = feedCacheRef.current.keys().next().value as string | undefined
          if (firstKey) feedCacheRef.current.delete(firstKey)
        }
        try {
          persistFeedCache(localStorage, feedCacheKey, feedCacheRef.current)
        } catch {
          ignoreError()
        }
      }

      const bestImage = parsed.feed?.imageUrl || lookup?.artworkUrl || null
      if (bestImage) {
        setFeedImages((prev) => {
          if (prev[url] === bestImage) return prev
          const next = { ...prev, [url]: bestImage }
          try {
            persistFeedImages(localStorage, feedImageCacheKey, next)
          } catch {
            ignoreError()
          }
          return next
        })
      }

      const nextStats = summarizeFeedStats(parsed)
      if (!isActive()) return
      setLibraryStatsByUrl((prev) => {
        const existing = prev[url]
        if (
          existing &&
          existing.episodeCount === nextStats.episodeCount &&
          existing.latestPubMs === nextStats.latestPubMs
        ) {
          return prev
        }
        return { ...prev, [url]: nextStats }
      })
      setPodcast(parsed)
    } catch (error) {
      if (isAbortError(error) || run.signal.aborted || !isActive()) return
      const message = error instanceof Error ? error.message : String(error)
      setRssError(
        [
          message,
          '',
          'If this is a CORS error:',
          '1) Some RSS hosts block browser fetch. Try a different feed, or paste a CORS-friendly mirror.',
          '2) For denoising, the episode audio must allow CORS OR you must import a downloaded file.',
        ].join('\n'),
      )
    } finally {
      if (isActive()) {
        setRssLoading(false)
        setLoadingFeedUrl(null)
      }
      finishLatestAsyncRun(loadFeedTaskRef.current, run)
    }
  }, [
    audioRef,
    cancelFooterCloseTimer,
    currentEpisodeGuid,
    feedCacheKey,
    feedImageCacheKey,
    fetchFeedLookupMeta,
    maxFeedCache,
    repositoryImpl,
    resetProcessingState,
    setEpisode,
    setEpisodeQuery,
    setIsFooterClosing,
    setNowPlayingArtworkUrl,
    setSourceKind,
  ])

  const fetchLibraryFeedArtwork = useCallback(async (url: string) => {
    if (!url || feedImagesRef.current[url] || feedImageFetchRef.current.has(url)) return
    feedImageFetchRef.current.add(url)
    setLibraryArtworkLoadingByUrl((prev) => {
      if (prev[url]) return prev
      return { ...prev, [url]: true }
    })
    try {
      const artwork = await fetchFeedArtwork(url)
      if (!artwork) return
      setFeedImages((prev) => {
        if (prev[url] === artwork) return prev
        const next = { ...prev, [url]: artwork }
        try {
          persistFeedImages(localStorage, feedImageCacheKey, next)
        } catch {
          ignoreError()
        }
        return next
      })
    } finally {
      feedImageFetchRef.current.delete(url)
      setLibraryArtworkLoadingByUrl((prev) => {
        if (!prev[url]) return prev
        const next = { ...prev }
        delete next[url]
        return next
      })
    }
  }, [feedImageCacheKey, fetchFeedArtwork])

  useEffect(() => {
    const loadFeedTaskState = loadFeedTaskRef.current
    return () => {
      cancelLatestAsyncRun(loadFeedTaskState)
    }
  }, [])

  return {
    rssLoading,
    rssError,
    podcast,
    loadingFeedUrl,
    feedImages,
    libraryArtworkLoadingByUrl,
    libraryStatsByUrl,
    loadFeed,
    initializeFeedCaches,
    fetchLibraryFeedArtwork,
  }
}
