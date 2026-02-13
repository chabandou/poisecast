import { useEffect, type MutableRefObject } from 'react'
import { useLatestValue } from './useLatestValue'

type UseAppStartupOptions = {
  initializeSearchCache: () => void
  initializeFeedCaches: () => void
  loadFeed: (url: string) => Promise<void>
  rssUrl: string
  cancelFooterCloseTimer: () => void
  cancelFooterExpandTimer: () => void
  disposeProcessing: () => void
  objectUrlRef: MutableRefObject<string | null>
}

export function useAppStartup({
  initializeSearchCache,
  initializeFeedCaches,
  loadFeed,
  rssUrl,
  cancelFooterCloseTimer,
  cancelFooterExpandTimer,
  disposeProcessing,
  objectUrlRef,
}: UseAppStartupOptions): void {
  const startupRef = useLatestValue({
    initializeSearchCache,
    initializeFeedCaches,
    loadFeed,
    rssUrl,
  })

  const cleanupRef = useLatestValue({
    cancelFooterCloseTimer,
    cancelFooterExpandTimer,
    disposeProcessing,
    objectUrlRef,
  })

  useEffect(() => {
    const startup = startupRef.current
    startup.initializeSearchCache()
    startup.initializeFeedCaches()
    void startup.loadFeed(startup.rssUrl)
  }, [startupRef])

  useEffect(() => {
    const cleanupValueRef = cleanupRef
    return () => {
      const cleanup = cleanupValueRef.current
      cleanup.cancelFooterCloseTimer()
      cleanup.cancelFooterExpandTimer()
      cleanup.disposeProcessing()

      if (cleanup.objectUrlRef.current) {
        URL.revokeObjectURL(cleanup.objectUrlRef.current)
        cleanup.objectUrlRef.current = null
      }
    }
  }, [cleanupRef])
}
