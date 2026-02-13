import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { PodcastEpisode } from '../../podcasts/types'
import { ignoreError } from '../system/errors'
import {
  cancelLatestAsyncRun,
  createLatestAsyncState,
  finishLatestAsyncRun,
  isLatestAsyncRunActive,
  startLatestAsyncRun,
} from '../system/latestAsync'
import type { IssueSource } from '../system/useIssueLog'

type ResetProcessingStateOptions = {
  canDenoise?: boolean | null
}

type UseEpisodePlaybackActionsOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  objectUrlRef: MutableRefObject<string | null>
  proxyBypassRef: MutableRefObject<Set<string>>
  proxyVerifiedRef: MutableRefObject<Set<string>>
  footerCloseTimerRef: MutableRefObject<number | null>
  episode: PodcastEpisode | null
  episodesAll: PodcastEpisode[]
  sourceKind: 'remote' | 'local'
  podcastImageUrl?: string | null
  rssUrl: string
  feedImages: Record<string, string>
  getRemotePlaybackUrl: (episode: PodcastEpisode) => string
  probeStreamProxy: (proxyUrl: string, options?: { signal?: AbortSignal }) => Promise<boolean>
  cancelFooterCloseTimer: () => void
  cancelFooterExpandTimer: () => void
  setLoadingEpisodeId: Dispatch<SetStateAction<string | null>>
  resetProcessingState: (opts?: ResetProcessingStateOptions) => void
  setEpisode: Dispatch<SetStateAction<PodcastEpisode | null>>
  setNowPlayingArtworkUrl: Dispatch<SetStateAction<string | null>>
  setSourceKind: Dispatch<SetStateAction<'remote' | 'local'>>
  setCanDenoise: Dispatch<SetStateAction<boolean | null>>
  setEngineDetail: (detail: string) => void
  reportIssue: (source: IssueSource, summary: string, detail: unknown) => void
  setIsFooterClosing: Dispatch<SetStateAction<boolean>>
  setIsFooterExpanding: Dispatch<SetStateAction<boolean>>
  setIsFooterExpanded: Dispatch<SetStateAction<boolean>>
  setIsFooterCollapsing: Dispatch<SetStateAction<boolean>>
  setIsSidebarCompact: Dispatch<SetStateAction<boolean>>
  onRequestShowDetails: () => void
  footerSlideMs?: number
}

type UseEpisodePlaybackActionsResult = {
  startEpisode: (episode: PodcastEpisode) => Promise<void>
  startLocalFile: (file: File) => Promise<void>
  playPrev: () => void
  playNext: () => void
  canPrev: boolean
  canNext: boolean
}

function isLikelyAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true
  return /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|webm|m4b|mp4)$/i.test(file.name)
}

