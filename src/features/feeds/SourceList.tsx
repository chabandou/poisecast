import { memo } from 'react'
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
  return (
    <div className="pcSourceList pcListStack">
      {feeds.map((feed) => {
        const isActive = normalizeFeedUrlKey(activeUrl) === normalizeFeedUrlKey(feed.rssUrl)
        const isLoading =
          loadingFeedUrl !== null && normalizeFeedUrlKey(feed.rssUrl) === normalizeFeedUrlKey(loadingFeedUrl)
        return (
          <button
            key={feed.rssUrl}
            className={`pcSourceItem ${isActive ? 'active' : ''} ${isLoading ? 'isLoading' : ''}`}
            disabled={rssLoading || isLoading}
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
