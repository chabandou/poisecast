import { useEffect, useState } from 'react'
import {
  PLAYBACK_LOADING_FRAME_MS,
  PLAYBACK_LOADING_FRAMES,
} from './playbackLoadingGlyph'

export function usePlaybackLoadingGlyph(isLoading: boolean): string {
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    if (!isLoading) return

    const timerId = window.setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % PLAYBACK_LOADING_FRAMES.length)
    }, PLAYBACK_LOADING_FRAME_MS)

    return () => {
      window.clearInterval(timerId)
    }
  }, [isLoading])

  return isLoading
    ? PLAYBACK_LOADING_FRAMES[frameIndex]
    : PLAYBACK_LOADING_FRAMES[0]
}
