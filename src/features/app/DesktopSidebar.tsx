import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import { SourceList } from '../feeds/SourceList'
import { formatIssueSource, type IssueEntry } from '../system/useIssueLog'

type DesktopSidebarProps = {
  isVisible: boolean
  isSidebarCollapsed: boolean
  desktopView: 'library' | 'discover' | 'showDetails'
  openLibraryView: () => void
  openDiscoverView: () => void
  libraryFeeds: DefaultFeed[]
  rssUrl: string
  rssLoading: boolean
  loadingFeedUrl: string | null
  onSelectSource: (feed: DefaultFeed) => void
  sidebarIssues: IssueEntry[]
  clearSidebarIssues: () => void
}

export function DesktopSidebar({
  isVisible,
  isSidebarCollapsed,
  desktopView,
  openLibraryView,
  openDiscoverView,
  libraryFeeds,
  rssUrl,
  rssLoading,
  loadingFeedUrl,
  onSelectSource,
  sidebarIssues,
  clearSidebarIssues,
}: DesktopSidebarProps) {
  if (!isVisible) return null

  return (
    <aside className={`pcSidebar pcChamfer ${isSidebarCollapsed ? 'pcSidebarCollapsed' : ''}`}>
      <div className="pcSidebarBody">
        <>
          <div className="pcNavigation pcListStack">
            <button
              type="button"
              className={`pcNavigationItem ${desktopView === 'library' ? 'active' : ''}`}
              onClick={openLibraryView}
            >
              <div className="pcNavigationContent">
                <div className="pcNavigationTitle">Library</div>
                <div className="pcNavigationMeta">
                  <span className="pcNavigationUrl">Personal Archive</span>
                </div>
              </div>
              <div className="pcNavigationIcon">
                <span className="material-symbols-outlined">library_books</span>
              </div>
            </button>
            <button
              type="button"
              className={`pcNavigationItem ${desktopView === 'discover' ? 'active' : ''}`}
              onClick={openDiscoverView}
            >
              <div className="pcNavigationContent">
                <div className="pcNavigationTitle">Discover</div>
                <div className="pcNavigationMeta">
                  <span className="pcNavigationUrl">Global Network</span>
                </div>
              </div>
              <div className="pcNavigationIcon">
                <span className="material-symbols-outlined">explore</span>
              </div>
            </button>
          </div>

          <div
            className={`pcSidebarExpandedSection ${isSidebarCollapsed ? 'isCollapsed' : ''}`}
            aria-hidden={isSidebarCollapsed}
          >
            <div className="pcSidebarHead" style={{ paddingTop: '24px', paddingBottom: '8px' }}>
              <div
                className="pcSidebarTitle"
                style={{
                  fontSize: '9px',
                  letterSpacing: '0.2em',
                  opacity: 0.4,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                  rss_feed
                </span>
                Recent Feeds
              </div>
            </div>

            <SourceList
              feeds={libraryFeeds}
              activeUrl={rssUrl}
              rssLoading={rssLoading}
              loadingFeedUrl={loadingFeedUrl}
              onSelect={onSelectSource}
            />
            {sidebarIssues.length > 0 ? (
              <div className="pcSidebarFoot pcSidebarIssues" role="status" aria-live="polite">
                <div className="pcSidebarIssuesHeader">
                  <h4 className="pcFeedMetaTitle">System Alerts ({sidebarIssues.length})</h4>
                  <button
                    type="button"
                    className="pcSidebarIssuesClear"
                    onClick={clearSidebarIssues}
                  >
                    Clear
                  </button>
                </div>
                <div className="pcSidebarIssuesList">
                  {sidebarIssues.map((issue) => (
                    <article key={issue.id} className="pcSidebarIssueItem">
                      <div className="pcSidebarIssueTop">
                        <span className="pcSidebarIssueSource">{formatIssueSource(issue.source)}</span>
                        <span className="pcSidebarIssueTime">
                          {new Date(issue.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="pcSidebarIssueSummary">{issue.summary}</p>
                      <p className="pcSidebarIssueDetail">{issue.detail}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </>
      </div>
    </aside>
  )
}
