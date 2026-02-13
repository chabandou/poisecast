import { useEffect, type MutableRefObject } from 'react'

type LibraryFeedCard = {
  rssUrl: string
}

type UseLibraryArtworkPrefetchOptions = {
  libraryGridRef: MutableRefObject<HTMLDivElement | null>
  isLibraryViewActive: boolean
  libraryFeedsView: LibraryFeedCard[]
  fetchLibraryFeedArtwork: (url: string) => Promise<void>
}

export function useLibraryArtworkPrefetch({
  libraryGridRef,
  isLibraryViewActive,
  libraryFeedsView,
  fetchLibraryFeedArtwork,
}: UseLibraryArtworkPrefetchOptions): void {
  useEffect(() => {
    if (!isLibraryViewActive) return

    const gridElement = libraryGridRef.current
    if (!gridElement) return

    const cards = Array.from(
      gridElement.querySelectorAll<HTMLElement>('.pcLibraryCard[data-rss-url]'),
    )
    if (!cards.length) return

    if (typeof IntersectionObserver === 'undefined') {
      for (const card of cards) {
        const url = card.dataset.rssUrl
        if (url) void fetchLibraryFeedArtwork(url)
      }
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const card = entry.target as HTMLElement
          const url = card.dataset.rssUrl
          if (url) void fetchLibraryFeedArtwork(url)
        }
      },
      { root: null, rootMargin: '120px 0px', threshold: 0.01 },
    )

    for (const card of cards) observer.observe(card)
    return () => observer.disconnect()
  }, [fetchLibraryFeedArtwork, isLibraryViewActive, libraryFeedsView, libraryGridRef])
}
