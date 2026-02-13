import type { AppMainContentProps } from './AppMainContent'
import type { DesktopFooterProps } from '../player/DesktopFooter'
import type { DiscoverMainViewProps } from '../views/DiscoverMainView'
import type { LibraryMainViewProps } from '../views/LibraryMainView'
import type { ShowDetailsMainViewProps } from '../views/ShowDetailsMainView'

type UseAppViewModelOptions = {
  showDetailsBase: Omit<ShowDetailsMainViewProps, 'currentEpisodeGuid'>
  currentEpisodeGuid: ShowDetailsMainViewProps['currentEpisodeGuid']
  libraryBase: Omit<LibraryMainViewProps, 'isVisible'>
  isDesktopLibraryView: boolean
  isMobileLibraryView: boolean
  discoverBase: Omit<DiscoverMainViewProps, 'isVisible' | 'onSelectSearchResult'>
  onSelectSearchResult: DiscoverMainViewProps['onSelectSearchResult']
  isMobileDiscoverView: boolean
  isDesktopDiscoverView: boolean
  desktopFooterBase: Omit<DesktopFooterProps, 'isVisible' | 'modelSupported'>
  isMobile: boolean
  modelSupported: DesktopFooterProps['modelSupported']
}

export function useAppViewModel({
  showDetailsBase,
  currentEpisodeGuid,
  libraryBase,
  isDesktopLibraryView,
  isMobileLibraryView,
  discoverBase,
  onSelectSearchResult,
  isMobileDiscoverView,
  isDesktopDiscoverView,
  desktopFooterBase,
  isMobile,
  modelSupported,
}: UseAppViewModelOptions): AppMainContentProps {
  return {
    showDetailsProps: {
      ...showDetailsBase,
      currentEpisodeGuid,
    },
    libraryProps: {
      ...libraryBase,
      isVisible: isDesktopLibraryView || isMobileLibraryView,
    },
    discoverProps: {
      ...discoverBase,
      isVisible: isMobileDiscoverView || isDesktopDiscoverView,
      onSelectSearchResult,
    },
    desktopFooterProps: {
      ...desktopFooterBase,
      isVisible: !isMobile && Boolean(desktopFooterBase.episode),
      modelSupported,
    },
  }
}
