import type { ComponentProps } from 'react'
import { DesktopFooter } from '../player/DesktopFooter'
import { DiscoverMainView } from '../views/DiscoverMainView'
import { LibraryMainView } from '../views/LibraryMainView'
import { ShowDetailsMainView } from '../views/ShowDetailsMainView'

type AppMainContentProps = {
  showDetailsProps: ComponentProps<typeof ShowDetailsMainView>
  libraryProps: ComponentProps<typeof LibraryMainView>
  discoverProps: ComponentProps<typeof DiscoverMainView>
  desktopFooterProps: ComponentProps<typeof DesktopFooter>
}

export type { AppMainContentProps }

export function AppMainContent({
  showDetailsProps,
  libraryProps,
  discoverProps,
  desktopFooterProps,
}: AppMainContentProps) {
  return (
    <main className="pcMain pcViewHost">
      <ShowDetailsMainView {...showDetailsProps} />
      <LibraryMainView {...libraryProps} />
      <DiscoverMainView {...discoverProps} />
      <DesktopFooter {...desktopFooterProps} />
    </main>
  )
}
