import { useEffect, useRef, type RefObject } from 'react'
import lottie, { type AnimationItem } from 'lottie-web'

export type UseLottieOptions = {
  animationData: unknown
  loop?: boolean
  autoplay?: boolean
  playOnHover?: boolean
  enabled?: boolean
  hoverRef?: RefObject<HTMLElement>
}

export function useLottie({
  animationData,
  loop = false,
  autoplay = false,
  playOnHover = false,
  enabled = true,
  hoverRef,
}: UseLottieOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const animRef = useRef<AnimationItem | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (!enabled) {
      animRef.current?.destroy()
      animRef.current = null
      return
    }

    const anim = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop,
      autoplay,
      animationData,
    })
    animRef.current = anim

    if (!autoplay) anim.goToAndStop(0, true)

    let hoverEl: HTMLElement | null = null
    let onEnter: (() => void) | null = null
    let onLeave: (() => void) | null = null

    if (playOnHover) {
      hoverEl = hoverRef?.current ?? container
      onEnter = () => {
        anim.goToAndPlay(0, true)
      }
      onLeave = () => {
        anim.stop()
        anim.goToAndStop(0, true)
      }
      hoverEl.addEventListener('mouseenter', onEnter)
      hoverEl.addEventListener('mouseleave', onLeave)
    }

    return () => {
      if (hoverEl && onEnter && onLeave) {
        hoverEl.removeEventListener('mouseenter', onEnter)
        hoverEl.removeEventListener('mouseleave', onLeave)
      }
      anim.destroy()
      animRef.current = null
    }
  }, [animationData, autoplay, enabled, hoverRef, loop, playOnHover])

  return { containerRef, animRef }
}
