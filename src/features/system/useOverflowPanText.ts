import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react'

type OverflowPanTextState = {
  overflow: boolean
  distance: number
}

type UseOverflowPanTextResult<T extends HTMLElement> = {
  ref: MutableRefObject<T | null>
  overflow: boolean
  distance: number
  style: CSSProperties
}

export function useOverflowPanText<T extends HTMLElement>(text: string): UseOverflowPanTextResult<T> {
  const ref = useRef<T | null>(null)
  const [state, setState] = useState<OverflowPanTextState>({ overflow: false, distance: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const container = element.parentElement
    if (!container) return

    const measure = () => {
      const overflowPx = Math.ceil(element.scrollWidth - container.clientWidth)
      if (overflowPx > 4) {
        setState((prev) => {
          if (prev.overflow && prev.distance === overflowPx) return prev
          return { overflow: true, distance: overflowPx }
        })
        return
      }
      setState((prev) => (prev.overflow || prev.distance !== 0 ? { overflow: false, distance: 0 } : prev))
    }

    measure()

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure)
      resizeObserver.observe(element)
      resizeObserver.observe(container)
    }
    window.addEventListener('resize', measure)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [text])

  const style = {
    ['--pc-pan-distance' as const]: `${state.distance}px`,
  } as CSSProperties

  return { ref, overflow: state.overflow, distance: state.distance, style }
}
