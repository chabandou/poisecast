import { memo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { PodcastEpisode } from '../../podcasts/types'
import { ScrambleText } from '../system/ScrambleText'
import { EpisodeList } from '../player/EpisodeList'
import { EpisodeRows } from '../player/EpisodeRows'

type ShowTitleParts = {
  head: string
  accent?: string
}

export type ShowDetailsMainViewProps = {
  isMobile: boolean
  isMobileShowDetailsView: boolean
  isDesktopShowDetailsView: boolean
  openMobileLibraryView: () => void
  isShowInfoLoading: boolean
  showArtwork: string | null
  showTitleRaw: string
  showNetworkLabel: string
  isCurrentShowFollowed: boolean
  followCurrentShow: () => void
  showGenres: string[]
  episodes: PodcastEpisode[]
  showDescription: string
  episodeReverse: boolean
  setEpisodeReverse: Dispatch<SetStateAction<boolean>>
  mobileVisibleEpisodes: PodcastEpisode[]
  loadingEpisodeId: string | null
  startEpisode: (episode: PodcastEpisode) => Promise<void>
  hasMoreMobileEpisodes: boolean
  loadMoreMobileEpisodes: () => void
  nowTitleRef: MutableRefObject<HTMLHeadingElement | null>
  showTitleParts: ShowTitleParts
  sectionTagLabel: string
  episodeQuery: string
  setEpisodeQuery: Dispatch<SetStateAction<string>>
  currentEpisodeGuid: string | null
  rssError: string | null
}

export const ShowDetailsMainView = memo(function ShowDetailsMainView({
  isMobile,
  isMobileShowDetailsView,
  isDesktopShowDetailsView,
  openMobileLibraryView,
  isShowInfoLoading,
  showArtwork,
  showTitleRaw,
  showNetworkLabel,
  isCurrentShowFollowed,
  followCurrentShow,
  showGenres,
  episodes,
  showDescription,
  episodeReverse,
  setEpisodeReverse,
  mobileVisibleEpisodes,
  loadingEpisodeId,
  startEpisode,
  hasMoreMobileEpisodes,
  loadMoreMobileEpisodes,
  nowTitleRef,
  showTitleParts,
  sectionTagLabel,
  episodeQuery,
  setEpisodeQuery,
  currentEpisodeGuid,
  rssError,
}: ShowDetailsMainViewProps) {
  if (!isMobileShowDetailsView && !isDesktopShowDetailsView) return null

  return (
    <>
      {isMobileShowDetailsView ? (
        <>
          <header className="pcMobileShowDetailsHeader">
            <button
              type="button"
              className="pcMobileHeaderButton"
              onClick={openMobileLibraryView}
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="pcMobileHeaderTitle">Show Details</h1>
            <button type="button" className="pcMobileHeaderButton">
              <span className="material-symbols-outlined">share</span>
            </button>
          </header>

          <div className="pcMobileShowDetails">
            <section className="pcMobileHeroSection">
              <div className="pcMobileArtworkContainer">
                <div className="pcMobileArtworkGlow"></div>
                <div className="pcMobileArtworkCard">
                  {isShowInfoLoading ? (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: 'var(--pc-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span className="pcSpinner" aria-label="Loading show artwork" />
                    </div>
                  ) : showArtwork ? (
                    <img
                      className="pcMobileArtworkCover"
                      src={showArtwork}
                      alt={`${showTitleRaw} cover art`}
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '120px',
                        color: 'rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      history_edu
                    </span>
                  )}
                </div>
              </div>
              <div className="pcMobileShowInfo">
                <h2 className="pcMobileShowTitle">{showTitleRaw}</h2>
                <p className="pcMobileShowHost">
                  Hosted by{' '}
                  <ScrambleText text={showNetworkLabel} durationMs={850} delayMs={180} />
                </p>
              </div>

              <div className="pcMobileActionRow">
                <button
                  type="button"
                  className={`pcMobileFollowButton ${isCurrentShowFollowed ? 'isFollowed' : ''}`}
                  onClick={followCurrentShow}
                  aria-pressed={isCurrentShowFollowed}
                  disabled={isShowInfoLoading}
                >
                  <span className="material-symbols-outlined fill-1">
                    {isCurrentShowFollowed ? 'check' : 'notifications'}
                  </span>
                  <span>{isCurrentShowFollowed ? 'Following' : 'Follow'}</span>
                </button>
                <button className="pcMobileDownloadButton">
                  <span className="material-symbols-outlined">download</span>
                </button>
              </div>
            </section>

            <section className="pcMobileMetadataGrid">
              <div className="pcMobileMetadataCard">
                <span className="pcMobileMetadataLabel">Audio Output</span>
                <div className="pcMobileMetadataValue">
                  <span className="material-symbols-outlined pcMobileMetadataIcon">waves</span>
                  <span>48kHz / 24-bit</span>
                </div>
              </div>
              <div className="pcMobileMetadataCard">
                <span className="pcMobileMetadataLabel">Frequency</span>
                <div className="pcMobileMetadataValue">
                  <span className="material-symbols-outlined pcMobileMetadataIcon">calendar_today</span>
                  <span>Weekly Update</span>
                </div>
              </div>
              <div className="pcMobileMetadataCard">
                <span className="pcMobileMetadataLabel">Genre</span>
                <div className="pcMobileMetadataValue">
                  <span className="material-symbols-outlined pcMobileMetadataIcon">settings_input_component</span>
                  <span>{showGenres[0] || 'Industrial'}</span>
                </div>
              </div>
              <div className="pcMobileMetadataCard">
                <span className="pcMobileMetadataLabel">Archive Size</span>
                <div className="pcMobileMetadataValue">
                  <span className="material-symbols-outlined pcMobileMetadataIcon">data_usage</span>
                  <span>{episodes.length} Episodes</span>
                </div>
              </div>
            </section>

            <section className="pcMobileDescriptionSection">
              <h3 className="pcMobileDescriptionHeader">Show Intelligence</h3>
              <div className="pcMobileDescriptionText">
                {showDescription
                  || 'A deep dive into the mechanical heart of modern synthesis and industrial soundscapes. Exploring the intersection of human error and machine precision.'}
              </div>
              <button className="pcMobileReadMoreButton">Read Full Protocol »</button>
            </section>

            <section className="pcMobileEpisodeList">
              <div className="pcMobileEpisodeListHeader">
                <h3 className="pcMobileEpisodeListTitle">Archived Transmissions</h3>
                <span
                  className="pcMobileEpisodeSortInfo"
                  role="button"
                  tabIndex={0}
                  onClick={() => setEpisodeReverse((prev) => !prev)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setEpisodeReverse((prev) => !prev)
                    }
                  }}
                >
                  SORT: {episodeReverse ? 'OLDEST_FIRST' : 'NEWEST_FIRST'}
                </span>
              </div>
              <div className="pcMobileEpisodeList">
                {isShowInfoLoading ? (
                  <div className="pcItemStatus pcLoadingText">LOADING EPISODES...</div>
                ) : (
                  mobileVisibleEpisodes.map((episode, index) => (
                    <div key={episode.guid} className="pcMobileEpisodeCard">
                      <div className="pcMobileEpisodeContent">
                        <span className="pcMobileEpisodeNumber">EP_{episodes.length - index}</span>
                        <h4 className="pcMobileEpisodeTitle">{episode.title}</h4>
                        <p className="pcMobileEpisodeDescription">{episode.description}</p>
                        <div className="pcMobileEpisodeMeta">
                          <span className="pcMobileEpisodeMetaItem">
                            <span className="material-symbols-outlined pcMobileEpisodeMetaIcon">schedule</span>
                            {episode.duration || '--:--'}
                          </span>
                          <span className="pcMobileEpisodeMetaItem">
                            <span className="material-symbols-outlined pcMobileEpisodeMetaIcon">calendar_month</span>
                            {episode.pubDate
                              ? new Date(episode.pubDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '--'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="pcMobileEpisodePlayButton"
                        disabled={loadingEpisodeId === episode.guid}
                        onClick={() => void startEpisode(episode)}
                      >
                        <span className="material-symbols-outlined fill-1">play_arrow</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
              {!isShowInfoLoading && hasMoreMobileEpisodes ? (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <button
                    type="button"
                    className="pcMobileLoadMoreButton"
                    onClick={loadMoreMobileEpisodes}
                  >
                    Load Previous Data_Blocks
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        </>
      ) : null}

      {isDesktopShowDetailsView ? (
        <>
          <section className="pcShowDetails">
            <div className="pcShowDetailsInner">
              <div className="pcShowArtwork">
                <div className="pcShowArtworkCard">
                  {isShowInfoLoading ? (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: 'var(--pc-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span className="pcSpinner" aria-label="Loading show artwork" />
                    </div>
                  ) : showArtwork ? (
                    <img
                      className="pcShowArtworkCover"
                      src={showArtwork}
                      alt={`${showTitleRaw} cover art`}
                      loading="lazy"
                    />
                  ) : (
                    <span className="material-symbols-outlined pcShowArtworkIcon">history_edu</span>
                  )}
                </div>
              </div>
              <div className="pcShowInfo">
                <div className="pcShowMeta">
                  <div className="pcShowGenres">
                    {showGenres.map((genre, index) => (
                      <span
                        key={`${genre}-${index}`}
                        className={`pcGenreBox ${index === 0 ? 'pcGenrePrimary' : ''}`}
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                  <span className="pcShowNetwork">
                    <ScrambleText text={showNetworkLabel} durationMs={850} delayMs={180} />
                  </span>
                </div>
                <h2 ref={nowTitleRef} className="pcShowTitle">
                  {isShowInfoLoading ? (
                    'LOADING SHOW...'
                  ) : (
                    <ScrambleText text={showTitleParts.head} durationMs={950} />
                  )}
                  {!isShowInfoLoading && showTitleParts.accent ? (
                    <>
                      {' '}
                      <span className="pcShowTitleAccent">
                        <ScrambleText
                          text={showTitleParts.accent ?? ''}
                          durationMs={900}
                          delayMs={90}
                        />
                      </span>
                    </>
                  ) : null}
                </h2>
                <div className="pcShowDescription">
                  <p>{showDescription}</p>
                </div>
              </div>
            </div>
          </section>

          {!isMobile ? (
            <section className="pcEpisodes pcChamfer">
              <div className="pcSectionHead">
                <div className="pcSectionTitle">
                  Archive Records
                  <span className="pcSectionTag">
                    <ScrambleText text={sectionTagLabel} durationMs={850} delayMs={260} />
                  </span>
                </div>
                <div className="pcSectionTools">
                  <div className="pcFilter">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="pcFilterIcon"
                    >
                      <circle cx="11" cy="11" r="6"></circle>
                      <path d="M20 20l-3.2-3.2"></path>
                    </svg>
                    <input
                      className="pcFilterInput"
                      value={episodeQuery}
                      placeholder="FILTER ARCHIVE..."
                      onChange={(event) => setEpisodeQuery(event.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className={`pcSortBtn ${episodeReverse ? 'active' : ''}`}
                    onClick={() => setEpisodeReverse((prev) => !prev)}
                    aria-pressed={episodeReverse}
                    title="Reverse episode order"
                  >
                    {episodeReverse ? 'ORDER: REVERSED' : 'ORDER: DEFAULT'}
                  </button>
                </div>
              </div>

              <EpisodeList
                items={
                  isShowInfoLoading ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="pcItemStatus pcLoadingText"
                        style={{ padding: '20px' }}
                      >
                        LOADING EPISODES...
                      </td>
                    </tr>
                  ) : (
                    <EpisodeRows
                      episodes={episodes}
                      activeEpisodeGuid={currentEpisodeGuid}
                      loadingEpisodeId={loadingEpisodeId}
                      onStartEpisode={startEpisode}
                    />
                  )
                }
                hasEpisodes={isShowInfoLoading || episodes.length > 0}
              />
              {!isShowInfoLoading && rssError ? <div className="pcError">{rssError}</div> : null}
            </section>
          ) : null}
        </>
      ) : null}
    </>
  )
})
