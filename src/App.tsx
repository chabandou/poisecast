import { useRef } from 'react'
import { AppMainContent } from './features/app/AppMainContent'
import { AppMediaControls } from './features/app/AppMediaControls'
import { AppHeader } from './features/app/AppHeader'
import { DesktopSidebar } from './features/app/DesktopSidebar'
import { MobileNav } from './features/app/MobileNav'
import { ProcessingDownloadModal } from './features/app/ProcessingDownloadModal'
import { MobileMiniPlayer } from './features/player/MobileMiniPlayer'
import { useAppOrchestrator } from './features/app/useAppOrchestrator'
import { useArtworkDrivenTheme } from './features/system/useArtworkDrivenTheme'

type TestHooksWindow = Window & {
  __POISECAST_TEST_HOOKS__?: {
    onAppRender?: () => void
  }
}

function notifyAppRenderForTests(): void {
  if (import.meta.env.MODE !== 'test' || typeof window === 'undefined') return
  ;(window as TestHooksWindow).__POISECAST_TEST_HOOKS__?.onAppRender?.()
}

export default function App() {
  notifyAppRenderForTests()
  const appRootRef = useRef<HTMLDivElement | null>(null)

  const {
    isMobile,
    appMainContentProps,
    processingDownloadModalProps,
    appHeaderProps,
    desktopSidebarProps,
    mobileMiniPlayerProps,
    mobileNavProps,
    appMediaControlsProps,
  } = useAppOrchestrator()
  const showDetailsProps = appMainContentProps.showDetailsProps
  const showDetailsVisible =
    showDetailsProps.isMobileShowDetailsView ||
    showDetailsProps.isDesktopShowDetailsView
  useArtworkDrivenTheme({
    artworkUrl: showDetailsProps.showArtwork,
    isEnabled: showDetailsVisible,
    targetRef: appRootRef,
  })

  return (
    <div ref={appRootRef} className={`pcApp ${isMobile ? 'isMobile' : ''}`}>
      <div className="pcBackdrop" aria-hidden="true" />
      <ProcessingDownloadModal {...processingDownloadModalProps} />

      <AppHeader {...appHeaderProps} />

      <div className="pcShell">
        <DesktopSidebar {...desktopSidebarProps} />

        <AppMainContent {...appMainContentProps} />
      </div>
      <MobileMiniPlayer {...mobileMiniPlayerProps} />

      <MobileNav {...mobileNavProps} />

      <AppMediaControls {...appMediaControlsProps} />
    </div>
  )
}
