import {
  memo,
  type CSSProperties,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
} from 'react'
import type { PodcastEpisode } from '../../podcasts/types'
import { SHOW_EPISODE_ARTWORK } from '../../config/featureFlags'
import { IconNext, IconPause, IconPlay, IconPrev } from '../../ui/icons'
import { ScrambleText } from '../system/ScrambleText'
import { formatClock } from './playbackMath'
import { useAudioTimeline } from './useAudioTimeline'
import { usePlaybackLoadingGlyph } from './usePlaybackLoadingGlyph'

export type DesktopFooterProps = {
  isVisible: boolean
  audioRef: RefObject<HTMLAudioElement | null>
  episode: PodcastEpisode | null
  episodesAll: PodcastEpisode[]
  isFooterClosing: boolean
  isFooterExpanding: boolean
  isFooterExpanded: boolean
  isFooterCollapsing: boolean
  onProgressPointer: (event: PointerEvent<HTMLDivElement>) => void
  toggleFooterExpansion: () => void
  footerPanActive: boolean
  footerTitlePanRef: MutableRefObject<HTMLSpanElement | null>
  footerShowPanRef: MutableRefObject<HTMLSpanElement | null>
  footerPanSharedStyle: CSSProperties
  footerTitlePanStyle: CSSProperties
  footerShowPanStyle: CSSProperties
  footerEpisodeTitle: string
  footerEpisodeShow: string
  showArtworkUrl: string | null
  canPrev: boolean
  canNext: boolean
  playPrev: () => void
  playNext: () => void
  seekBySeconds: (deltaSeconds: number) => void
  togglePlayPause: () => Promise<void>
  isPlaying: boolean
  isEpisodeLoading: boolean
  denoiseEnabled: boolean
  modelSupported: boolean
  isProcessingStarting: boolean
  toggleDenoise: (next: boolean) => Promise<void>
  footerProcessTooltip: string
  onVolumeWheel: (event: WheelEvent<HTMLDivElement>) => void
  toggleMute: () => void
  volume: number
  footerVolumeIcon: string
  footerVolumePct: number
  onVolumePointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onVolumeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  isFooterDescriptionExpanded: boolean
  isFooterDescriptionOverflowing: boolean
  footerDescriptionRef: MutableRefObject<HTMLDivElement | null>
  footerDescriptionStyle?: CSSProperties
  footerDescriptionHtml: string
  toggleFooterDescriptionExpanded: () => void
  waveformHeights: string[]
}

