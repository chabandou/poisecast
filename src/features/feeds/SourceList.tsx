import { memo, type CSSProperties } from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import { normalizeFeedUrlKey } from './feedUtils'
import { ScrambleText } from '../system/ScrambleText'

export type SourceListFeed = DefaultFeed & {
  lastEpisodeTitle: string
  lastPlayedAt: number
}

type SourceListProps = {
  feeds: SourceListFeed[]
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
            <div className="pcSourceItemTitle pcSkeletonLine pcSkeletonScramble pcSkeletonW70">
              <ScrambleText
                text="INITIALIZING SOURCE"
                durationMs={720}
                delayMs={index * 44}
                loop
                loopDelayMs={120}
              />
            </div>
            <div className="pcSourceItemMeta">
              <span className="pcSourceLastEpisode pcSkeletonLine pcSkeletonScramble pcSkeletonW85">
                <ScrambleText
                  text="FETCHING LATEST TRANSMISSION"
                  durationMs={780}
                  delayMs={index * 44 + 80}
                  loop
                  loopDelayMs={130}
                />
              </span>
            </div>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="pcSourceList pcListStack pcStaggerList">
      {feeds.length === 0 ? <div className="pcEmpty">No recently played shows yet.</div> : null}
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
              <span className="pcSourceLastEpisode">{feed.lastEpisodeTitle}</span>
              {isActive ? <span className="pcActiveIndicator"></span> : null}
            </div>
          </button>
        )
      })}
    </div>
  )
})
