import {
  useCallback,
  useEffect,
  useMemo,
  memo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import type { LibraryFeedViewItem } from '../feeds/useFeedPresentationModel'
import { ScrambleText } from '../system/ScrambleText'
import { GlitchImage } from '../../ui/GlitchImage'

type LibrarySortMode = 'updated' | 'alpha' | 'count'

const REVEAL_STAGGER_MS = 86
const IMAGE_START_DELAY_MS = 680
const VIRTUAL_OVERSCAN_ROWS = 2

type LibraryGridSizing = {
  cardSize: number
  gap: number
}

type VirtualGridWindow = {
  columnCount: number
  rowCount: number
  startRow: number
  endRow: number
  rowGap: number
  rowHeight: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t
}

function resolveLibraryGridSizing(
  viewportWidth: number,
  viewportHeight: number,
): LibraryGridSizing {
  if (viewportWidth <= 768) {
    return {
      cardSize: 150,
      gap: 16,
    }
  }

  if (viewportWidth <= 980) {
    const compactScale = clamp01((viewportWidth - 768) / (980 - 768))
    return {
      cardSize: Math.round(lerp(150, 178, compactScale)),
      gap: Math.round(lerp(16, 20, compactScale)),
    }
  }

  const widthScale = clamp01((viewportWidth - 980) / (1920 - 980))
  const heightScale = clamp01((viewportHeight - 620) / (1280 - 620))
  const scale = clamp01(widthScale * 0.68 + heightScale * 0.32)

  return {
    cardSize: Math.round(lerp(170, 236, scale)),
    gap: Math.round(lerp(16, 30, scale)),
  }
}

type LibraryCardProps = {
  feed: LibraryFeedViewItem
  index: number
  isCardRevealed: boolean
  onSelectFeed: (feed: DefaultFeed) => void
}

const LibraryCard = memo(
  function LibraryCard({
    feed,
    index,
    isCardRevealed,
    onSelectFeed,
  }: LibraryCardProps) {
    const shouldShowArtworkLoading =
      isCardRevealed && feed.isArtworkLoading && !feed.imageUrl

    const cardStyle = useMemo(
      () =>
        ({
          '--pc-stagger-index': `${index}`,
          '--pc-library-reveal-delay': '0ms',
        }) as CSSProperties,
      [index],
    )

    const handleSelect = useCallback(() => {
      onSelectFeed(feed)
    }, [feed, onSelectFeed])

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleSelect()
        }
      },
      [handleSelect],
    )

    return (
      <div
        className={`pcLibraryCard pcStaggerItem ${isCardRevealed ? 'isInView' : ''}`}
        data-rss-url={feed.rssUrl}
        style={cardStyle}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        title={feed.rssUrl}
        aria-label={`Load ${feed.title}`}
      >
        <div className="pcLibraryCardImageContainer">
          <div className="pcLibraryCardOverlay"></div>
          {isCardRevealed && (feed.imageUrl || shouldShowArtworkLoading) ? (
            <GlitchImage
              variant="card"
              wrapperClassName="pcGlitchImage--outsideFx"
              isInView={isCardRevealed}
              forceLoading={shouldShowArtworkLoading}
              startDelayMs={IMAGE_START_DELAY_MS}
              src={feed.imageUrl ?? undefined}
              alt={`${feed.title} cover art`}
              loading="lazy"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <div className="pcLibraryCardPlaceholder">
              <span className="material-symbols-outlined">podcasts</span>
            </div>
          )}
        </div>
      </div>
    )
  },
  (prevProps, nextProps) =>
    prevProps.index === nextProps.index &&
    prevProps.isCardRevealed === nextProps.isCardRevealed &&
    prevProps.onSelectFeed === nextProps.onSelectFeed &&
    prevProps.feed.rssUrl === nextProps.feed.rssUrl &&
    prevProps.feed.title === nextProps.feed.title &&
    prevProps.feed.imageUrl === nextProps.feed.imageUrl &&
    prevProps.feed.isArtworkLoading === nextProps.feed.isArtworkLoading,
)

