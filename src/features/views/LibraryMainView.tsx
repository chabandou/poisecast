import {
  memo,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import type { LibraryFeedViewItem } from '../feeds/useFeedPresentationModel'
import { ScrambleText } from '../system/ScrambleText'
import { GlitchImage } from '../../ui/GlitchImage'

type LibrarySortMode = 'updated' | 'alpha' | 'count'

export type LibraryMainViewProps = {
  isVisible: boolean
  libraryFeedsCount: number
  librarySortMode: LibrarySortMode
  setLibrarySortMode: Dispatch<SetStateAction<LibrarySortMode>>
  libraryQuery: string
  setLibraryQuery: Dispatch<SetStateAction<string>>
  libraryGridRef: MutableRefObject<HTMLDivElement | null>
  libraryFeedsView: LibraryFeedViewItem[]
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
  libraryFeedsView,
  onSelectFeed,
}: LibraryMainViewProps) {
  if (!isVisible) return null

  return (
    <div className="pcLibraryScreen pcViewSurface pcViewSurfaceLibrary">
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

      <div className="pcLibraryGrid pcStaggerList" ref={libraryGridRef}>
        {libraryFeedsView.length > 0 ? (
          libraryFeedsView.map((feed, index) => {
            const cardRevealDelayMs = 220 + index * 118
            const imageStartDelayMs = Math.min(cardRevealDelayMs + 260, 1960)
            return (
              <div
                key={feed.rssUrl}
                className="pcLibraryCard pcStaggerItem"
                data-rss-url={feed.rssUrl}
                style={
                  {
                    '--pc-stagger-index': `${index}`,
                    '--pc-library-reveal-delay': `${cardRevealDelayMs}ms`,
                  } as CSSProperties
                }
                onClick={() => onSelectFeed(feed)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectFeed(feed)
                  }
                }}
                role="button"
                tabIndex={0}
                title={feed.rssUrl}
                aria-label={`Load ${feed.title}`}
              >
                <div className="pcLibraryCardImageContainer">
                  <div className="pcLibraryCardOverlay"></div>
                  {feed.imageUrl ? (
                    <GlitchImage
                      variant="card"
                      wrapperClassName="pcGlitchImage--outsideFx"
                      startDelayMs={imageStartDelayMs}
                      src={feed.imageUrl}
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
                      <span className="material-symbols-outlined">
                        history_edu
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="pcEmpty">
            No sources match "{libraryQuery.trim()}".
          </div>
        )}
      </div>
    </div>
  )
})
