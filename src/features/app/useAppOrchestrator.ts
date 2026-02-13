import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import { DEFAULT_FEEDS } from '../../podcasts/defaultFeeds'
import type { PodcastEpisode } from '../../podcasts/types'
import {
  buildStreamProxyUrl,
  probeStreamProxy,
} from '../audio/audioPlaybackNetwork'
import { useAppActions } from './useAppActions'
import { useAppFeedDomain } from './useAppFeedDomain'
import { useAppLifecycle } from './useAppLifecycle'
import { useAppPlaybackDomain } from './useAppPlaybackDomain'
import { useAppProcessingDomain } from './useAppProcessingDomain'
import { useAppUiModels } from './useAppUiModels'
import { useAppViewModel } from './useAppViewModel'
import {
  LIBRARY_FEEDS_STORAGE_KEY as LIBRARY_FEEDS_STORAGE_KEY_VALUE,
  loadPersistedLibraryFeeds as loadPersistedLibraryFeedsUtil,
} from '../feeds/feedUtils'
import { useDiscoverSearchFocus } from '../feeds/useDiscoverSearchFocus'
import { useEpisodePlaybackActions } from '../player/useEpisodePlaybackActions'
import { useMediaSessionController } from '../player/useMediaSessionController'
import { useMobileEpisodeLimit } from '../player/useMobileEpisodeLimit'
import { usePlayerUiInteractions } from '../player/usePlayerUiInteractions'
import { useAppNavigation } from '../system/useAppNavigation'
import { useInstallPrompt } from '../system/useInstallPrompt'
import { useIsMobile } from '../system/useIsMobile'
import { useIssueLog } from '../system/useIssueLog'

type LibrarySortMode = 'updated' | 'alpha' | 'count'

const LIBRARY_FEEDS_STORAGE_KEY = LIBRARY_FEEDS_STORAGE_KEY_VALUE

const AUDIO_FILE_ACCEPT =
  'audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,.webm,.m4b,.mp4'
const FOOTER_SLIDE_MS = 500
const FOOTER_EXPAND_REVEAL_MS = 600

function loadPersistedLibraryFeeds(): DefaultFeed[] {
  return loadPersistedLibraryFeedsUtil(localStorage)
}

