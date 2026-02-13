import { useEffect, useMemo, useState, type RefObject } from 'react'

type UseAudioTimelineOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  isActive: boolean
}

type UseAudioTimelineResult = {
  currentTime: number
  duration: number | null
  progressPct: number
}

export function useAudioTimeline({
  audioRef,
  isActive,
}: UseAudioTimelineOptions): UseAudioTimelineResult {
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)

  useEffect(() => {
    if (!isActive) return

    const element = audioRef.current
    if (!element) return

    const onTime = () => {
      setCurrentTime(Number.isFinite(element.currentTime) ? element.currentTime : 0)
    }
    const onDuration = () => {
      setDuration(Number.isFinite(element.duration) ? element.duration : null)
    }

    element.addEventListener('timeupdate', onTime)
    element.addEventListener('durationchange', onDuration)
    element.addEventListener('loadedmetadata', onDuration)

    onTime()
    onDuration()

    return () => {
      element.removeEventListener('timeupdate', onTime)
      element.removeEventListener('durationchange', onDuration)
      element.removeEventListener('loadedmetadata', onDuration)
    }
  }, [audioRef, isActive])

  const progressPct = useMemo(() => {
    if (!duration || duration <= 0) return 0
    return Math.max(0, Math.min(1, currentTime / duration))
  }, [currentTime, duration])

  return {
    currentTime,
    duration,
    progressPct,
  }
}
