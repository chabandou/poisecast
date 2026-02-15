import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import type { ParsedPodcast, PodcastEpisode } from '../../podcasts/types'
import { useFeedPresentationModel } from '../feeds/useFeedPresentationModel'
import type { LibrarySortMode } from '../feeds/useFeedPresentationModel'
import { useFollowCurrentShowAction } from '../feeds/useFollowCurrentShowAction'
import type { LibraryFeedStats } from '../feeds/feedUtils'
import { useLibraryArtworkPrefetch } from '../feeds/useLibraryArtworkPrefetch'
import { useFooterPresentationModel } from '../player/useFooterPresentationModel'
import { useMainStartupReady } from '../system/useMainStartupReady'

type UseAppUiModelsOptions = {
  isMobile: boolean
  isSidebarCompact: boolean
  isDesktopLibraryView: boolean
  isMobileLibraryView: boolean
  podcast: ParsedPodcast | null
  rssLoading: boolean
  loadingFeedUrl: string | null
  searchTerm: string
  volume: number
  episode: PodcastEpisode | null
  sourceKind: 'remote' | 'local'
  isFooterExpanded: boolean
  libraryFeeds: DefaultFeed[]
  rssUrl: string
  episodesAllCount: number
  episodes: PodcastEpisode[]
  feedImages: Record<string, string>
  libraryArtworkLoadingByUrl: Record<string, boolean>
  libraryQuery: string
  librarySortMode: LibrarySortMode
  libraryStatsByUrl: Record<string, LibraryFeedStats>
  mobileEpisodeLimit: number
  fetchLibraryFeedArtwork: (url: string) => Promise<void>
  isCurrentShowFollowed: boolean
  commitFollowState: (nextFollowed: boolean) => void
  setLibraryFeeds: Dispatch<SetStateAction<DefaultFeed[]>>
}

export function useAppUiModels({
  isMobile,
  isSidebarCompact,
  isDesktopLibraryView,
  isMobileLibraryView,
  podcast,
  rssLoading,
  loadingFeedUrl,
  searchTerm,
  volume,
  episode,
  sourceKind,
  isFooterExpanded,
  libraryFeeds,
  rssUrl,
  episodesAllCount,
  episodes,
  feedImages,
  libraryArtworkLoadingByUrl,
  libraryQuery,
  librarySortMode,
  libraryStatsByUrl,
  mobileEpisodeLimit,
  fetchLibraryFeedArtwork,
  isCurrentShowFollowed,
  commitFollowState,
  setLibraryFeeds,
}: UseAppUiModelsOptions) {
  const isMainStartupReady = useMainStartupReady()
  const isShowInfoLoading = !podcast && (rssLoading || Boolean(loadingFeedUrl))
  const searchQuery = searchTerm.trim()
  const hasSearchQuery = searchQuery.length > 0
  const deferredLibraryQuery = useDeferredValue(libraryQuery)

  const {
    footerVolumePct,
    footerVolumeIcon,
    footerEpisodeTitle,
    footerEpisodeShow,
    footerDescriptionHtml,
    footerDescriptionRef,
    footerDescriptionStyle,
    isFooterDescriptionExpanded,
    isFooterDescriptionOverflowing,
    toggleFooterDescriptionExpanded,
    footerPanActive,
    footerTitlePanRef,
    footerTitlePanStyle,
    footerShowPanRef,
    footerShowPanStyle,
    footerPanSharedStyle,
    waveformHeights,
  } = useFooterPresentationModel({
    volume,
    episode,
    sourceKind,
    podcastTitle: podcast?.feed.title,
    isFooterExpanded,
  })

  const {
    activeSource,
    showHost,
    showTitleRaw,
    showTitleParts,
    showNetworkLabel,
    sectionTagLabel,
    showArtwork,
    libraryFeedsView,
    showDescription,
    showGenres,
  } = useFeedPresentationModel({
    libraryFeeds,
    rssUrl,
    isShowInfoLoading,
    podcast,
    episodesAllCount,
    episodesCount: episodes.length,
    feedImages,
    libraryArtworkLoadingByUrl,
    libraryQuery: deferredLibraryQuery,
    librarySortMode,
    libraryStatsByUrl,
    loadingFeedUrl,
    sourceKind,
  })

  const libraryGridRef = useRef<HTMLDivElement | null>(null)
  useLibraryArtworkPrefetch({
    libraryGridRef,
    isLibraryViewActive:
      (isDesktopLibraryView || isMobileLibraryView) && isMainStartupReady,
    libraryFeedsView,
    fetchLibraryFeedArtwork,
  })

  const followCurrentShow = useFollowCurrentShowAction({
    rssUrl,
    isCurrentShowFollowed,
    activeSourceTitle: activeSource?.title,
    activeSourceCategory: activeSource?.category,
    podcastFeedTitle: podcast?.feed.title,
    podcastFeedGenres: podcast?.feed.genres,
    showHost,
    commitFollowState,
    setLibraryFeeds,
  })

  const mobileVisibleEpisodes = useMemo(
    () => episodes.slice(0, mobileEpisodeLimit),
    [episodes, mobileEpisodeLimit],
  )
  const hasMoreMobileEpisodes = mobileEpisodeLimit < episodes.length

  const nowTitle = episode?.title ?? 'Select an episode'
  const nowTitleRef = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    const el = nowTitleRef.current
    if (!el) return

    const update = () => {
      const style = window.getComputedStyle(el)
      const lineHeight = Number.parseFloat(style.lineHeight)
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return
      const lines = Math.round(el.getBoundingClientRect().height / lineHeight)
      el.classList.toggle('isLong', lines > 2)
    }

    const onResize = () => window.requestAnimationFrame(update)
    update()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [nowTitle])

  const isSidebarCollapsed = isSidebarCompact && !isMobile

  return {
    isShowInfoLoading,
    searchQuery,
    hasSearchQuery,
    footerVolumePct,
    footerVolumeIcon,
    footerEpisodeTitle,
    footerEpisodeShow,
    footerDescriptionHtml,
    footerDescriptionRef,
    footerDescriptionStyle,
    isFooterDescriptionExpanded,
    isFooterDescriptionOverflowing,
    toggleFooterDescriptionExpanded,
    footerPanActive,
    footerTitlePanRef,
    footerTitlePanStyle,
    footerShowPanRef,
    footerShowPanStyle,
    footerPanSharedStyle,
    waveformHeights,
    showTitleRaw,
    showTitleParts,
    showNetworkLabel,
    sectionTagLabel,
    showArtwork,
    libraryFeedsView,
    showDescription,
    showGenres,
    followCurrentShow,
    mobileVisibleEpisodes,
    hasMoreMobileEpisodes,
    nowTitleRef,
    libraryGridRef,
    isSidebarCollapsed,
    isMainStartupReady,
  }
}
