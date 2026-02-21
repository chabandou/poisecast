import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'

type UseAudioReadyLoadingResetOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  loadingEpisodeId: string | null
  setLoadingEpisodeId: Dispatch<SetStateAction<string | null>>
}

const MIN_LOADING_VISIBLE_MS = 300

export function useAudioReadyLoadingReset({
  audioRef,
  loadingEpisodeId,
  setLoadingEpisodeId,
}: UseAudioReadyLoadingResetOptions): void {
  useEffect(() => {
    const element = audioRef.current
    if (!element || !loadingEpisodeId) return

    let clearTimerId: number | null = null
    const onReady = () => {
      if (clearTimerId !== null) window.clearTimeout(clearTimerId)
      clearTimerId = window.setTimeout(() => {
        setLoadingEpisodeId((prev) =>
          prev === loadingEpisodeId ? null : prev,
        )
        clearTimerId = null
      }, MIN_LOADING_VISIBLE_MS)
    }
    element.addEventListener('canplay', onReady)
    element.addEventListener('playing', onReady)

    return () => {
      if (clearTimerId !== null) window.clearTimeout(clearTimerId)
      element.removeEventListener('canplay', onReady)
      element.removeEventListener('playing', onReady)
    }
  }, [audioRef, loadingEpisodeId, setLoadingEpisodeId])
}
