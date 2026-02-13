import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

type UseDiscoverSearchFocusOptions = {
  isMobile: boolean
  mobileView: string
  mobileDiscoverMode: string
}

type UseDiscoverSearchFocusResult = {
  discoverSearchInputRef: MutableRefObject<HTMLInputElement | null>
  requestDiscoverSearchFocus: () => void
}

export function useDiscoverSearchFocus({
  isMobile,
  mobileView,
  mobileDiscoverMode,
}: UseDiscoverSearchFocusOptions): UseDiscoverSearchFocusResult {
  const discoverSearchInputRef = useRef<HTMLInputElement | null>(null)
  const [discoverFocusToken, setDiscoverFocusToken] = useState(0)

  const requestDiscoverSearchFocus = useCallback(() => {
    setDiscoverFocusToken((prev) => prev + 1)
  }, [])

  useEffect(() => {
    if (!isMobile) return
    if (mobileView !== 'discover' || mobileDiscoverMode !== 'search') return

    const frame = window.requestAnimationFrame(() => {
      const input = discoverSearchInputRef.current
      if (!input) return
      input.focus()
      input.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [discoverFocusToken, isMobile, mobileDiscoverMode, mobileView])

  return {
    discoverSearchInputRef,
    requestDiscoverSearchFocus,
  }
}