export function useAppOrchestrator() {
  const isMobile = useIsMobile(980)
  const initialLibraryFeeds = useMemo(() => loadPersistedLibraryFeeds(), [])
  const initialRssUrl =
    initialLibraryFeeds[0]?.rssUrl ?? DEFAULT_FEEDS[0]?.rssUrl ?? ''

  const {
    mobileView,
    mobileDiscoverMode,
    desktopView,
    openMobileLibraryView,
    openMobileDiscoverBrowseView,
    openMobileDiscoverSearchView: openMobileDiscoverSearchViewBase,
    openMobileShowDetailsView,
    openLibraryView,
    openDiscoverView,
    openShowDetailsView,
    isMobileLibraryView,
    isMobileDiscoverView,
    isMobileShowDetailsView,
    isMobileDiscoverBrowseView,
    isMobileDiscoverSearchView,
    isDesktopLibraryView,
    isDesktopDiscoverView,
    isDesktopShowDetailsView,
  } = useAppNavigation({ isMobile })

  const { discoverSearchInputRef, requestDiscoverSearchFocus } =
    useDiscoverSearchFocus({
      isMobile,
      mobileView,
      mobileDiscoverMode,
    })

  const {
    issues: sidebarIssues,
    reportIssue,
    clearIssues: clearSidebarIssues,
  } = useIssueLog()

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const proxyBypassRef = useRef<Set<string>>(new Set())
  const proxyVerifiedRef = useRef<Set<string>>(new Set())
  const footerCloseTimerRef = useRef<number | null>(null)
  const footerExpandTimerRef = useRef<number | null>(null)

  const cancelFooterCloseTimer = useCallback(() => {
    if (footerCloseTimerRef.current !== null) {
      window.clearTimeout(footerCloseTimerRef.current)
      footerCloseTimerRef.current = null
    }
  }, [])

  const cancelFooterExpandTimer = useCallback(() => {
    if (footerExpandTimerRef.current !== null) {
      window.clearTimeout(footerExpandTimerRef.current)
      footerExpandTimerRef.current = null
    }
  }, [])

  const getRemotePlaybackUrl = useCallback((ep: PodcastEpisode): string => {
    if (proxyBypassRef.current.has(ep.guid)) return ep.enclosureUrl
    return buildStreamProxyUrl(ep.enclosureUrl)
  }, [])

  const [libraryFeeds, setLibraryFeeds] = useState<DefaultFeed[]>(
    initialLibraryFeeds,
  )
  const [rssUrl, setRssUrl] = useState(initialRssUrl)
  const [episode, setEpisode] = useState<PodcastEpisode | null>(null)
  const [nowPlayingArtworkUrl, setNowPlayingArtworkUrl] = useState<
    string | null
  >(null)
  const [sourceKind, setSourceKind] = useState<'remote' | 'local'>('remote')
  const [loadingEpisodeId, setLoadingEpisodeId] = useState<string | null>(null)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [librarySortMode, setLibrarySortMode] =
    useState<LibrarySortMode>('updated')
  const [episodeQuery, setEpisodeQuery] = useState('')
  const [episodeReverse, setEpisodeReverse] = useState(false)

  const deferredEpisodeQuery = useDeferredValue(episodeQuery)
  const hasEpisode = Boolean(episode)
  const [, setCanDenoise] = useState<boolean | null>(null)
  const { canInstall, installing, triggerInstall } = useInstallPrompt()

  const {
    isPlaying,
    volume,
    setVolumeClamped,
    togglePlayPause,
    seekToPct,
    seekBySecondsRaw,
    toggleMute,
    isFooterClosing,
    setIsFooterClosing,
    isFooterCollapsing,
    setIsFooterCollapsing,
    isFooterExpanding,
    setIsFooterExpanding,
    isFooterExpanded,
    setIsFooterExpanded,
    isSidebarCompact,
    setIsSidebarCompact,
  } = useAppPlaybackDomain({
    audioRef,
    reportIssue,
  })

  const {
    modelSupported,
    engineState,
    engineDetail,
    setEngineDetail,
    denoiseEnabled,
    isInferenceActive,
    isProcessingStarting,
    downloadModalKind,
    ensureOrtAssetsReady,
    toggleDenoise,
    resetProcessingState,
    disposeProcessing,
    processingErrorText,
    processingErrorInline,
    processingStatus,
    resolvedDownloadUi,
    activeDownloadPercent,
    activeDownloadBytes,
    activeDownloadPhaseLabel,
    activeDownloadTitle,
    activeDownloadAssetLabel,
    activeDownloadAttemptLabel,
    footerProcessTooltip,
    topStatus,
  } = useAppProcessingDomain({
    audioRef,
    isPlaying,
    episode,
    sourceKind,
    getRemotePlaybackUrl,
    reportIssue,
    setCanDenoise,
    hasEpisode,
  })

  const {
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
  } = useAppFeedDomain({
    audioRef,
    currentEpisodeGuid: episode?.guid,
    cancelFooterCloseTimer,
    setIsFooterClosing,
    setEpisode,
    setNowPlayingArtworkUrl,
    setSourceKind,
    resetProcessingState,
    setEpisodeQuery,
    libraryFeeds,
    rssUrl,
  })

  const requestShowDetailsIfMobile = useCallback(() => {
    if (!isMobile) return
    openMobileShowDetailsView()
  }, [isMobile, openMobileShowDetailsView])

  const episodes = useMemo(() => {
    const q = deferredEpisodeQuery.trim().toLowerCase()
    const filtered = !q
      ? episodesAll
      : episodesAll.filter((nextEpisode) =>
          nextEpisode.title.toLowerCase().includes(q),
        )
    return episodeReverse ? [...filtered].reverse() : filtered
  }, [deferredEpisodeQuery, episodeReverse, episodesAll])

  const { mobileEpisodeLimit, loadMoreMobileEpisodes } = useMobileEpisodeLimit({
    episodeReverse,
    rssUrl,
    deferredEpisodeQuery,
    episodesCount: episodes.length,
  })

  const {
    startEpisode,
    startLocalFile,
    playPrev,
    playNext,
    canPrev,
    canNext,
  } = useEpisodePlaybackActions({
    audioRef,
    objectUrlRef,
    proxyBypassRef,
    proxyVerifiedRef,
    footerCloseTimerRef,
    episode,
    episodesAll,
    sourceKind,
    podcastImageUrl: podcast?.feed.imageUrl,
    rssUrl,
    feedImages,
    getRemotePlaybackUrl,
    probeStreamProxy,
    cancelFooterCloseTimer,
    cancelFooterExpandTimer,
    setLoadingEpisodeId,
    resetProcessingState,
    setEpisode,
    setNowPlayingArtworkUrl,
    setSourceKind,
    setCanDenoise,
    setEngineDetail,
    reportIssue,
    setIsFooterClosing,
    setIsFooterExpanding,
    setIsFooterExpanded,
    setIsFooterCollapsing,
    setIsSidebarCompact,
    onRequestShowDetails: requestShowDetailsIfMobile,
    footerSlideMs: FOOTER_SLIDE_MS,
  })

  const isEpisodeLoading =
    Boolean(loadingEpisodeId) && episode?.guid === loadingEpisodeId

  useAppLifecycle({
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
    storageKey: LIBRARY_FEEDS_STORAGE_KEY,
    episodeGuid: episode?.guid,
    isMobile,
    isFooterExpanded,
    setIsFooterExpanding,
    setIsFooterExpanded,
    setIsSidebarCompact,
    audioRef,
    setLoadingEpisodeId,
  })

  const {
    openMobileDiscoverSearchView,
    handleSearchSelect,
    handleSourceSelect,
    handleLibraryCardSelect,
    seekBySeconds,
  } = useAppActions({
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
  })

  const {
    onProgressPointer,
    onMiniProgressPointerDown,
    onMiniProgressKeyDown,
    onVolumePointerDown,
    onVolumeKeyDown,
    onVolumeWheel,
    toggleFooterExpansion,
  } = usePlayerUiInteractions({
    seekToPct,
    seekBySeconds,
    setVolumeClamped,
    volume,
    hasEpisode,
    isMobile,
    isFooterClosing,
    isFooterExpanded,
    isFooterExpanding,
    footerExpandTimerRef,
    cancelFooterExpandTimer,
    setIsFooterCollapsing,
    setIsFooterExpanded,
    setIsFooterExpanding,
    setIsSidebarCompact,
    footerExpandRevealMs: FOOTER_EXPAND_REVEAL_MS,
  })

  useMediaSessionController({
    audioRef,
    episode,
    sourceKind,
    nowPlayingArtworkUrl,
    podcastTitle: podcast?.feed.title,
    seekBySeconds,
    playPrev,
    playNext,
    canPrev,
    canNext,
    isPlaying,
  })

  const {
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
  } = useAppUiModels({
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
    episodesAllCount: episodesAll.length,
    episodes,
    feedImages,
    libraryQuery,
    librarySortMode,
    libraryStatsByUrl,
    mobileEpisodeLimit,
    fetchLibraryFeedArtwork,
    isCurrentShowFollowed,
    commitFollowState,
    setLibraryFeeds,
  })

  const appMainContentProps = useAppViewModel({
    showDetailsBase: {
      isMobile,
      isMobileShowDetailsView,
      isDesktopShowDetailsView,
      openMobileLibraryView,
      isShowInfoLoading,
      showArtwork,
      showTitleRaw,
      showNetworkLabel,
      isCurrentShowFollowed,
      followCurrentShow,
      showGenres,
      episodes,
      showDescription,
      episodeReverse,
      setEpisodeReverse,
      mobileVisibleEpisodes,
      loadingEpisodeId,
      startEpisode,
      hasMoreMobileEpisodes,
      loadMoreMobileEpisodes,
      nowTitleRef,
      showTitleParts,
      sectionTagLabel,
      episodeQuery,
      setEpisodeQuery,
      rssError,
    },
    currentEpisodeGuid: episode?.guid ?? null,
    libraryBase: {
      libraryFeedsCount: libraryFeeds.length,
      librarySortMode,
      setLibrarySortMode,
      libraryQuery,
      setLibraryQuery,
      libraryGridRef,
      libraryFeedsView,
      onSelectFeed: handleLibraryCardSelect,
    },
    isDesktopLibraryView,
    isMobileLibraryView,
    discoverBase: {
      discoverSearchInputRef,
      searchTerm,
      setSearchTerm,
      hasSearchQuery,
      searchLoading,
      searchError,
      searchResults,
      rssLoading,
      loadingFeedUrl,
      searchQuery,
    },
    onSelectSearchResult: handleSearchSelect,
    isMobileDiscoverView,
    isDesktopDiscoverView,
    desktopFooterBase: {
      audioRef,
      episode,
      episodesAll,
      isFooterClosing,
      isFooterExpanding,
      isFooterExpanded,
      isFooterCollapsing,
      onProgressPointer,
      toggleFooterExpansion,
      footerPanActive,
      footerTitlePanRef,
      footerShowPanRef,
      footerPanSharedStyle,
      footerTitlePanStyle,
      footerShowPanStyle,
      footerEpisodeTitle,
      footerEpisodeShow,
      canPrev,
      canNext,
      playPrev,
      playNext,
      seekBySeconds,
      togglePlayPause,
      isPlaying,
      isEpisodeLoading,
      denoiseEnabled,
      isProcessingStarting,
      toggleDenoise,
      footerProcessTooltip,
      onVolumeWheel,
      toggleMute,
      volume,
      footerVolumeIcon,
      footerVolumePct,
      onVolumePointerDown,
      onVolumeKeyDown,
      isFooterDescriptionExpanded,
      isFooterDescriptionOverflowing,
      footerDescriptionRef,
      footerDescriptionStyle,
      footerDescriptionHtml,
      toggleFooterDescriptionExpanded,
      waveformHeights,
    },
    isMobile,
    modelSupported,
  })

  return {
    isMobile,
    appMainContentProps,
    processingDownloadModalProps: {
      downloadModalKind,
      resolvedDownloadUi,
      activeDownloadTitle,
      activeDownloadAttemptLabel,
      activeDownloadAssetLabel,
      activeDownloadPercent,
      activeDownloadPhaseLabel,
      activeDownloadBytes,
    },
    appHeaderProps: {
      processingStatus,
      processingErrorText,
      isProcessingStarting,
      processingErrorInline,
      isInferenceActive,
      canInstall,
      installing,
      triggerInstall,
      topStatus,
      denoiseEnabled,
      hasEpisode,
      modelSupported,
      toggleDenoise,
    },
    desktopSidebarProps: {
      isVisible: !isMobile,
      isSidebarCollapsed,
      desktopView,
      openLibraryView,
      openDiscoverView,
      libraryFeeds,
      rssUrl,
      rssLoading,
      loadingFeedUrl,
      onSelectSource: handleSourceSelect,
      sidebarIssues,
      clearSidebarIssues,
    },
    mobileMiniPlayerProps: {
      isVisible: isMobile,
      audioRef,
      hasEpisode,
      nowPlayingArtworkUrl,
      episodeTitle: episode?.title ?? 'Select an episode to start playback',
      denoiseEnabled,
      modelSupported,
      isProcessingStarting,
      footerProcessTooltip,
      toggleDenoise,
      seekBySeconds,
      togglePlayPause,
      isEpisodeLoading,
      isPlaying,
      playNext,
      canNext,
      onMiniProgressPointerDown,
      onMiniProgressKeyDown,
    },
    mobileNavProps: {
      isMobileDiscoverBrowseView,
      isMobileLibraryView,
      isMobileDiscoverSearchView,
      openMobileDiscoverBrowseView,
      openMobileLibraryView,
      openMobileDiscoverSearchView,
    },
    appMediaControlsProps: {
      audioRef,
      fileInputRef,
      audioFileAccept: AUDIO_FILE_ACCEPT,
      startLocalFile,
    },
  }
}
