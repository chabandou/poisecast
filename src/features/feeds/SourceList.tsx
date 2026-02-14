import { memo, type CSSProperties } from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import { normalizeFeedUrlKey } from './feedUtils'

type SourceListProps = {
  feeds: DefaultFeed[]
  activeUrl: string
  rssLoading: boolean
  loadingFeedUrl: string | null
  onSelect: (feed: DefaultFeed) => void
}

export const SourceList = memo(function SourceList({
  feeds,
  activeUrl,
  rssLoading,
  loadingFeedUrl,
  onSelect,
}: SourceListProps) {
  if (rssLoading && feeds.length === 0) {
    return (
      <div className="pcSourceList pcListStack pcStaggerList" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <button
            key={`source-skeleton-${index}`}
            className="pcSourceItem pcSourceItemSkeleton pcStaggerItem"
            disabled
            style={
              {
                '--pc-stagger-index': `${index}`,
              } as CSSProperties
            }
          >
            <div className="pcSourceItemTitle pcSkeletonLine pcSkeletonW70" />
            <div className="pcSourceItemMeta">
              <span className="pcSourceUrl pcSkeletonLine pcSkeletonW85" />
            </div>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="pcSourceList pcListStack pcStaggerList">
      {feeds.map((feed, index) => {
        const isActive = normalizeFeedUrlKey(activeUrl) === normalizeFeedUrlKey(feed.rssUrl)
        const isLoading =
          loadingFeedUrl !== null && normalizeFeedUrlKey(feed.rssUrl) === normalizeFeedUrlKey(loadingFeedUrl)
        return (
          <button
            key={feed.rssUrl}
            className={`pcSourceItem pcStaggerItem ${isActive ? 'active' : ''} ${isLoading ? 'isLoading' : ''}`}
            disabled={rssLoading || isLoading}
            style={
              {
                '--pc-stagger-index': `${index}`,
              } as CSSProperties
            }
            onClick={() => onSelect(feed)}
          >
            <div className="pcSourceItemTitle">{feed.title}</div>
            <div className="pcSourceItemMeta">
              <span className="pcSourceUrl">{feed.rssUrl}</span>
              {isActive ? <span className="pcActiveIndicator"></span> : null}
            </div>
          </button>
        )
      })}
    </div>
  )
})
