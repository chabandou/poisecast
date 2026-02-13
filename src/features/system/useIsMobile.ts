import { useEffect, useState } from 'react'

export function useIsMobile(maxWidthPx = 980): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(`(max-width:${maxWidthPx}px)`).matches)

  useEffect(() => {
    const mediaQueryList = window.matchMedia(`(max-width:${maxWidthPx}px)`)
    const onChange = () => setIsMobile(mediaQueryList.matches)
    onChange()
    mediaQueryList.addEventListener?.('change', onChange)
    return () => mediaQueryList.removeEventListener?.('change', onChange)
  }, [maxWidthPx])

  return isMobile
}
