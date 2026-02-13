import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

type UseFooterDescriptionControllerOptions = {
  episodeGuid?: string
  isFooterExpanded: boolean
  footerDescriptionHtml: string
}

export function useFooterDescriptionController({
  episodeGuid,
  isFooterExpanded,
  footerDescriptionHtml,
}: UseFooterDescriptionControllerOptions) {
  const footerDescriptionRef = useRef<HTMLDivElement | null>(null)
  const [expandedContextKey, setExpandedContextKey] = useState<string | null>(null)
  const [measuredOverflow, setMeasuredOverflow] = useState(false)
  const [measuredExpandedMaxHeight, setMeasuredExpandedMaxHeight] = useState(0)
  const measureContextKey = `${episodeGuid ?? ''}:${isFooterExpanded ? '1' : '0'}`
  const isMeasureActive = isFooterExpanded && Boolean(episodeGuid)
  const isFooterDescriptionExpanded = expandedContextKey === measureContextKey
  const isFooterDescriptionOverflowing = isMeasureActive ? measuredOverflow : false
  const footerDescriptionExpandedMaxHeight = isMeasureActive ? measuredExpandedMaxHeight : 0

  const footerDescriptionStyle: CSSProperties | undefined = useMemo(
    () =>
      footerDescriptionExpandedMaxHeight > 0
        ? ({
            ['--pc-footer-description-expanded-height' as const]: `${footerDescriptionExpandedMaxHeight}px`,
          } as CSSProperties)
        : undefined,
    [footerDescriptionExpandedMaxHeight],
  )

  const toggleFooterDescriptionExpanded = useCallback(() => {
    setExpandedContextKey((prev) => (prev === measureContextKey ? null : measureContextKey))
  }, [measureContextKey])

  const measureFooterDescriptionOverflow = useCallback(() => {
    const element = footerDescriptionRef.current
    if (!element) {
      setMeasuredOverflow(false)
      setMeasuredExpandedMaxHeight(0)
      return
    }

    const parent = element.parentElement
    if (!parent) {
      setMeasuredOverflow(false)
      setMeasuredExpandedMaxHeight(0)
      return
    }

    const width = element.clientWidth || element.getBoundingClientRect().width
    if (!Number.isFinite(width) || width <= 0) {
      setMeasuredOverflow(false)
      setMeasuredExpandedMaxHeight(0)
      return
    }

    const makeMeasureClone = (): HTMLDivElement => {
      const clone = element.cloneNode(true) as HTMLDivElement
      clone.style.position = 'absolute'
      clone.style.visibility = 'hidden'
      clone.style.pointerEvents = 'none'
      clone.style.inset = '0 auto auto 0'
      clone.style.width = `${width}px`
      return clone
    }

    const expandedClone = makeMeasureClone()
    expandedClone.classList.remove('isClamped')
    expandedClone.classList.add('isExpanded')
    expandedClone.style.maxHeight = 'none'
    parent.appendChild(expandedClone)
    const expandedHeight = Math.ceil(expandedClone.scrollHeight)
    expandedClone.remove()

    const clampedClone = makeMeasureClone()
    clampedClone.classList.remove('isExpanded')
    clampedClone.classList.add('isClamped')
    parent.appendChild(clampedClone)
    const clampedHeight = Math.ceil(clampedClone.clientHeight)
    clampedClone.remove()

    const overflow = expandedHeight - clampedHeight > 1
    setMeasuredExpandedMaxHeight(Math.max(expandedHeight, clampedHeight))
    setMeasuredOverflow(overflow)
  }, [])

  useEffect(() => {
    if (!isFooterExpanded || !episodeGuid) {
      return
    }

    let frame = 0
    const scheduleMeasure = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        measureFooterDescriptionOverflow()
      })
    }

    scheduleMeasure()
    window.addEventListener('resize', scheduleMeasure)

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null
    if (resizeObserver && footerDescriptionRef.current) {
      resizeObserver.observe(footerDescriptionRef.current)
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleMeasure)
      resizeObserver?.disconnect()
    }
  }, [
    episodeGuid,
    footerDescriptionHtml,
    isFooterDescriptionExpanded,
    isFooterExpanded,
    measureFooterDescriptionOverflow,
  ])

  return {
    footerDescriptionRef,
    footerDescriptionStyle,
    isFooterDescriptionExpanded,
    isFooterDescriptionOverflowing,
    toggleFooterDescriptionExpanded,
  }
}
