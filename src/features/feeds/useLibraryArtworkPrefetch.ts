import { useEffect, useMemo, type MutableRefObject } from 'react'

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
  const feedOrderKey = useMemo(
    () => libraryFeedsView.map((feed) => feed.rssUrl).join('\n'),
    [libraryFeedsView],
  )

  useEffect(() => {
    if (!isLibraryViewActive) return

    const gridElement = libraryGridRef.current
    if (!gridElement) return

    const cards = Array.from(
      gridElement.querySelectorAll<HTMLElement>('.pcLibraryCard[data-rss-url]'),
    )

    const getCardNodes = (root: HTMLElement): HTMLElement[] => {
      if (root.matches('.pcLibraryCard[data-rss-url]')) return [root]
      return Array.from(
        root.querySelectorAll<HTMLElement>('.pcLibraryCard[data-rss-url]'),
      )
    }

    if (typeof IntersectionObserver === 'undefined') {
      for (const card of cards) {
        const url = card.dataset.rssUrl
        if (url) void fetchLibraryFeedArtwork(url)
      }

      const mutationObserver =
        typeof MutationObserver !== 'undefined'
          ? new MutationObserver((mutations) => {
              for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                  if (!(node instanceof HTMLElement)) return
                  if (
                    node.matches('.pcLibraryCard[data-rss-url]') ||
                    node.querySelector('.pcLibraryCard[data-rss-url]')
                  ) {
                    for (const card of getCardNodes(node)) {
                      const url = card.dataset.rssUrl
                      if (url) void fetchLibraryFeedArtwork(url)
                    }
                  }
                })
              }
            })
          : null

      mutationObserver?.observe(gridElement, {
        childList: true,
        subtree: true,
      })

      return () => mutationObserver?.disconnect()
    }

    const observedCards = new WeakSet<HTMLElement>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const card = entry.target as HTMLElement
          observer.unobserve(card)
          const url = card.dataset.rssUrl
          if (url) void fetchLibraryFeedArtwork(url)
        }
      },
      { root: gridElement, rootMargin: '120px 0px', threshold: 0.01 },
    )

    const observeCard = (card: HTMLElement): void => {
      if (observedCards.has(card)) return
      observedCards.add(card)
      observer.observe(card)
    }

    for (const card of cards) observeCard(card)

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              mutation.addedNodes.forEach((node) => {
                if (!(node instanceof HTMLElement)) return
                if (
                  node.matches('.pcLibraryCard[data-rss-url]') ||
                  node.querySelector('.pcLibraryCard[data-rss-url]')
                ) {
                  for (const card of getCardNodes(node)) {
                    observeCard(card)
                  }
                }
              })
            }
          })
        : null

    mutationObserver?.observe(gridElement, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      mutationObserver?.disconnect()
    }
  }, [feedOrderKey, fetchLibraryFeedArtwork, isLibraryViewActive, libraryGridRef])
}
