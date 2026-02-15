import {
  memo,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { GlitchImage } from '../../ui/GlitchImage'
import { formatClock } from './playbackMath'
import { useAudioTimeline } from './useAudioTimeline'

type MobileMiniPlayerProps = {
  isVisible: boolean
  audioRef: RefObject<HTMLAudioElement | null>
  hasEpisode: boolean
  nowPlayingArtworkUrl: string | null
  episodeTitle: string
  denoiseEnabled: boolean
  modelSupported: boolean
  isProcessingStarting: boolean
  footerProcessTooltip: string
  toggleDenoise: (next: boolean) => Promise<void>
  seekBySeconds: (deltaSeconds: number) => void
  togglePlayPause: () => Promise<void>
  isEpisodeLoading: boolean
  isPlaying: boolean
  playNext: () => void
  canNext: boolean
  onMiniProgressPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onMiniProgressKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

export const MobileMiniPlayer = memo(function MobileMiniPlayer({
  isVisible,
  audioRef,
  hasEpisode,
  nowPlayingArtworkUrl,
  episodeTitle,
  denoiseEnabled,
  modelSupported,
  isProcessingStarting,
  footerProcessTooltip,
  toggleDenoise,
  seekBySeconds,
  togglePlayPause,
  isEpisodeLoading,
  isPlaying,
  playNext,
  canNext,
  onMiniProgressPointerDown,
  onMiniProgressKeyDown,
}: MobileMiniPlayerProps) {
  const { currentTime, duration, progressPct } = useAudioTimeline({
    audioRef,
    isActive: isVisible && hasEpisode,
  })
  if (!isVisible) return null
  const footerCurrent = formatClock(currentTime)
  const footerDuration = formatClock(duration)
  const footerProgressPct = Math.round(progressPct * 1000) / 10

  return (
    <div
      className={`pcMobileFixedBottom ${hasEpisode ? '' : 'isHidden'}`}
      aria-hidden={!hasEpisode}
    >
      <div className="pcMobileMiniPlayer">
        <div className="pcMobileMiniPlayerArtwork">
          {nowPlayingArtworkUrl ? (
            <GlitchImage
              variant="mini"
              src={nowPlayingArtworkUrl}
              alt="Now playing"
            />
          ) : (
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
              <span
                className="material-symbols-outlined"
                style={{ color: 'var(--pc-muted)' }}
              >
                podcasts
              </span>
            </div>
          )}
        </div>
        <div className="pcMobileMiniPlayerInfo">
          <p className="pcMobileMiniPlayerLabel">Now Processing:</p>
          <p className="pcMobileMiniPlayerTitle">{episodeTitle}</p>
        </div>
        <div className="pcMobileMiniPlayerControls">
          <button
            type="button"
            className={`pcMobileMiniPlayerControlButton pcMobileMiniPlayerProcessBtn ${denoiseEnabled ? 'on' : ''}`}
            disabled={!hasEpisode || !modelSupported || isProcessingStarting}
            aria-label={
              denoiseEnabled ? 'Disable processing' : 'Enable processing'
            }
            title={footerProcessTooltip}
            onClick={() => void toggleDenoise(!denoiseEnabled)}
          >
            <span className="material-symbols-outlined">replace_audio</span>
          </button>
          <button
            type="button"
            className="pcMobileMiniPlayerControlButton seek"
            onClick={() => seekBySeconds(-10)}
            disabled={!hasEpisode}
          >
            <span className="material-symbols-outlined">replay_10</span>
          </button>
          <button
            type="button"
            className="pcMobileMiniPlayerControlButton primary"
            onClick={() => void togglePlayPause()}
            disabled={isEpisodeLoading || !hasEpisode}
          >
            <span className="material-symbols-outlined fill-1">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button
            type="button"
            className="pcMobileMiniPlayerControlButton seek"
            onClick={() => seekBySeconds(10)}
            disabled={!hasEpisode}
          >
            <span className="material-symbols-outlined">forward_10</span>
          </button>
          <button
            type="button"
            className="pcMobileMiniPlayerControlButton"
            onClick={playNext}
            disabled={!canNext}
          >
            <span className="material-symbols-outlined">skip_next</span>
          </button>
        </div>
        <div className="pcMobileMiniPlayerTimeline">
          <div className="pcMobileMiniPlayerProgressMeta" aria-hidden="true">
            <span>{footerCurrent}</span>
            <span>{footerDuration}</span>
          </div>
          <div
            className="pcMobileMiniPlayerProgress"
            role="slider"
            tabIndex={0}
            aria-label="Playback progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={footerProgressPct}
            aria-valuetext={`${footerCurrent} of ${footerDuration}`}
            onPointerDown={onMiniProgressPointerDown}
            onKeyDown={onMiniProgressKeyDown}
          >
            <div
              className="pcMobileMiniPlayerProgressFill"
              style={{ width: `${footerProgressPct}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  )
})
