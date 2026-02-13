import { useEffect, type RefObject } from 'react'
import type { PodcastEpisode } from '../../podcasts/types'
import { ignoreError } from '../system/errors'
import { toAbsoluteUrl } from '../system/url'

const MEDIA_SESSION_ACTIONS: MediaSessionAction[] = [
  'play',
  'pause',
  'stop',
  'seekbackward',
  'seekforward',
  'seekto',
  'previoustrack',
  'nexttrack',
]

const MEDIA_SESSION_ARTWORK_SIZES = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512'] as const

type UseMediaSessionControllerOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  episode: PodcastEpisode | null
  sourceKind: 'remote' | 'local'
  nowPlayingArtworkUrl: string | null
  podcastTitle?: string
  seekBySeconds: (deltaSeconds: number) => void
  playPrev: () => void
  playNext: () => void
  canPrev: boolean
  canNext: boolean
  isPlaying: boolean
}

function clearMediaSessionActionHandlers(session: MediaSession): void {
  for (const action of MEDIA_SESSION_ACTIONS) {
    try {
      session.setActionHandler(action, null)
    } catch {
      ignoreError()
    }
  }
}

function inferArtworkMimeType(src: string): string | undefined {
  try {
    const path = new URL(src, window.location.href).pathname.toLowerCase()
    if (path.endsWith('.png')) return 'image/png'
    if (path.endsWith('.webp')) return 'image/webp'
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  } catch {
    ignoreError()
  }
  return undefined
}

function buildMediaSessionArtwork(src: string): MediaImage[] {
  const absoluteSrc = toAbsoluteUrl(src)
  const mimeType = inferArtworkMimeType(absoluteSrc)
  return MEDIA_SESSION_ARTWORK_SIZES.map((sizes) => {
    const image: MediaImage = { src: absoluteSrc, sizes }
    if (mimeType) image.type = mimeType
    return image
  })
}

export function useMediaSessionController({
  audioRef,
  episode,
  sourceKind,
  nowPlayingArtworkUrl,
  podcastTitle,
  seekBySeconds,
  playPrev,
  playNext,
  canPrev,
  canNext,
  isPlaying,
}: UseMediaSessionControllerOptions): void {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    const session = navigator.mediaSession
    if (!episode) {
      session.metadata = null
      session.playbackState = 'none'
      clearMediaSessionActionHandlers(session)
      return
    }

    const artworkSrc = sourceKind === 'local' ? '/icons/icon-512.png' : nowPlayingArtworkUrl || '/icons/icon-512.png'
    if (typeof MediaMetadata === 'function') {
      session.metadata = new MediaMetadata({
        title: episode.title || 'Unknown episode',
        artist: sourceKind === 'local' ? 'Local file' : (podcastTitle ?? 'Poisecast'),
        album: sourceKind === 'local' ? 'Poisecast' : (podcastTitle ?? 'Poisecast'),
        artwork: buildMediaSessionArtwork(artworkSrc),
      })
    } else {
      session.metadata = null
    }

    clearMediaSessionActionHandlers(session)
    try {
      session.setActionHandler('play', () => {
        const audioEl = audioRef.current
        if (!audioEl || !audioEl.paused) return
        void audioEl.play().catch(() => {})
      })
    } catch {
      ignoreError()
    }
    try {
      session.setActionHandler('pause', () => {
        const audioEl = audioRef.current
        if (!audioEl || audioEl.paused) return
        audioEl.pause()
      })
    } catch {
      ignoreError()
    }
    try {
      session.setActionHandler('stop', () => {
        const audioEl = audioRef.current
        if (!audioEl) return
        audioEl.pause()
        try {
          audioEl.currentTime = 0
        } catch {
          ignoreError()
        }
      })
    } catch {
      ignoreError()
    }
    try {
      session.setActionHandler('seekbackward', (details) => {
        const offset =
          typeof details.seekOffset === 'number' && Number.isFinite(details.seekOffset) ? details.seekOffset : 10
        seekBySeconds(-offset)
      })
    } catch {
      ignoreError()
    }
    try {
      session.setActionHandler('seekforward', (details) => {
        const offset =
          typeof details.seekOffset === 'number' && Number.isFinite(details.seekOffset) ? details.seekOffset : 10
        seekBySeconds(offset)
      })
    } catch {
      ignoreError()
    }
    try {
      session.setActionHandler('seekto', (details) => {
        const audioEl = audioRef.current
        if (!audioEl) return
        if (typeof details.seekTime !== 'number' || !Number.isFinite(details.seekTime)) return

        const max = Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : details.seekTime
        const next = Math.max(0, Math.min(max, details.seekTime))
        try {
          if (details.fastSeek && typeof audioEl.fastSeek === 'function') audioEl.fastSeek(next)
          else audioEl.currentTime = next
        } catch {
          ignoreError()
        }
      })
    } catch {
      ignoreError()
    }
    if (canPrev) {
      try {
        session.setActionHandler('previoustrack', playPrev)
      } catch {
        ignoreError()
      }
    }
    if (canNext) {
      try {
        session.setActionHandler('nexttrack', playNext)
      } catch {
        ignoreError()
      }
    }

    return () => {
      clearMediaSessionActionHandlers(session)
    }
  }, [
    audioRef,
    canNext,
    canPrev,
    episode,
    nowPlayingArtworkUrl,
    playNext,
    playPrev,
    podcastTitle,
    seekBySeconds,
    sourceKind,
  ])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = episode ? (isPlaying ? 'playing' : 'paused') : 'none'
  }, [episode, isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !episode) return
    const audioEl = audioRef.current
    if (!audioEl) return

    const syncPositionState = () => {
      const duration = Number.isFinite(audioEl.duration) ? audioEl.duration : null
      if (!duration || duration <= 0) return
      const playbackRateRaw = audioEl.playbackRate
      const playbackRate =
        typeof playbackRateRaw === 'number' && Number.isFinite(playbackRateRaw)
          ? playbackRateRaw
          : 1
      const positionRaw = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0
      const position = Math.max(0, Math.min(duration, positionRaw))
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate,
          position,
        })
      } catch {
        ignoreError()
      }
    }

    audioEl.addEventListener('timeupdate', syncPositionState)
    audioEl.addEventListener('durationchange', syncPositionState)
    audioEl.addEventListener('loadedmetadata', syncPositionState)
    syncPositionState()

    return () => {
      audioEl.removeEventListener('timeupdate', syncPositionState)
      audioEl.removeEventListener('durationchange', syncPositionState)
      audioEl.removeEventListener('loadedmetadata', syncPositionState)
    }
  }, [audioRef, episode])
}