export const DesktopFooter = memo(function DesktopFooter({
  isVisible,
  audioRef,
  episode,
  episodesAll,
  isFooterClosing,
  isFooterExpanding,
  isFooterExpanded,
  isFooterCollapsing,
  onProgressPointer,
  toggleFooterExpansion,
  footerPanActive,
  footerTitlePanRef,
  footerShowPanRef,
  footerPanSharedStyle,
  footerTitlePanStyle,
  footerShowPanStyle,
  footerEpisodeTitle,
  footerEpisodeShow,
  showArtworkUrl,
  canPrev,
  canNext,
  playPrev,
  playNext,
  seekBySeconds,
  togglePlayPause,
  isPlaying,
  isEpisodeLoading,
  denoiseEnabled,
  modelSupported,
  isProcessingStarting,
  toggleDenoise,
  footerProcessTooltip,
  onVolumeWheel,
  toggleMute,
  volume,
  footerVolumeIcon,
  footerVolumePct,
  onVolumePointerDown,
  onVolumeKeyDown,
  isFooterDescriptionExpanded,
  isFooterDescriptionOverflowing,
  footerDescriptionRef,
  footerDescriptionStyle,
  footerDescriptionHtml,
  toggleFooterDescriptionExpanded,
  waveformHeights,
}: DesktopFooterProps) {
  const { currentTime, duration, progressPct } = useAudioTimeline({
    audioRef,
    isActive: isVisible && Boolean(episode),
  })
  const loadingGlyphFrame = usePlaybackLoadingGlyph(
    isEpisodeLoading && isVisible && Boolean(episode),
  )
  if (!isVisible || !episode) return null
  const episodeArtworkUrl = SHOW_EPISODE_ARTWORK ? episode.imageUrl : null
  const artworkUrl = episodeArtworkUrl || showArtworkUrl || null
  const footerProgressPct = Math.round(progressPct * 1000) / 10
  const footerCurrent = formatClock(currentTime)
  const footerDuration = formatClock(duration)
  const playPauseTitle = isEpisodeLoading ? 'Loading audio' : isPlaying ? 'Pause' : 'Play'

  return (
            <>
              <div className="pcFooterSpacer" />
              <footer
                className={`pcFooter ${
                  isFooterClosing
                    ? "pcFooterSlideOut"
                    : !isFooterExpanding &&
                        !isFooterExpanded &&
                        !isFooterCollapsing
                      ? "pcFooterSlideUp"
                      : ""
                } ${isFooterExpanding ? "pcFooterExpanding" : ""} ${
                  isFooterExpanded ? "pcFooterExpanded" : ""
                } ${isFooterCollapsing ? "pcFooterCollapsing" : ""}`}
              >
                <div className="pcFooterProgress">
                  <div
                    className="pcFooterProgressTrack"
                    onClick={episode ? onProgressPointer : undefined}
                  >
                    <div
                      className="pcFooterProgressFill"
                      style={{ width: `${footerProgressPct}%` }}
                    ></div>
                    <div
                      className="pcFooterProgressHandle"
                      style={{
                        left: `calc(${footerProgressPct}% - 6px)`,
                        right: "auto",
                      }}
                    ></div>
                  </div>
                  <div
                    className="pcFooterProgressTooltip"
                    style={{
                      left: `clamp(56px, ${footerProgressPct}%, calc(100% - 56px))`,
                    }}
                    aria-hidden="true"
                  >
                    <span className="pcFooterProgressTime">
                      {footerCurrent}
                    </span>
                    <span className="pcFooterProgressSep">/</span>
                    <span className="pcFooterProgressTime pcFooterProgressDuration">
                      {footerDuration}
                    </span>
                  </div>
                </div>
                <div
                  className={`pcFooterControls ${isFooterExpanding || isFooterExpanded || isFooterCollapsing ? "isCollapsed" : ""}`}
                >
                  <div
                    className="pcFooterLeft"
                    onClick={toggleFooterExpansion}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="pcFooterEpisodeInfo">
                      <div className={`pcFooterEpisodeArtwork ${artworkUrl ? 'hasArtwork' : ''}`}>
                        {artworkUrl ? (
                          <img
                            className="pcFooterEpisodeArtworkImage"
                            src={artworkUrl}
                            alt={`Artwork for ${episode.title}`}
                            decoding="async"
                          />
                        ) : (
                          <span className="material-symbols-outlined">
                            podcasts
                          </span>
                        )}
                      </div>
                      <div className="pcFooterEpisodeDetails">
                        <h4
                          className={`pcFooterEpisodeTitle ${footerPanActive ? "isPanning" : ""}`}
                        >
                          <span
                            ref={footerTitlePanRef}
                            className={`pcFooterMarquee ${footerPanActive ? "isPanning" : ""}`}
                            style={{
                              ...footerPanSharedStyle,
                              ...footerTitlePanStyle,
                            }}
                          >
                            {footerEpisodeTitle}
                          </span>
                        </h4>
                        <p
                          className={`pcFooterEpisodeShow ${footerPanActive ? "isPanning" : ""}`}
                        >
                          <span
                            ref={footerShowPanRef}
                            className={`pcFooterMarquee ${footerPanActive ? "isPanning" : ""}`}
                            style={{
                              ...footerPanSharedStyle,
                              ...footerShowPanStyle,
                            }}
                          >
                            {footerEpisodeShow}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="pcFooterCenter">
                    <div className="pcFooterPlayerControls">
                      <button
                        type="button"
                        className="pcFooterControlBtn"
                        disabled={!canPrev}
                        onClick={playPrev}
                        title="Previous"
                      >
                        <IconPrev size={22} />
                      </button>
                      <button
                        type="button"
                        className="pcFooterControlBtn pcFooterSeekBtn"
                        disabled={!episode}
                        onClick={() => seekBySeconds(-10)}
                        title="Seek backward 10 seconds"
                        aria-label="Seek backward 10 seconds"
                      >
                        <span className="material-symbols-outlined">
                          replay_10
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`pcFooterPlayBtn ${isEpisodeLoading ? 'isLoading' : ''}`}
                        disabled={!episode || isEpisodeLoading}
                        onClick={() => void togglePlayPause()}
                        title={playPauseTitle}
                        aria-label={playPauseTitle}
                      >
                        {isEpisodeLoading ? (
                          <span className="pcPlayLoadingGlyph" aria-hidden="true">
                            {loadingGlyphFrame}
                          </span>
                        ) : isPlaying ? (
                          <IconPause size={26} />
                        ) : (
                          <IconPlay size={26} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="pcFooterControlBtn pcFooterSeekBtn"
                        disabled={!episode}
                        onClick={() => seekBySeconds(10)}
                        title="Seek forward 10 seconds"
                        aria-label="Seek forward 10 seconds"
                      >
                        <span className="material-symbols-outlined">
                          forward_10
                        </span>
                      </button>
                      <button
                        type="button"
                        className="pcFooterControlBtn"
                        disabled={!canNext}
                        onClick={playNext}
                        title="Next"
                      >
                        <IconNext size={22} />
                      </button>
                    </div>
                  </div>
                  <div className="pcFooterRight">
                    <div className="pcFooterControlWithTooltip">
                      <button
                        type="button"
                        className={`pcFooterControlBtn pcFooterProcessBtn ${denoiseEnabled ? "on" : ""}`}
                        disabled={
                          !episode || !modelSupported || isProcessingStarting
                        }
                        aria-label={
                          denoiseEnabled
                            ? "Disable processing"
                            : "Enable processing"
                        }
                        onClick={() => void toggleDenoise(!denoiseEnabled)}
                      >
                        <span className="material-symbols-outlined">
                          replace_audio
                        </span>
                      </button>
                      <span
                        className="pcFooterControlTooltip"
                        aria-hidden="true"
                      >
                        {footerProcessTooltip}
                      </span>
                    </div>
                    <div className="pcFooterVolume" onWheel={onVolumeWheel}>
                      <button
                        type="button"
                        className="pcFooterControlBtn"
                        onClick={toggleMute}
                        title={volume === 0 ? "Unmute" : "Mute"}
                      >
                        <span className="material-symbols-outlined">
                          {footerVolumeIcon}
                        </span>
                      </button>
                      <div
                        className="pcFooterVolumeTrack"
                        role="slider"
                        tabIndex={0}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={footerVolumePct}
                        aria-label="Volume"
                        onPointerDown={onVolumePointerDown}
                        onKeyDown={onVolumeKeyDown}
                      >
                        <div
                          className="pcFooterVolumeFill"
                          style={{ width: `${footerVolumePct}%` }}
                        ></div>
                        <div
                          className="pcFooterVolumeHandle"
                          style={{ left: `calc(${footerVolumePct}% - 5px)` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
                {(isFooterExpanded ||
                  isFooterExpanding ||
                  isFooterCollapsing) &&
                episode ? (
                  <div className="pcFooterExpandedContent">
                    <div className="pcFooterExpandedBody">
                      {artworkUrl ? (
                        <div className="pcFooterExpandedArtworkBackdrop" aria-hidden="true">
                          <img
                            className="pcFooterExpandedArtworkImage"
                            src={artworkUrl}
                            alt=""
                            decoding="async"
                          />
                        </div>
                      ) : null}
                      <div className="pcFooterExpandedHero text-center mb-10 max-w-4xl mx-auto space-y-4">
                        <div className="pcFooterExpandedBadge">
                          <span className="pcFooterExpandedBadgeDot"></span>
                          <span className="pcFooterExpandedBadgeText">
                            Transmission Active
                          </span>
                        </div>
                        <div>
                          <h2 className="pcFooterExpandedTitle">
                            {footerEpisodeTitle || "Unknown Episode"}
                          </h2>
                          <p className="pcFooterExpandedSubtitle">
                            {footerEpisodeShow || "Unknown Show"} /// Episode{" "}
                            {episodesAll.findIndex(
                              (e) => e?.guid === episode?.guid,
                            ) + 1}
                          </p>
                        </div>
                        <div className="pcFooterExpandedDescriptionWrap">
                          <div
                            id="footer-expanded-description"
                            ref={footerDescriptionRef}
                            className={`pcFooterExpandedDescription ${isFooterDescriptionExpanded ? "isExpanded" : "isClamped"}`}
                            style={footerDescriptionStyle}
                            dangerouslySetInnerHTML={{
                              __html: footerDescriptionHtml,
                            }}
                          />
                          {isFooterDescriptionOverflowing ? (
                            <button
                              type="button"
                              className="pcFooterExpandedDescriptionToggle"
                              aria-controls="footer-expanded-description"
                              aria-expanded={isFooterDescriptionExpanded}
                              onClick={toggleFooterDescriptionExpanded}
                            >
                              {isFooterDescriptionExpanded
                                ? "Show less"
                                : "Show more"}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div
                        className={`pcFooterExpandedTelemetry ${isFooterDescriptionExpanded ? "isHidden" : ""}`}
                        aria-hidden={isFooterDescriptionExpanded}
                      >
                        <div className="pcFooterExpandedMetrics pcFooterExpandedMetricsLeft">
                          <div className="pcFooterExpandedMetric">
                            <span className="pcFooterExpandedMetricLabel">
                              Current Position
                            </span>
                            <span className="pcFooterExpandedMetricValue pcFooterExpandedMetricValuePrimary">
                              {footerCurrent}
                            </span>
                          </div>
                          <div className="pcFooterExpandedMetric">
                            <span className="pcFooterExpandedMetricLabel">
                              Stream Bitrate
                            </span>
                            <span className="pcFooterExpandedMetricValue">
                              1,411 KBPS
                            </span>
                          </div>
                        </div>

                        <div className="pcFooterExpandedWaveform">
                          {/* Waveform visualization */}
                          {Array.from({ length: 64 }, (_, i) => {
                            const isActive =
                              i <
                              Math.floor(
                                ((currentTime || 0) / (duration || 1)) * 64,
                              );
                            const height = waveformHeights[i] ?? "25%";
                            return (
                              <div
                                key={i}
                                className={
                                  isActive
                                    ? "waveform-bar-active"
                                    : "waveform-bar"
                                }
                                style={{
                                  width: "2px",
                                  height,
                                  borderRadius: "9999px",
                                  transition: "all 300ms",
                                }}
                              ></div>
                            );
                          })}
                        </div>

                        <div className="pcFooterExpandedMetrics pcFooterExpandedMetricsRight">
                          <div className="pcFooterExpandedMetric">
                            <span className="pcFooterExpandedMetricLabel">
                              Remaining
                            </span>
                            <span className="pcFooterExpandedMetricValue">
                              {footerDuration}
                            </span>
                          </div>
                          <div className="pcFooterExpandedMetric">
                            <span className="pcFooterExpandedMetricLabel">
                              Playback Speed
                            </span>
                            <span className="pcFooterExpandedMetricValue">
                              1.25X // VAR
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pcFooterExpandedControls">
                        <button className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnSm">
                          <span className="material-symbols-outlined">
                            shuffle
                          </span>
                        </button>
                        <button
                          className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnLg"
                          disabled={!canPrev}
                          onClick={playPrev}
                        >
                          <span className="material-symbols-outlined">
                            skip_previous
                          </span>
                        </button>
                        <button
                          className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnMd"
                          onClick={() => seekBySeconds(-10)}
                        >
                          <span className="material-symbols-outlined">
                            replay_10
                          </span>
                        </button>
                        <div className="pcFooterExpandedPlayWrap">
                          <div className="pcFooterExpandedPlayGlow"></div>
                          <button
                            className="pcFooterExpandedPlayBtn"
                            disabled={isEpisodeLoading}
                            onClick={() => void togglePlayPause()}
                            title={playPauseTitle}
                            aria-label={playPauseTitle}
                          >
                            {isEpisodeLoading ? (
                              <span className="pcPlayLoadingGlyph" aria-hidden="true">
                                {loadingGlyphFrame}
                              </span>
                            ) : (
                              <span className="material-symbols-outlined pcFooterExpandedPlayIcon FILL-1">
                                {isPlaying ? "pause" : "play_arrow"}
                              </span>
                            )}
                          </button>
                        </div>
                        <button
                          className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnMd"
                          onClick={() => seekBySeconds(10)}
                        >
                          <span className="material-symbols-outlined">
                            forward_10
                          </span>
                        </button>
                        <button
                          className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnLg"
                          disabled={!canNext}
                          onClick={playNext}
                        >
                          <span className="material-symbols-outlined">
                            skip_next
                          </span>
                        </button>
                        <button className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnSm">
                          <span className="material-symbols-outlined">
                            repeat
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="pcFooterExpandedTray">
                      <div className="pcFooterExpandedTrayActions">
                        <button
                          className="pcFooterExpandedTrayBtn pcFooterExpandedTrayBtnGhost"
                          onClick={toggleFooterExpansion}
                        >
                          <span className="material-symbols-outlined">
                            keyboard_double_arrow_down
                          </span>
                          Collapse View
                        </button>
                        <div className="pcFooterExpandedTrayMeta">
                          <div className="pcFooterVolume" onWheel={onVolumeWheel}>
                            <button
                              type="button"
                              className="pcFooterControlBtn"
                              onClick={toggleMute}
                              title={volume === 0 ? "Unmute" : "Mute"}
                            >
                              <span className="material-symbols-outlined">
                                {footerVolumeIcon}
                              </span>
                            </button>
                            <div
                              className="pcFooterVolumeTrack"
                              role="slider"
                              tabIndex={0}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={footerVolumePct}
                              aria-label="Volume"
                              onPointerDown={onVolumePointerDown}
                              onKeyDown={onVolumeKeyDown}
                            >
                              <div
                                className="pcFooterVolumeFill"
                                style={{ width: `${footerVolumePct}%` }}
                              ></div>
                              <div
                                className="pcFooterVolumeHandle"
                                style={{ left: `calc(${footerVolumePct}% - 5px)` }}
                              ></div>
                            </div>
                          </div>
                          <button className="pcFooterExpandedTrayBtn">
                            <span className="material-symbols-outlined">
                              closed_caption
                            </span>
                            Subtitles
                          </button>
                          <button
                            type="button"
                            className={`pcFooterExpandedTrayBtn ${denoiseEnabled ? "pcFooterExpandedTrayBtnIsActive" : ""}`}
                            disabled={!episode || !modelSupported || isProcessingStarting}
                            aria-label={
                              denoiseEnabled
                                ? "Stop processing"
                                : "Start processing"
                            }
                            title={footerProcessTooltip}
                            onClick={() => void toggleDenoise(!denoiseEnabled)}
                          >
                            <span className="material-symbols-outlined">
                              replace_audio
                            </span>
                            <ScrambleText
                              text={
                                denoiseEnabled
                                  ? "Stop Processing"
                                  : "Start Processing"
                              }
                              durationMs={520}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </footer>
            </>
  )
})
