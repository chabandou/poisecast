import { memo } from 'react'
import type { ApplePodcastResult } from '../../podcasts/appleSearch'

type SearchResultsProps = {
  results: ApplePodcastResult[]
  rssLoading: boolean
  loadingFeedUrl: string | null
  onSelect: (result: ApplePodcastResult) => void
}

export const SearchResults = memo(function SearchResults({
  results,
  rssLoading,
  loadingFeedUrl,
  onSelect,
}: SearchResultsProps) {
  if (!results.length) return null
  return (
    <div className="pcSearchResults">
      {results.map((result) => {
        const isLoading = Boolean(loadingFeedUrl) && result.feedUrl === loadingFeedUrl
        return (
          <button
            key={result.collectionId}
            className={`pcSearchItem pcChamfer ${isLoading ? 'isLoading' : ''}`}
            disabled={!result.feedUrl || rssLoading || isLoading}
            title={result.feedUrl ? result.feedUrl : 'No RSS URL provided by Apple for this result'}
            onClick={() => {
              if (!result.feedUrl) return
              onSelect(result)
            }}
          >
            <div className="pcSearchItemTitle">{result.collectionName}</div>
            <div className="pcSearchItemMeta">
              {result.artistName ? <span className="pcPill">{result.artistName}</span> : null}
              {result.primaryGenreName ? <span className="pcPill">{result.primaryGenreName}</span> : null}
              {result.collectionViewUrl ? (
                <a
                  className="pcLink"
                  href={result.collectionViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  Open in Apple
                </a>
              ) : null}
            </div>
            {result.feedUrl ? <div className="pcMonoUrl">{result.feedUrl}</div> : null}
            {isLoading ? <div className="pcItemStatus">LOADING…</div> : null}
          </button>
        )
      })}
    </div>
  )
})
