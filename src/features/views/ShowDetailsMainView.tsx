import {
  useCallback,
  useEffect,
  useState,
  memo,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  type UIEvent,
} from 'react'
import type { PodcastEpisode } from '../../podcasts/types'
import { ScrambleText } from '../system/ScrambleText'
import { EpisodeList } from '../player/EpisodeList'
import { EpisodeRows } from '../player/EpisodeRows'
import { GlitchImage } from '../../ui/GlitchImage'

type ShowTitleParts = {
  head: string
  accent?: string
}

const SHOW_DETAILS_HIDE_SCROLL_THRESHOLD_PX = 18
const SHOW_DETAILS_REVEAL_SCROLL_THRESHOLD_PX = 4

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
  const [isShowDetailsScrolledOut, setIsShowDetailsScrolledOut] = useState(false)

  useEffect(() => {
    if (!isDesktopShowDetailsView) setIsShowDetailsScrolledOut(false)
  }, [isDesktopShowDetailsView])

  const handleEpisodeListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop
    setIsShowDetailsScrolledOut((prev) => {
      if (prev) return scrollTop > SHOW_DETAILS_REVEAL_SCROLL_THRESHOLD_PX
      return scrollTop > SHOW_DETAILS_HIDE_SCROLL_THRESHOLD_PX
    })
  }, [])

  const desktopEpisodeSkeletonRows = Array.from({ length: 6 }, (_, index) => (
    <tr
      key={`desktop-episode-skeleton-${index}`}
      className="pcEpisodeItem pcEpisodeItemSkeleton pcStaggerItem"
      style={
        {
          '--pc-stagger-index': `${index}`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <td>
        <div className="pcEpisodeIcon pcSkeletonBlock" />
      </td>
      <td>
        <div className="pcEpisodeBody">
          <div className="pcEpisodeTitle pcSkeletonLine pcSkeletonScramble pcSkeletonW70">
            <ScrambleText
              text="DECODING EPISODE PAYLOAD"
              durationMs={740}
              delayMs={index * 42}
              loop
              loopDelayMs={120}
            />
          </div>
          <div className="pcEpisodeMeta">
            <span className="pcSkeletonLine pcSkeletonScramble pcSkeletonW22">
              <ScrambleText
                text="RUNTIME"
                durationMs={620}
                delayMs={index * 42 + 80}
                loop
                loopDelayMs={110}
              />
            </span>
            <span className="pcMetaSeparator">|</span>
            <span className="pcSkeletonLine pcSkeletonScramble pcSkeletonW18">
              <ScrambleText
                text="DATE"
                durationMs={560}
                delayMs={index * 42 + 120}
                loop
                loopDelayMs={110}
              />
            </span>
          </div>
        </div>
      </td>
      <td style={{ textAlign: 'right' }}>
        <span className="pcEpisodeSize pcSkeletonLine pcSkeletonScramble pcSkeletonW25">
          <ScrambleText
            text="SIZE"
            durationMs={560}
            delayMs={index * 42 + 150}
            loop
            loopDelayMs={110}
          />
        </span>
      </td>
    </tr>
  ))

  const mobileEpisodeSkeletonCards = Array.from({ length: 4 }, (_, index) => (
    <div
      key={`mobile-episode-skeleton-${index}`}
      className="pcMobileEpisodeCard pcMobileEpisodeCardSkeleton pcStaggerItem"
      style={
        {
          '--pc-stagger-index': `${index}`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <div className="pcMobileEpisodeContent">
        <span className="pcMobileEpisodeNumber pcSkeletonLine pcSkeletonScramble pcSkeletonW24">
          <ScrambleText
            text={`EP_${index + 1}`}
            durationMs={560}
            delayMs={index * 48}
            loop
            loopDelayMs={110}
          />
        </span>
        <h4 className="pcMobileEpisodeTitle pcSkeletonLine pcSkeletonScramble pcSkeletonW78">
          <ScrambleText
            text="INITIALIZING TRANSCRIPT"
            durationMs={720}
            delayMs={index * 48 + 60}
            loop
            loopDelayMs={120}
          />
        </h4>
        <p className="pcMobileEpisodeDescription pcSkeletonLine pcSkeletonScramble pcSkeletonW92">
          <ScrambleText
            text="LOADING SUMMARY BLOCK"
            durationMs={740}
            delayMs={index * 48 + 100}
            loop
            loopDelayMs={130}
          />
        </p>
        <div className="pcMobileEpisodeMeta">
          <span className="pcMobileEpisodeMetaItem pcSkeletonLine pcSkeletonScramble pcSkeletonW18">
            <ScrambleText
              text="TIME"
              durationMs={560}
              delayMs={index * 48 + 140}
              loop
              loopDelayMs={110}
            />
          </span>
          <span className="pcMobileEpisodeMetaItem pcSkeletonLine pcSkeletonScramble pcSkeletonW24">
            <ScrambleText
              text="STAMP"
              durationMs={560}
              delayMs={index * 48 + 170}
              loop
              loopDelayMs={110}
            />
          </span>
        </div>
      </div>
      <span className="pcMobileEpisodePlayButton pcSkeletonBlock" />
    </div>
  ))

  return (
    <>
      {isMobileShowDetailsView ? (
        <div className="pcViewSurface pcViewSurfaceShowDetails">
          <header className="pcMobileShowDetailsHeader">
            <button
              type="button"
              className="pcMobileHeaderButton"
              onClick={openMobileLibraryView}
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="pcMobileHeaderTitle">
              <ScrambleText text="Show Details" durationMs={800} />
            </h1>
            <button type="button" className="pcMobileHeaderButton">
              <span className="material-symbols-outlined">share</span>
            </button>
          </header>

          <div className="pcMobileShowDetails">
            <section className="pcMobileHeroSection">
              <div className="pcMobileArtworkContainer">
                <div className="pcMobileArtworkGlow"></div>
                <div className="pcMobileArtworkCard">
                  {showArtwork ? (
                    <GlitchImage
                      variant="artwork"
                      wrapperClassName="pcGlitchImage--outsideFx"
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
                      podcasts
                    </span>
                  )}
                </div>
              </div>
              <div className="pcMobileShowInfo">
                <h2 className="pcMobileShowTitle">{showTitleRaw}</h2>
                <p className="pcMobileShowHost">
                  Hosted by{' '}
                  <ScrambleText
                    text={showNetworkLabel}
                    durationMs={850}
                    delayMs={180}
                  />
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
                  <span className="material-symbols-outlined pcMobileMetadataIcon">
                    waves
                  </span>
                  <span>48kHz / 24-bit</span>
                </div>
              </div>
              <div className="pcMobileMetadataCard">
                <span className="pcMobileMetadataLabel">Frequency</span>
                <div className="pcMobileMetadataValue">
                  <span className="material-symbols-outlined pcMobileMetadataIcon">
                    calendar_today
                  </span>
                  <span>Weekly Update</span>
                </div>
              </div>
              <div className="pcMobileMetadataCard">
                <span className="pcMobileMetadataLabel">Genre</span>
                <div className="pcMobileMetadataValue">
                  <span className="material-symbols-outlined pcMobileMetadataIcon">
                    settings_input_component
                  </span>
                  <span>{showGenres[0] || 'Industrial'}</span>
                </div>
              </div>
              <div className="pcMobileMetadataCard">
                <span className="pcMobileMetadataLabel">Archive Size</span>
                <div className="pcMobileMetadataValue">
                  <span className="material-symbols-outlined pcMobileMetadataIcon">
                    data_usage
                  </span>
                  <span>{episodes.length} Episodes</span>
                </div>
              </div>
            </section>

            <section className="pcMobileDescriptionSection">
              <h3 className="pcMobileDescriptionHeader">Show Intelligence</h3>
              <div className="pcMobileDescriptionText">
                {showDescription ||
                  'A deep dive into the mechanical heart of modern synthesis and industrial soundscapes. Exploring the intersection of human error and machine precision.'}
              </div>
              <button className="pcMobileReadMoreButton">
                Read Full Protocol »
              </button>
            </section>

            <section className="pcMobileEpisodeList">
              <div className="pcMobileEpisodeListHeader">
                <h3 className="pcMobileEpisodeListTitle">
                  Archived Transmissions
                </h3>
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
              <div className="pcMobileEpisodeList pcStaggerList">
                {isShowInfoLoading ? (
                  <div className="pcStaggerList">
                    {mobileEpisodeSkeletonCards}
                  </div>
                ) : (
                  mobileVisibleEpisodes.map((episode, index) => (
                    <div
                      key={episode.guid}
                      className="pcMobileEpisodeCard pcStaggerItem"
                      style={
                        {
                          '--pc-stagger-index': `${index}`,
                        } as CSSProperties
                      }
                    >
                      <div className="pcMobileEpisodeContent">
                        <span className="pcMobileEpisodeNumber">
                          EP_{episodes.length - index}
                        </span>
                        <h4 className="pcMobileEpisodeTitle">
                          {episode.title}
                        </h4>
                        <p className="pcMobileEpisodeDescription">
                          {episode.description}
                        </p>
                        <div className="pcMobileEpisodeMeta">
                          <span className="pcMobileEpisodeMetaItem">
                            <span className="material-symbols-outlined pcMobileEpisodeMetaIcon">
                              schedule
                            </span>
                            {episode.duration || '--:--'}
                          </span>
                          <span className="pcMobileEpisodeMetaItem">
                            <span className="material-symbols-outlined pcMobileEpisodeMetaIcon">
                              calendar_month
                            </span>
                            {episode.pubDate
                              ? new Date(episode.pubDate).toLocaleDateString(
                                  'en-US',
                                  {
                                    month: 'short',
                                    day: 'numeric',
                                  },
                                )
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
                        <span className="material-symbols-outlined fill-1">
                          play_arrow
                        </span>
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
        </div>
      ) : null}

      {isDesktopShowDetailsView ? (
        <div className="pcViewSurface pcViewSurfaceShowDetails">
          <section className={`pcShowDetails ${isShowDetailsScrolledOut ? 'isScrolledOut' : ''}`}>
            <div className="pcShowDetailsInner">
              <div className="pcShowArtwork">
                <div className="pcShowArtworkCard">
                  {showArtwork ? (
                    <GlitchImage
                      variant="artwork"
                      wrapperClassName="pcGlitchImage--outsideFx"
                      className="pcShowArtworkCover"
                      src={showArtwork}
                      alt={`${showTitleRaw} cover art`}
                      loading="lazy"
                    />
                  ) : (
                    <span className="material-symbols-outlined pcShowArtworkIcon">
                      podcasts
                    </span>
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
                    <ScrambleText
                      text={showNetworkLabel}
                      durationMs={850}
                      delayMs={180}
                    />
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
                  <ScrambleText text="Archive Records" durationMs={840} />
                  <span className="pcSectionTag">
                    <ScrambleText
                      text={sectionTagLabel}
                      durationMs={850}
                      delayMs={260}
                    />
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
                    desktopEpisodeSkeletonRows
                  ) : (
                    <EpisodeRows
                      episodes={episodes}
                      activeEpisodeGuid={currentEpisodeGuid}
                      loadingEpisodeId={loadingEpisodeId}
                      showArtworkUrl={showArtwork}
                      onStartEpisode={startEpisode}
                    />
                  )
                }
                hasEpisodes={isShowInfoLoading || episodes.length > 0}
                onScroll={handleEpisodeListScroll}
              />
              {!isShowInfoLoading && rssError ? (
                <div className="pcError">{rssError}</div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </>
  )
})
