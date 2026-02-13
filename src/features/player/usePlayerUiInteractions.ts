import {
  useCallback,
  type Dispatch,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
  type SetStateAction,
  type WheelEvent,
} from 'react'

type UsePlayerUiInteractionsOptions = {
  seekToPct: (pct: number) => void
  seekBySeconds: (deltaSeconds: number) => void
  setVolumeClamped: (next: number) => void
  volume: number
  hasEpisode: boolean
  isMobile: boolean
  isFooterClosing: boolean
  isFooterExpanded: boolean
  isFooterExpanding: boolean
  footerExpandTimerRef: MutableRefObject<number | null>
  cancelFooterExpandTimer: () => void
  setIsFooterCollapsing: Dispatch<SetStateAction<boolean>>
  setIsFooterExpanded: Dispatch<SetStateAction<boolean>>
  setIsFooterExpanding: Dispatch<SetStateAction<boolean>>
  setIsSidebarCompact: Dispatch<SetStateAction<boolean>>
  footerExpandRevealMs: number
}

type UsePlayerUiInteractionsResult = {
  onProgressPointer: (event: PointerEvent<HTMLDivElement>) => void
  onMiniProgressPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onMiniProgressKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onVolumePointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onVolumeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onVolumeWheel: (event: WheelEvent<HTMLDivElement>) => void
  toggleFooterExpansion: () => void
}

export function usePlayerUiInteractions({
  seekToPct,
  seekBySeconds,
  setVolumeClamped,
  volume,
  hasEpisode,
  isMobile,
  isFooterClosing,
  isFooterExpanded,
  isFooterExpanding,
  footerExpandTimerRef,
  cancelFooterExpandTimer,
  setIsFooterCollapsing,
  setIsFooterExpanded,
  setIsFooterExpanding,
  setIsSidebarCompact,
  footerExpandRevealMs,
}: UsePlayerUiInteractionsOptions): UsePlayerUiInteractionsResult {
  const setSeekFromClientX = useCallback(
    (clientX: number, element: HTMLDivElement) => {
      const rect = element.getBoundingClientRect()
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
      const pct = rect.width > 0 ? x / rect.width : 0
      seekToPct(pct)
    },
    [seekToPct],
  )

  const onProgressPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const element = event.currentTarget
      const rect = element.getBoundingClientRect()
      const x = event.clientX - rect.left
      const pct = rect.width > 0 ? x / rect.width : 0
      seekToPct(pct)
    },
    [seekToPct],
  )

  const onMiniProgressPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const target = event.currentTarget
      const pointerId = event.pointerId
      setSeekFromClientX(event.clientX, target)
      target.setPointerCapture(pointerId)

      const onMove = (pointerEvent: globalThis.PointerEvent) => {
        if (pointerEvent.pointerId !== pointerId) return
        setSeekFromClientX(pointerEvent.clientX, target)
      }
      const onStop = (pointerEvent: globalThis.PointerEvent) => {
        if (pointerEvent.pointerId !== pointerId) return
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onStop)
        target.removeEventListener('pointercancel', onStop)
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
      }

      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onStop)
      target.addEventListener('pointercancel', onStop)
    },
    [setSeekFromClientX],
  )

  const onMiniProgressKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!hasEpisode) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault()
        seekBySeconds(10)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault()
        seekBySeconds(-10)
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        seekToPct(0)
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        seekToPct(1)
      }
    },
    [hasEpisode, seekBySeconds, seekToPct],
  )

  const setVolumeFromClientX = useCallback(
    (clientX: number, element: HTMLDivElement) => {
      const rect = element.getBoundingClientRect()
      const x = clientX - rect.left
      const pct = rect.width > 0 ? x / rect.width : 0
      setVolumeClamped(pct)
    },
    [setVolumeClamped],
  )

  const onVolumePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const target = event.currentTarget
      const pointerId = event.pointerId
      setVolumeFromClientX(event.clientX, target)
      target.setPointerCapture(pointerId)

      const onMove = (pointerEvent: globalThis.PointerEvent) => {
        if (pointerEvent.pointerId !== pointerId) return
        setVolumeFromClientX(pointerEvent.clientX, target)
      }
      const onStop = (pointerEvent: globalThis.PointerEvent) => {
        if (pointerEvent.pointerId !== pointerId) return
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onStop)
        target.removeEventListener('pointercancel', onStop)
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
      }

      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onStop)
      target.addEventListener('pointercancel', onStop)
    },
    [setVolumeFromClientX],
  )

  const onVolumeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = 0.05
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault()
        setVolumeClamped(volume + step)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault()
        setVolumeClamped(volume - step)
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        setVolumeClamped(0)
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        setVolumeClamped(1)
      }
    },
    [setVolumeClamped, volume],
  )

  const onVolumeWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault()
      if (event.deltaY === 0) return
      const direction = event.deltaY < 0 ? 1 : -1
      const step = event.shiftKey ? 0.1 : 0.04
      setVolumeClamped(volume + direction * step)
    },
    [setVolumeClamped, volume],
  )

  const toggleFooterExpansion = useCallback(() => {
    if (isFooterClosing) return

    if (isFooterExpanded) {
      cancelFooterExpandTimer()
      if (!isMobile) setIsSidebarCompact(false)

      setIsFooterCollapsing(true)
      footerExpandTimerRef.current = window.setTimeout(() => {
        setIsFooterExpanded(false)
        setIsFooterExpanding(false)
        footerExpandTimerRef.current = window.setTimeout(() => {
          setIsFooterCollapsing(false)
          footerExpandTimerRef.current = null
        }, 600)
      }, 120)
      return
    }

    if (isFooterExpanding) return

    if (isMobile) {
      setIsFooterExpanded(true)
      return
    }

    setIsFooterExpanding(true)
    setIsSidebarCompact(true)
    cancelFooterExpandTimer()
    const expandDelayMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : footerExpandRevealMs
    footerExpandTimerRef.current = window.setTimeout(() => {
      setIsFooterExpanded(true)
      setIsFooterExpanding(false)
      footerExpandTimerRef.current = null
    }, expandDelayMs)
  }, [
    cancelFooterExpandTimer,
    footerExpandRevealMs,
    footerExpandTimerRef,
    isFooterClosing,
    isFooterExpanded,
    isFooterExpanding,
    isMobile,
    setIsFooterCollapsing,
    setIsFooterExpanded,
    setIsFooterExpanding,
    setIsSidebarCompact,
  ])

  return {
    onProgressPointer,
    onMiniProgressPointerDown,
    onMiniProgressKeyDown,
    onVolumePointerDown,
    onVolumeKeyDown,
    onVolumeWheel,
    toggleFooterExpansion,
  }
}
