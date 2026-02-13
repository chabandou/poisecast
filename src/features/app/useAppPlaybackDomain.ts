import { useCallback, useState, type RefObject } from 'react'
import { usePlaybackController } from '../player/usePlaybackController'
import type { IssueSource } from '../system/useIssueLog'

type UseAppPlaybackDomainOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  reportIssue: (source: IssueSource, summary: string, detail: unknown) => void
}

export function useAppPlaybackDomain({
  audioRef,
  reportIssue,
}: UseAppPlaybackDomainOptions) {
  const [isFooterClosing, setIsFooterClosing] = useState(false)
  const [isFooterCollapsing, setIsFooterCollapsing] = useState(false)
  const [isFooterExpanding, setIsFooterExpanding] = useState(false)
  const [isFooterExpanded, setIsFooterExpanded] = useState(false)
  const [isSidebarCompact, setIsSidebarCompact] = useState(false)

  const handlePlaybackError = useCallback(
    (message: string) => {
      reportIssue('audio', 'Audio playback error', message)
    },
    [reportIssue],
  )

  const {
    isPlaying,
    volume,
    setVolumeClamped,
    togglePlayPause,
    seekToPct,
    seekBySeconds: seekBySecondsRaw,
    toggleMute,
  } = usePlaybackController({
    audioRef,
    onPlaybackError: handlePlaybackError,
    trackTimeline: false,
  })

  return {
    isPlaying,
    volume,
    setVolumeClamped,
    togglePlayPause,
    seekToPct,
    seekBySecondsRaw,
    toggleMute,
    isFooterClosing,
    setIsFooterClosing,
    isFooterCollapsing,
    setIsFooterCollapsing,
    isFooterExpanding,
    setIsFooterExpanding,
    isFooterExpanded,
    setIsFooterExpanded,
    isSidebarCompact,
    setIsSidebarCompact,
  }
}