export function useEpisodePlaybackActions({
  audioRef,
  objectUrlRef,
  proxyBypassRef,
  proxyVerifiedRef,
  footerCloseTimerRef,
  episode,
  episodesAll,
  sourceKind,
  podcastImageUrl,
  rssUrl,
  feedImages,
  getRemotePlaybackUrl,
  probeStreamProxy,
  cancelFooterCloseTimer,
  cancelFooterExpandTimer,
  setLoadingEpisodeId,
  resetProcessingState,
  setEpisode,
  setNowPlayingArtworkUrl,
  setSourceKind,
  setCanDenoise,
  setEngineDetail,
  reportIssue,
  setIsFooterClosing,
  setIsFooterExpanding,
  setIsFooterExpanded,
  setIsFooterCollapsing,
  setIsSidebarCompact,
  onRequestShowDetails,
  footerSlideMs = 500,
}: UseEpisodePlaybackActionsOptions): UseEpisodePlaybackActionsResult {
  const startEpisodeTaskRef = useRef(createLatestAsyncState())

  const stopEpisodeAndHideFooter = useCallback(() => {
    cancelFooterCloseTimer()
    cancelFooterExpandTimer()

    const audioEl = audioRef.current
    if (audioEl) {
      try {
        audioEl.pause()
      } catch {
        ignoreError()
      }
      audioEl.removeAttribute('crossorigin')
      audioEl.removeAttribute('src')
      audioEl.load()
    }

    setLoadingEpisodeId(null)
    resetProcessingState({ canDenoise: null })

    setIsFooterClosing(true)
    footerCloseTimerRef.current = window.setTimeout(() => {
      setEpisode(null)
      setNowPlayingArtworkUrl(null)
      setIsFooterClosing(false)
      setIsFooterExpanding(false)
      setIsFooterExpanded(false)
      setIsFooterCollapsing(false)
      setIsSidebarCompact(false)
      footerCloseTimerRef.current = null
    }, footerSlideMs + 20)
  }, [
    audioRef,
    cancelFooterCloseTimer,
    cancelFooterExpandTimer,
    footerCloseTimerRef,
    footerSlideMs,
    resetProcessingState,
    setEpisode,
    setIsFooterClosing,
    setIsFooterCollapsing,
    setIsFooterExpanded,
    setIsFooterExpanding,
    setIsSidebarCompact,
    setLoadingEpisodeId,
    setNowPlayingArtworkUrl,
  ])

  const startEpisode = useCallback(
    async (nextEpisode: PodcastEpisode) => {
      const run = startLatestAsyncRun(startEpisodeTaskRef.current)
      const isActive = () => isLatestAsyncRunActive(startEpisodeTaskRef.current, run)
      try {
        const audioEl = audioRef.current
        if (!audioEl) return
        cancelFooterCloseTimer()

        if (episode?.guid === nextEpisode.guid) {
          stopEpisodeAndHideFooter()
          return
        }
        setIsFooterClosing(false)

        setLoadingEpisodeId(nextEpisode.guid)
        setEpisode(nextEpisode)
        setNowPlayingArtworkUrl(podcastImageUrl || feedImages[rssUrl] || null)
        setSourceKind('remote')
        resetProcessingState({ canDenoise: null })

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = null
        }

        let playbackUrl = getRemotePlaybackUrl(nextEpisode)
        if (
          playbackUrl !== nextEpisode.enclosureUrl &&
          !proxyVerifiedRef.current.has(nextEpisode.guid)
        ) {
          const proxyOk = await probeStreamProxy(playbackUrl, { signal: run.signal })
          if (!isActive()) return
          if (!proxyOk) {
            proxyBypassRef.current.add(nextEpisode.guid)
            playbackUrl = nextEpisode.enclosureUrl
            setEngineDetail('Proxy unavailable for this episode. Using direct stream.')
          } else {
            proxyVerifiedRef.current.add(nextEpisode.guid)
          }
        }

        if (!isActive()) return
        audioEl.removeAttribute('crossorigin')
        audioEl.src = playbackUrl
        audioEl.load()

        try {
          await audioEl.play()
        } catch {
          // User gesture / autoplay restrictions.
        }

        if (!isActive()) return
        onRequestShowDetails()
      } finally {
        finishLatestAsyncRun(startEpisodeTaskRef.current, run)
      }
    },
    [
      audioRef,
      cancelFooterCloseTimer,
      episode?.guid,
      feedImages,
      getRemotePlaybackUrl,
      objectUrlRef,
      onRequestShowDetails,
      podcastImageUrl,
      probeStreamProxy,
      proxyBypassRef,
      proxyVerifiedRef,
      resetProcessingState,
      rssUrl,
      setEngineDetail,
      setEpisode,
      setIsFooterClosing,
      setLoadingEpisodeId,
      setNowPlayingArtworkUrl,
      setSourceKind,
      stopEpisodeAndHideFooter,
    ],
  )

  const startLocalFile = useCallback(
    async (file: File) => {
      cancelLatestAsyncRun(startEpisodeTaskRef.current)

      const audioEl = audioRef.current
      if (!audioEl) return
      if (!isLikelyAudioFile(file)) {
        const message = 'File is not recognized as audio. Try MP3, M4A, WAV, FLAC, or OGG.'
        setEngineDetail(message)
        reportIssue('audio', 'Unsupported local audio file', message)
        return
      }

      cancelFooterCloseTimer()
      setIsFooterClosing(false)
      resetProcessingState({ canDenoise: null })

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }

      const objectUrl = URL.createObjectURL(file)
      objectUrlRef.current = objectUrl

      setSourceKind('local')
      const localEpisode: PodcastEpisode = {
        guid: `local:${file.name}:${file.size}:${file.lastModified}`,
        title: file.name,
        enclosureUrl: objectUrl,
      }
      setLoadingEpisodeId(localEpisode.guid)
      setEpisode(localEpisode)
      setNowPlayingArtworkUrl(null)
      setCanDenoise(true)

      try {
        audioEl.pause()
      } catch {
        ignoreError()
      }
      audioEl.removeAttribute('crossorigin')
      audioEl.src = objectUrl
      audioEl.load()
      try {
        await audioEl.play()
      } catch {
        ignoreError()
      }

      onRequestShowDetails()
    },
    [
      audioRef,
      cancelFooterCloseTimer,
      objectUrlRef,
      onRequestShowDetails,
      reportIssue,
      resetProcessingState,
      setCanDenoise,
      setEngineDetail,
      setEpisode,
      setIsFooterClosing,
      setLoadingEpisodeId,
      setNowPlayingArtworkUrl,
      setSourceKind,
    ],
  )

  useEffect(() => {
    const startEpisodeTaskState = startEpisodeTaskRef.current
    return () => {
      cancelLatestAsyncRun(startEpisodeTaskState)
    }
  }, [])

  const currentEpisodeIndex = useMemo(() => {
    if (!episode || sourceKind !== 'remote' || !episodesAll.length) return -1
    return episodesAll.findIndex((item) => item.guid === episode.guid)
  }, [episode, episodesAll, sourceKind])

  const canPrev = currentEpisodeIndex > 0
  const canNext = currentEpisodeIndex >= 0 && currentEpisodeIndex < episodesAll.length - 1

  const playPrev = useCallback(() => {
    if (!canPrev) return
    const prevEpisode = episodesAll[currentEpisodeIndex - 1]
    if (prevEpisode) void startEpisode(prevEpisode)
  }, [canPrev, currentEpisodeIndex, episodesAll, startEpisode])

  const playNext = useCallback(() => {
    if (!canNext) return
    const nextEpisode = episodesAll[currentEpisodeIndex + 1]
    if (nextEpisode) void startEpisode(nextEpisode)
  }, [canNext, currentEpisodeIndex, episodesAll, startEpisode])

  return {
    startEpisode,
    startLocalFile,
    playPrev,
    playNext,
    canPrev,
    canNext,
  }
}
