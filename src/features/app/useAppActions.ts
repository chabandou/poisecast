import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { ApplePodcastResult } from '../../podcasts/appleSearch'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import type { PodcastEpisode } from '../../podcasts/types'

type UseAppActionsOptions = {
  openMobileDiscoverSearchViewBase: () => void
  requestDiscoverSearchFocus: () => void
  markSelectionFromSearch: () => void
  markSelectionFromSource: () => void
  setRssUrl: Dispatch<SetStateAction<string>>
  loadFeed: (url: string) => Promise<void>
  openShowDetailsView: () => void
  rssLoading: boolean
  loadingFeedUrl: string | null
  episode: PodcastEpisode | null
  seekBySecondsRaw: (deltaSeconds: number) => void
}

type UseAppActionsResult = {
  openMobileDiscoverSearchView: () => void
  handleSearchSelect: (result: ApplePodcastResult) => void
  handleSourceSelect: (feed: DefaultFeed) => void
  handleLibraryCardSelect: (feed: DefaultFeed) => void
  seekBySeconds: (deltaSeconds: number) => void
}

export function useAppActions({
  openMobileDiscoverSearchViewBase,
  requestDiscoverSearchFocus,
  markSelectionFromSearch,
  markSelectionFromSource,
  setRssUrl,
  loadFeed,
  openShowDetailsView,
  rssLoading,
  loadingFeedUrl,
  episode,
  seekBySecondsRaw,
}: UseAppActionsOptions): UseAppActionsResult {
  const openMobileDiscoverSearchView = useCallback(() => {
    openMobileDiscoverSearchViewBase()
    requestDiscoverSearchFocus()
  }, [openMobileDiscoverSearchViewBase, requestDiscoverSearchFocus])

  const handleSearchSelect = useCallback(
    (result: ApplePodcastResult) => {
      if (!result.feedUrl) return
      markSelectionFromSearch()
      setRssUrl(result.feedUrl)
      void loadFeed(result.feedUrl)
      openShowDetailsView()
    },
    [loadFeed, markSelectionFromSearch, openShowDetailsView, setRssUrl],
  )

  const handleSourceSelect = useCallback(
    (feed: DefaultFeed) => {
      markSelectionFromSource()
      setRssUrl(feed.rssUrl)
      void loadFeed(feed.rssUrl)
      openShowDetailsView()
    },
    [loadFeed, markSelectionFromSource, openShowDetailsView, setRssUrl],
  )

  const handleLibraryCardSelect = useCallback(
    (feed: DefaultFeed) => {
      if (rssLoading || loadingFeedUrl === feed.rssUrl) return
      handleSourceSelect(feed)
    },
    [handleSourceSelect, loadingFeedUrl, rssLoading],
  )

  const seekBySeconds = useCallback(
    (deltaSeconds: number) => {
      if (!episode) return
      seekBySecondsRaw(deltaSeconds)
    },
    [episode, seekBySecondsRaw],
  )

  return {
    openMobileDiscoverSearchView,
    handleSearchSelect,
    handleSourceSelect,
    handleLibraryCardSelect,
    seekBySeconds,
  }
}