export type LibraryMainViewProps = {
  isVisible: boolean
  libraryFeedsCount: number
  librarySortMode: LibrarySortMode
  setLibrarySortMode: Dispatch<SetStateAction<LibrarySortMode>>
  libraryQuery: string
  setLibraryQuery: Dispatch<SetStateAction<string>>
  libraryGridRef: MutableRefObject<HTMLDivElement | null>
  isMainStartupReady: boolean
  libraryFeedsView: LibraryFeedViewItem[]
  fetchLibraryFeedArtwork: (url: string) => Promise<void>
  onSelectFeed: (feed: DefaultFeed) => void
}

export const LibraryMainView = memo(function LibraryMainView({
  isVisible,
  libraryFeedsCount,
  librarySortMode,
  setLibrarySortMode,
  libraryQuery,
  setLibraryQuery,
  libraryGridRef,
  isMainStartupReady,
  libraryFeedsView,
  fetchLibraryFeedArtwork,
  onSelectFeed,
}: LibraryMainViewProps) {
  const [libraryGridSizing, setLibraryGridSizing] = useState<LibraryGridSizing>(
    () =>
      resolveLibraryGridSizing(
        typeof window === 'undefined' ? 1280 : window.innerWidth,
        typeof window === 'undefined' ? 900 : window.innerHeight,
      ),
  )
  const [revealedCardUrls, setRevealedCardUrls] = useState<Set<string>>(
    () => new Set(),
  )
  const [isHeaderHiddenOnScroll, setIsHeaderHiddenOnScroll] = useState(false)
  const revealTimersRef = useRef<Map<string, number>>(new Map())
  const queuedRevealUrlsRef = useRef<Set<string>>(new Set())
  const pendingRevealUrlsRef = useRef<Set<string>>(new Set())
  const revealFlushRafRef = useRef<number | null>(null)
  const virtualWindowRafRef = useRef<number | null>(null)
  const revealSequenceRef = useRef(0)
  const lastGridScrollTopRef = useRef(0)
  const [virtualWindow, setVirtualWindow] = useState<VirtualGridWindow>({
    columnCount: 1,
    rowCount: 0,
    startRow: 0,
    endRow: 0,
    rowGap: 24,
    rowHeight: 224,
  })
  const feedOrderKey = useMemo(
    () => libraryFeedsView.map((feed) => feed.rssUrl).join('\n'),
    [libraryFeedsView],
  )
  const visibleRange = useMemo(() => {
    if (libraryFeedsView.length === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
      }
    }
    const startIndex = Math.min(
      libraryFeedsView.length,
      virtualWindow.startRow * virtualWindow.columnCount,
    )
    const endIndex = Math.min(
      libraryFeedsView.length,
      virtualWindow.endRow * virtualWindow.columnCount,
    )
    return {
      startIndex,
      endIndex,
    }
  }, [libraryFeedsView.length, virtualWindow])
  const libraryGridStyle = useMemo(
    () =>
      ({
        '--pc-library-card-size': `${libraryGridSizing.cardSize}px`,
        '--pc-library-grid-gap': `${libraryGridSizing.gap}px`,
      }) as CSSProperties,
    [libraryGridSizing.cardSize, libraryGridSizing.gap],
  )
  const topSpacerHeight = useMemo(() => {
    if (virtualWindow.startRow <= 0) return 0
    return Math.max(
      0,
      virtualWindow.startRow * virtualWindow.rowHeight - virtualWindow.rowGap,
    )
  }, [virtualWindow.rowGap, virtualWindow.rowHeight, virtualWindow.startRow])
  const bottomSpacerHeight = useMemo(() => {
    const remainingRows = Math.max(0, virtualWindow.rowCount - virtualWindow.endRow)
    if (remainingRows <= 0) return 0
    return Math.max(
      0,
      remainingRows * virtualWindow.rowHeight - virtualWindow.rowGap,
    )
  }, [
    virtualWindow.endRow,
    virtualWindow.rowCount,
    virtualWindow.rowGap,
    virtualWindow.rowHeight,
  ])

  useEffect(() => {
    const currentUrls = new Set(
      feedOrderKey.length ? feedOrderKey.split('\n') : [],
    )
    const prune = (prev: Set<string>): Set<string> => {
      let changed = false
      const next = new Set<string>()
      for (const url of prev) {
        if (currentUrls.has(url)) {
          next.add(url)
          continue
        }
        changed = true
      }
      return changed ? next : prev
    }
    setRevealedCardUrls(prune)

    for (const [url, timer] of revealTimersRef.current) {
      if (currentUrls.has(url)) continue
      window.clearTimeout(timer)
      revealTimersRef.current.delete(url)
      queuedRevealUrlsRef.current.delete(url)
      pendingRevealUrlsRef.current.delete(url)
    }
  }, [feedOrderKey])

  const scheduleRevealFlush = useCallback(() => {
    if (revealFlushRafRef.current !== null) return
    revealFlushRafRef.current = window.requestAnimationFrame(() => {
      revealFlushRafRef.current = null
      if (!pendingRevealUrlsRef.current.size) return
      const urls = Array.from(pendingRevealUrlsRef.current)
      pendingRevealUrlsRef.current.clear()
      setRevealedCardUrls((prev) => {
        let changed = false
        const next = new Set(prev)
        for (const url of urls) {
          if (next.has(url)) continue
          next.add(url)
          changed = true
        }
        return changed ? next : prev
      })
    })
  }, [])

  useEffect(() => {
    return () => {
      for (const timer of revealTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      revealTimersRef.current.clear()
      queuedRevealUrlsRef.current.clear()
      pendingRevealUrlsRef.current.clear()
      if (revealFlushRafRef.current !== null) {
        window.cancelAnimationFrame(revealFlushRafRef.current)
        revealFlushRafRef.current = null
      }
      if (virtualWindowRafRef.current !== null) {
        window.cancelAnimationFrame(virtualWindowRafRef.current)
        virtualWindowRafRef.current = null
      }
      revealSequenceRef.current = 0
    }
  }, [])

  useEffect(() => {
    if (!isVisible) {
      setIsHeaderHiddenOnScroll(false)
      lastGridScrollTopRef.current = 0
      return
    }

    const gridElement = libraryGridRef.current
    if (!gridElement) return

    const TOP_SHOW_THRESHOLD_PX = 10
    const DIRECTION_THRESHOLD_PX = 6
    const measureVirtualWindow = (): void => {
      const { cardSize: minCardSize, gap } = resolveLibraryGridSizing(
        window.innerWidth,
        window.innerHeight,
      )
      setLibraryGridSizing((prev) => {
        if (prev.cardSize === minCardSize && prev.gap === gap) return prev
        return { cardSize: minCardSize, gap }
      })
      const style = window.getComputedStyle(gridElement)
      const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
      const paddingRight = Number.parseFloat(style.paddingRight) || 0
      const availableWidth = Math.max(
        0,
        gridElement.clientWidth - paddingLeft - paddingRight,
      )
      const columnCount = Math.max(
        1,
        Math.floor((availableWidth + gap) / Math.max(1, minCardSize + gap)),
      )
      const resolvedCardSize =
        columnCount <= 1
          ? availableWidth
          : (availableWidth - gap * (columnCount - 1)) / columnCount
      const rowHeight = Math.max(0, resolvedCardSize) + gap
      const rowCount = Math.ceil(libraryFeedsView.length / columnCount)

      if (rowCount === 0) {
        setVirtualWindow((prev) => {
          if (
            prev.columnCount === columnCount &&
            prev.rowCount === 0 &&
            prev.startRow === 0 &&
            prev.endRow === 0 &&
            prev.rowGap === gap &&
            prev.rowHeight === rowHeight
          ) {
            return prev
          }
          return {
            columnCount,
            rowCount: 0,
            startRow: 0,
            endRow: 0,
            rowGap: gap,
            rowHeight,
          }
        })
        return
      }

      const nextScrollTop = Math.max(0, gridElement.scrollTop)
      const viewportHeight = Math.max(0, gridElement.clientHeight)
      const startRow = Math.max(
        0,
        Math.floor(nextScrollTop / rowHeight) - VIRTUAL_OVERSCAN_ROWS,
      )
      const endRow = Math.min(
        rowCount,
        Math.ceil((nextScrollTop + viewportHeight) / rowHeight) +
          VIRTUAL_OVERSCAN_ROWS,
      )

      setVirtualWindow((prev) => {
        if (
          prev.columnCount === columnCount &&
          prev.rowCount === rowCount &&
          prev.startRow === startRow &&
          prev.endRow === endRow &&
          prev.rowGap === gap &&
          prev.rowHeight === rowHeight
        ) {
          return prev
        }
        return {
          columnCount,
          rowCount,
          startRow,
          endRow,
          rowGap: gap,
          rowHeight,
        }
      })
    }

    const scheduleVirtualWindowMeasure = (): void => {
      if (virtualWindowRafRef.current !== null) return
      virtualWindowRafRef.current = window.requestAnimationFrame(() => {
        virtualWindowRafRef.current = null
        measureVirtualWindow()
      })
    }

    const handleScroll = (): void => {
      const nextScrollTop = Math.max(0, gridElement.scrollTop)
      const delta = nextScrollTop - lastGridScrollTopRef.current
      lastGridScrollTopRef.current = nextScrollTop

      if (nextScrollTop <= TOP_SHOW_THRESHOLD_PX) {
        setIsHeaderHiddenOnScroll(false)
        scheduleVirtualWindowMeasure()
        return
      }

      if (delta > DIRECTION_THRESHOLD_PX) {
        setIsHeaderHiddenOnScroll(true)
      }

      scheduleVirtualWindowMeasure()
    }

    lastGridScrollTopRef.current = Math.max(0, gridElement.scrollTop)
    setIsHeaderHiddenOnScroll(lastGridScrollTopRef.current > TOP_SHOW_THRESHOLD_PX)
    measureVirtualWindow()
    gridElement.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', scheduleVirtualWindowMeasure)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleVirtualWindowMeasure()
      })
      resizeObserver.observe(gridElement)
    }

    return () => {
      gridElement.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', scheduleVirtualWindowMeasure)
      resizeObserver?.disconnect()
      if (virtualWindowRafRef.current !== null) {
        window.cancelAnimationFrame(virtualWindowRafRef.current)
        virtualWindowRafRef.current = null
      }
    }
  }, [isVisible, libraryFeedsView.length, libraryGridRef])

  useEffect(() => {
    if (!isVisible || !isMainStartupReady) return

    const gridElement = libraryGridRef.current
    if (!gridElement) return

    const feedOrder = feedOrderKey.length ? feedOrderKey.split('\n') : []
    const feedIndexByUrl = new Map(feedOrder.map((rssUrl, index) => [rssUrl, index]))
    const observedCards = new WeakSet<HTMLElement>()

    const processIntersectingUrls = (urls: string[]): void => {
      if (!urls.length) return
      const uniqueSorted = Array.from(new Set(urls)).sort((a, b) => {
        const aIndex = feedIndexByUrl.get(a) ?? Number.MAX_SAFE_INTEGER
        const bIndex = feedIndexByUrl.get(b) ?? Number.MAX_SAFE_INTEGER
        return aIndex - bIndex
      })

      uniqueSorted.forEach((url) => {
        void fetchLibraryFeedArtwork(url)
        if (queuedRevealUrlsRef.current.has(url)) return
        queuedRevealUrlsRef.current.add(url)
        const revealSlot = revealSequenceRef.current
        revealSequenceRef.current += 1

        const timer = window.setTimeout(() => {
          revealTimersRef.current.delete(url)
          pendingRevealUrlsRef.current.add(url)
          scheduleRevealFlush()
        }, revealSlot * REVEAL_STAGGER_MS)

        revealTimersRef.current.set(url, timer)
      })
    }

    if (typeof IntersectionObserver === 'undefined') {
      const allUrls = Array.from(
        gridElement.querySelectorAll<HTMLElement>('.pcLibraryCard[data-rss-url]'),
      )
        .map((card) => card.dataset.rssUrl)
        .filter((url): url is string => Boolean(url))
      processIntersectingUrls(allUrls)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const intersectingUrls: string[] = []
        for (const entry of entries) {
          const card = entry.target as HTMLElement
          const url = card.dataset.rssUrl
          if (!url) continue
          if (entry.isIntersecting) {
            observer.unobserve(card)
            intersectingUrls.push(url)
          }
        }
        processIntersectingUrls(intersectingUrls)
      },
      { root: gridElement, rootMargin: '120px 0px', threshold: 0.01 },
    )

    const observeCard = (card: HTMLElement): void => {
      if (observedCards.has(card)) return
      observedCards.add(card)
      observer.observe(card)
    }

    for (const card of gridElement.querySelectorAll<HTMLElement>(
      '.pcLibraryCard[data-rss-url]',
    )) {
      observeCard(card)
    }

    const getCardNodes = (root: HTMLElement): HTMLElement[] => {
      if (root.matches('.pcLibraryCard[data-rss-url]')) return [root]
      return Array.from(
        root.querySelectorAll<HTMLElement>('.pcLibraryCard[data-rss-url]'),
      )
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
      for (const timer of revealTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      revealTimersRef.current.clear()
      queuedRevealUrlsRef.current.clear()
      pendingRevealUrlsRef.current.clear()
      if (revealFlushRafRef.current !== null) {
        window.cancelAnimationFrame(revealFlushRafRef.current)
        revealFlushRafRef.current = null
      }
      revealSequenceRef.current = 0
    }
  }, [
    feedOrderKey,
    fetchLibraryFeedArtwork,
    isMainStartupReady,
    isVisible,
    libraryGridRef,
    scheduleRevealFlush,
  ])

  if (!isVisible) return null

  return (
    <div
      className={`pcLibraryScreen pcViewSurface pcViewSurfaceLibrary ${isHeaderHiddenOnScroll ? 'isHeaderScrollHidden' : ''}`}
    >
      <div className="pcLibraryHeader">
        <div className="pcLibraryHeaderContent">
          <div className="pcLibraryHeaderBadges">
            <span className="pcLibraryBadge">
              <ScrambleText text="Archive Node" durationMs={820} />
            </span>
            <span className="pcLibraryId">
              <ScrambleText
                text="/// USER_COLLECTION_001"
                durationMs={860}
                delayMs={70}
              />
            </span>
          </div>
          <p className="pcLibrarySubtitle">
            <ScrambleText
              text={`Synchronized Database / ${libraryFeedsCount} Active Subscriptions`}
              durationMs={900}
              delayMs={120}
            />
          </p>
        </div>
      </div>

      <div className="pcLibraryControls">
        <div className="pcLibraryControlsLeft">
          <div className="pcLibrarySort">
            <span className="pcLibraryLabel">Sort by:</span>
            <select
              className="pcLibrarySelect"
              value={librarySortMode}
              onChange={(event) =>
                setLibrarySortMode(event.target.value as LibrarySortMode)
              }
            >
              <option value="updated">Last Updated</option>
              <option value="alpha">Alphabetical</option>
              <option value="count">Episode Count</option>
            </select>
          </div>
          <div className="pcLibraryFilters">
            <span className="pcLibraryLabel">Filter:</span>
            <div className="pcLibraryFilterButtons">
              <button
                className="pcLibraryFilterButton active"
                disabled
                aria-disabled="true"
              >
                All
              </button>
              <button
                className="pcLibraryFilterButton"
                disabled
                aria-disabled="true"
              >
                Unplayed
              </button>
              <button
                className="pcLibraryFilterButton"
                disabled
                aria-disabled="true"
              >
                Downloaded
              </button>
            </div>
          </div>
        </div>
        <div className="pcLibrarySearch">
          <span className="material-symbols-outlined pcLibrarySearchIcon">
            search
          </span>
          <input
            className="pcLibrarySearchInput"
            type="text"
            placeholder="SEARCH LIBRARY..."
            value={libraryQuery}
            onChange={(event) => setLibraryQuery(event.target.value)}
          />
        </div>
      </div>

      <div
        className="pcLibraryGrid pcStaggerList"
        ref={libraryGridRef}
        style={libraryGridStyle}
      >
        {libraryFeedsView.length > 0 ? (
          <>
            {topSpacerHeight > 0 ? (
              <div
                className="pcLibraryVirtualSpacer"
                style={{ height: `${topSpacerHeight}px` }}
                aria-hidden="true"
              />
            ) : null}
            {libraryFeedsView
              .slice(visibleRange.startIndex, visibleRange.endIndex)
              .map((feed, offset) => {
                const index = visibleRange.startIndex + offset
                const isCardRevealed = revealedCardUrls.has(feed.rssUrl)
                return (
                  <LibraryCard
                    key={feed.rssUrl}
                    feed={feed}
                    index={index}
                    isCardRevealed={isCardRevealed}
                    onSelectFeed={onSelectFeed}
                  />
                )
              })}
            {bottomSpacerHeight > 0 ? (
              <div
                className="pcLibraryVirtualSpacer"
                style={{ height: `${bottomSpacerHeight}px` }}
                aria-hidden="true"
              />
            ) : null}
          </>
        ) : (
          <div className="pcEmpty">
            No sources match "{libraryQuery.trim()}".
          </div>
        )}
      </div>
    </div>
  )
})
