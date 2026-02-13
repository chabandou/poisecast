import { useCallback, useState } from 'react'

export type MobileView = 'library' | 'discover' | 'showDetails'
export type MobileDiscoverMode = 'browse' | 'search'
export type DesktopView = 'library' | 'discover' | 'showDetails'

type UseAppNavigationOptions = {
  isMobile: boolean
}

type UseAppNavigationResult = {
  mobileView: MobileView
  mobileDiscoverMode: MobileDiscoverMode
  desktopView: DesktopView
  openMobileLibraryView: () => void
  openMobileDiscoverBrowseView: () => void
  openMobileDiscoverSearchView: () => void
  openMobileShowDetailsView: () => void
  openLibraryView: () => void
  openDiscoverView: () => void
  openShowDetailsView: () => void
  isMobileLibraryView: boolean
  isMobileDiscoverView: boolean
  isMobileShowDetailsView: boolean
  isMobileDiscoverBrowseView: boolean
  isMobileDiscoverSearchView: boolean
  isDesktopLibraryView: boolean
  isDesktopDiscoverView: boolean
  isDesktopShowDetailsView: boolean
}

export function useAppNavigation({
  isMobile,
}: UseAppNavigationOptions): UseAppNavigationResult {
  const [mobileView, setMobileView] = useState<MobileView>('library')
  const [mobileDiscoverMode, setMobileDiscoverMode] = useState<MobileDiscoverMode>('browse')
  const [desktopView, setDesktopView] = useState<DesktopView>('library')

  const openMobileLibraryView = useCallback(() => {
    setMobileView('library')
  }, [])

  const openMobileDiscoverBrowseView = useCallback(() => {
    setMobileDiscoverMode('browse')
    setMobileView('discover')
  }, [])

  const openMobileDiscoverSearchView = useCallback(() => {
    setMobileDiscoverMode('search')
    setMobileView('discover')
  }, [])

  const openMobileShowDetailsView = useCallback(() => {
    setMobileView('showDetails')
  }, [])

  const openLibraryView = useCallback(() => {
    if (isMobile) {
      openMobileLibraryView()
      return
    }
    setDesktopView('library')
  }, [isMobile, openMobileLibraryView])

  const openDiscoverView = useCallback(() => {
    if (isMobile) {
      openMobileDiscoverBrowseView()
      return
    }
    setDesktopView('discover')
  }, [isMobile, openMobileDiscoverBrowseView])

  const openShowDetailsView = useCallback(() => {
    if (isMobile) {
      openMobileShowDetailsView()
      return
    }
    setDesktopView('showDetails')
  }, [isMobile, openMobileShowDetailsView])

  const isMobileLibraryView = isMobile && mobileView === 'library'
  const isMobileDiscoverView = isMobile && mobileView === 'discover'
  const isMobileShowDetailsView = isMobile && mobileView === 'showDetails'
  const isMobileDiscoverBrowseView = isMobileDiscoverView && mobileDiscoverMode === 'browse'
  const isMobileDiscoverSearchView = isMobileDiscoverView && mobileDiscoverMode === 'search'
  const isDesktopLibraryView = !isMobile && desktopView === 'library'
  const isDesktopDiscoverView = !isMobile && desktopView === 'discover'
  const isDesktopShowDetailsView = !isMobile && desktopView === 'showDetails'

  return {
    mobileView,
    mobileDiscoverMode,
    desktopView,
    openMobileLibraryView,
    openMobileDiscoverBrowseView,
    openMobileDiscoverSearchView,
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
  }
}
