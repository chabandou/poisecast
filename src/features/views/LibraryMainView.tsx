import { memo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import type { LibraryFeedViewItem } from '../feeds/useFeedPresentationModel'

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
    <div className="pcLibraryScreen">
      <div className="pcLibraryHeader">
        <div className="pcLibraryHeaderContent">
          <div className="pcLibraryHeaderBadges">
            <span className="pcLibraryBadge">Archive Node</span>
            <span className="pcLibraryId">/// USER_COLLECTION_001</span>
          </div>
          <p className="pcLibrarySubtitle">
            Synchronized Database / {libraryFeedsCount} Active Subscriptions
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
              onChange={(event) => setLibrarySortMode(event.target.value as LibrarySortMode)}
            >
              <option value="updated">Last Updated</option>
              <option value="alpha">Alphabetical</option>
              <option value="count">Episode Count</option>
            </select>
          </div>
          <div className="pcLibraryFilters">
            <span className="pcLibraryLabel">Filter:</span>
            <div className="pcLibraryFilterButtons">
              <button className="pcLibraryFilterButton active" disabled aria-disabled="true">
                All
              </button>
              <button className="pcLibraryFilterButton" disabled aria-disabled="true">
                Unplayed
              </button>
              <button className="pcLibraryFilterButton" disabled aria-disabled="true">
                Downloaded
              </button>
            </div>
          </div>
        </div>
        <div className="pcLibrarySearch">
          <span className="material-symbols-outlined pcLibrarySearchIcon">search</span>
          <input
            className="pcLibrarySearchInput"
            type="text"
            placeholder="SEARCH LIBRARY..."
            value={libraryQuery}
            onChange={(event) => setLibraryQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="pcLibraryGrid" ref={libraryGridRef}>
        {libraryFeedsView.length > 0 ? (
          libraryFeedsView.map((feed) => {
            return (
              <div
                key={feed.rssUrl}
                className="pcLibraryCard"
                data-rss-url={feed.rssUrl}
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
                    <img
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
                      <span className="material-symbols-outlined">history_edu</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="pcEmpty">No sources match "{libraryQuery.trim()}".</div>
        )}
      </div>
    </div>
  )
})
