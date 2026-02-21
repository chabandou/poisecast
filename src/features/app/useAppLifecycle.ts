import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import { usePersistLibraryFeeds } from '../feeds/usePersistLibraryFeeds'
import type { RecentFeedPlay } from '../feeds/recentFeedPlays'
import { usePersistRecentFeedPlays } from '../feeds/usePersistRecentFeedPlays'
import { useAudioReadyLoadingReset } from '../player/useAudioReadyLoadingReset'
import { useFooterLayoutSync } from '../player/useFooterLayoutSync'
import { useAppDiagnostics } from '../system/useAppDiagnostics'
import {
  readNavigatorConnection,
  resolveOrtPrefetchStrategy,
  shouldPrefetchOrtCore,
} from '../system/prefetchPolicy'
import { useAppStartup } from '../system/useAppStartup'
import type { IssueSource } from '../system/useIssueLog'

type UseAppLifecycleOptions = {
  rssError: string | null
  searchError: string | null
  engineState: string
  engineDetail: string
  reportIssue: (source: IssueSource, summary: string, detail: unknown) => void
  ensureOrtAssetsReady: (opts: { showModal: boolean; mode: 'core' | 'extended' }) => Promise<string>
  initializeSearchCache: () => void
  initializeFeedCaches: () => void
  loadFeed: (url: string) => Promise<void>
  rssUrl: string
  cancelFooterCloseTimer: () => void
  cancelFooterExpandTimer: () => void
  disposeProcessing: () => void
  objectUrlRef: MutableRefObject<string | null>
  libraryFeeds: DefaultFeed[]
  storageKey: string
  recentFeedPlays: RecentFeedPlay[]
  recentFeedPlaysStorageKey: string
  episodeGuid: string | null | undefined
  isMobile: boolean
  isFooterExpanded: boolean
  setIsFooterExpanding: Dispatch<SetStateAction<boolean>>
  setIsFooterExpanded: Dispatch<SetStateAction<boolean>>
  setIsSidebarCompact: Dispatch<SetStateAction<boolean>>
  audioRef: RefObject<HTMLAudioElement | null>
  loadingEpisodeId: string | null
  setLoadingEpisodeId: Dispatch<SetStateAction<string | null>>
}

export function useAppLifecycle({
  rssError,
  searchError,
  engineState,
  engineDetail,
  reportIssue,
  ensureOrtAssetsReady,
  initializeSearchCache,
  initializeFeedCaches,
  loadFeed,
  rssUrl,
  cancelFooterCloseTimer,
  cancelFooterExpandTimer,
  disposeProcessing,
  objectUrlRef,
  libraryFeeds,
  storageKey,
  recentFeedPlays,
  recentFeedPlaysStorageKey,
  episodeGuid,
  isMobile,
  isFooterExpanded,
  setIsFooterExpanding,
  setIsFooterExpanded,
  setIsSidebarCompact,
  audioRef,
  loadingEpisodeId,
  setLoadingEpisodeId,
}: UseAppLifecycleOptions): void {
  useAppDiagnostics({
    rssError,
    searchError,
    engineState,
    engineDetail,
    reportIssue,
  })

  const ortPrefetchStrategy = resolveOrtPrefetchStrategy(
    import.meta.env.VITE_ORT_PREFETCH_STRATEGY,
  )
  const shouldPrefetchCoreAssets = shouldPrefetchOrtCore(
    ortPrefetchStrategy,
    readNavigatorConnection(),
  )

  useEffect(() => {
    if (!shouldPrefetchCoreAssets) return
    void ensureOrtAssetsReady({ showModal: false, mode: 'core' }).catch(() => {
      // Ignore background bootstrap failures; processing flow will retry on demand.
    })
  }, [ensureOrtAssetsReady, shouldPrefetchCoreAssets])

  useAppStartup({
    initializeSearchCache,
    initializeFeedCaches,
    loadFeed,
    rssUrl,
    cancelFooterCloseTimer,
    cancelFooterExpandTimer,
    disposeProcessing,
    objectUrlRef,
  })

  usePersistLibraryFeeds({
    libraryFeeds,
    storageKey,
  })

  usePersistRecentFeedPlays({
    recentFeedPlays,
    storageKey: recentFeedPlaysStorageKey,
  })

  useFooterLayoutSync({
    episodeGuid,
    isMobile,
    isFooterExpanded,
    cancelFooterExpandTimer,
    setIsFooterExpanding,
    setIsFooterExpanded,
    setIsSidebarCompact,
  })

  useAudioReadyLoadingReset({ audioRef, loadingEpisodeId, setLoadingEpisodeId })
}
