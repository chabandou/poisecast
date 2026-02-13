import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'

type UseAudioReadyLoadingResetOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  setLoadingEpisodeId: Dispatch<SetStateAction<string | null>>
}

export function useAudioReadyLoadingReset({
  audioRef,
  setLoadingEpisodeId,
}: UseAudioReadyLoadingResetOptions): void {
  useEffect(() => {
    const element = audioRef.current
    if (!element) return

    const onReady = () => setLoadingEpisodeId(null)
    element.addEventListener('canplay', onReady)
    element.addEventListener('playing', onReady)

    return () => {
      element.removeEventListener('canplay', onReady)
      element.removeEventListener('playing', onReady)
    }
  }, [audioRef, setLoadingEpisodeId])
}
