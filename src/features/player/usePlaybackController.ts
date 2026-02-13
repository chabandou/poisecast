import { useCallback, useEffect, useState, type RefObject } from 'react'
import { ignoreError } from '../system/errors'

type UsePlaybackControllerOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  initialVolume?: number
  onPlaybackError?: (message: string) => void
  trackTimeline?: boolean
}

type PlaybackController = {
  isPlaying: boolean
  currentTime: number
  duration: number | null
  volume: number
  lastNonZeroVolume: number
  setVolumeClamped: (next: number) => void
  togglePlayPause: () => Promise<void>
  seekToPct: (pct: number) => void
  seekBySeconds: (deltaSeconds: number) => void
  toggleMute: () => void
  setCurrentTime: (next: number) => void
  setDuration: (next: number | null) => void
}

export function usePlaybackController({
  audioRef,
  initialVolume = 0.66,
  onPlaybackError,
  trackTimeline = true,
}: UsePlaybackControllerOptions): PlaybackController {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)
  const [volume, setVolume] = useState(initialVolume)
  const [lastNonZeroVolume, setLastNonZeroVolume] = useState(initialVolume)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const onTime = () => setCurrentTime(Number.isFinite(el.currentTime) ? el.currentTime : 0)
    const onDur = () => setDuration(Number.isFinite(el.duration) ? el.duration : null)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => setIsPlaying(false)
    const onError = () => {
      const mediaError = el.error
      const mediaMessage = mediaError
        ? `code ${mediaError.code}: ${mediaError.message || 'Media playback error'}`
        : 'Unknown audio playback error'
      onPlaybackError?.(mediaMessage)
    }

    if (trackTimeline) {
      el.addEventListener('timeupdate', onTime)
      el.addEventListener('durationchange', onDur)
      el.addEventListener('loadedmetadata', onDur)
      onTime()
      onDur()
    }
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    el.addEventListener('error', onError)

    setIsPlaying(!el.paused)

    return () => {
      if (trackTimeline) {
        el.removeEventListener('timeupdate', onTime)
        el.removeEventListener('durationchange', onDur)
        el.removeEventListener('loadedmetadata', onDur)
      }
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onError)
    }
  }, [audioRef, onPlaybackError, trackTimeline])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = volume
    el.muted = volume === 0
  }, [audioRef, volume])

  const setVolumeClamped = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next))
    setVolume(clamped)
    if (clamped > 0) setLastNonZeroVolume(clamped)
  }, [])

  const togglePlayPause = useCallback(async () => {
    const el = audioRef.current
    if (!el) return
    try {
      if (el.paused) await el.play()
      else el.pause()
    } catch {
      // Autoplay restrictions; ignore.
    }
  }, [audioRef])

  const seekToPct = useCallback(
    (pct: number) => {
      const el = audioRef.current
      if (!el) return
      const maxDuration =
        Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : duration
      if (!maxDuration || maxDuration <= 0) return
      const next = Math.max(0, Math.min(maxDuration, pct * maxDuration))
      try {
        el.currentTime = next
      } catch {
        ignoreError()
      }
    },
    [audioRef, duration],
  )

  const seekBySeconds = useCallback(
    (deltaSeconds: number) => {
      const el = audioRef.current
      if (!el) return

      const current = Number.isFinite(el.currentTime) ? el.currentTime : 0
      const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null
      const unclamped = current + deltaSeconds
      const next = max === null ? Math.max(0, unclamped) : Math.max(0, Math.min(max, unclamped))

      try {
        el.currentTime = next
      } catch {
        ignoreError()
      }
    },
    [audioRef],
  )

  const toggleMute = useCallback(() => {
    if (volume === 0) {
      setVolumeClamped(lastNonZeroVolume > 0 ? lastNonZeroVolume : initialVolume)
      return
    }
    setVolumeClamped(0)
  }, [initialVolume, lastNonZeroVolume, setVolumeClamped, volume])

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    lastNonZeroVolume,
    setVolumeClamped,
    togglePlayPause,
    seekToPct,
    seekBySeconds,
    toggleMute,
    setCurrentTime,
    setDuration,
  }
}
