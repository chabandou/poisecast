import { useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { PodcastEpisode } from '../../podcasts/types'
import { useDiscoverSearchController } from '../feeds/useDiscoverSearchController'
import { useFeedFollowState } from '../feeds/useFeedFollowState'
import { useFeedLoader } from '../feeds/useFeedLoader'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'

type ResetProcessingStateOptions = {
  canDenoise?: boolean | null
}

type UseAppFeedDomainOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  currentEpisodeGuid: string | undefined
  cancelFooterCloseTimer: () => void
  setIsFooterClosing: Dispatch<SetStateAction<boolean>>
  setEpisode: Dispatch<SetStateAction<PodcastEpisode | null>>
  setNowPlayingArtworkUrl: Dispatch<SetStateAction<string | null>>
  setSourceKind: Dispatch<SetStateAction<'remote' | 'local'>>
  resetProcessingState: (opts?: ResetProcessingStateOptions) => void
  setEpisodeQuery: Dispatch<SetStateAction<string>>
  libraryFeeds: DefaultFeed[]
  rssUrl: string
}

export function useAppFeedDomain({
  audioRef,
  currentEpisodeGuid,
  cancelFooterCloseTimer,
  setIsFooterClosing,
  setEpisode,
  setNowPlayingArtworkUrl,
  setSourceKind,
  resetProcessingState,
  setEpisodeQuery,
  libraryFeeds,
  rssUrl,
}: UseAppFeedDomainOptions) {
  const {
    searchTerm,
    setSearchTerm,
    searchLoading,
    searchError,
    searchResults,
    initializeSearchCache,
  } = useDiscoverSearchController()

  const {
    rssLoading,
    rssError,
    podcast,
    loadingFeedUrl,
    feedImages,
    libraryStatsByUrl,
    loadFeed,
    initializeFeedCaches,
    fetchLibraryFeedArtwork,
  } = useFeedLoader({
    audioRef,
    currentEpisodeGuid,
    cancelFooterCloseTimer,
    setIsFooterClosing,
    setEpisode,
    setNowPlayingArtworkUrl,
    setSourceKind,
    resetProcessingState,
    setEpisodeQuery,
  })

  const {
    isCurrentShowFollowed,
    markSelectionFromSearch,
    markSelectionFromSource,
    commitFollowState,
  } = useFeedFollowState({
    libraryFeeds,
    rssUrl,
  })

  const episodesAll = useMemo(
    () => podcast?.episodes ?? [],
    [podcast?.episodes],
  )

  return {
    searchTerm,
    setSearchTerm,
    searchLoading,
    searchError,
    searchResults,
    initializeSearchCache,
    rssLoading,
    rssError,
    podcast,
    loadingFeedUrl,
    feedImages,
    libraryStatsByUrl,
    loadFeed,
    initializeFeedCaches,
    fetchLibraryFeedArtwork,
    isCurrentShowFollowed,
    markSelectionFromSearch,
    markSelectionFromSource,
    commitFollowState,
    episodesAll,
  }
}
