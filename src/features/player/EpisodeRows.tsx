import { memo } from 'react'
import type { PodcastEpisode } from '../../podcasts/types'

type EpisodeRowsProps = {
  episodes: PodcastEpisode[]
  activeEpisodeGuid: string | null
  loadingEpisodeId: string | null
  onStartEpisode: (episode: PodcastEpisode) => Promise<void>
}

export const EpisodeRows = memo(function EpisodeRows({
  episodes,
  activeEpisodeGuid,
  loadingEpisodeId,
  onStartEpisode,
}: EpisodeRowsProps) {
  return (
    <>
      {episodes.map((episode, index) => (
        <tr
          key={episode.guid}
          className={`pcEpisodeItem ${activeEpisodeGuid === episode.guid ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => void onStartEpisode(episode)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              void onStartEpisode(episode)
            }
          }}
        >
          <td>
            <div className="pcEpisodeIcon">
              <span className="material-symbols-outlined">
                {activeEpisodeGuid === episode.guid ? 'graphic_eq' : 'play_circle'}
              </span>
            </div>
          </td>
          <td>
            <div className="pcEpisodeBody">
              <div className="pcEpisodeTitle">
                Ep. {index + 1}: {episode.title}
              </div>
              <div className="pcEpisodeMeta">
                {episode.dateStamp ? <span>{episode.dateStamp}</span> : null}
                {episode.dateStamp && episode.duration ? <span className="pcMetaSeparator">|</span> : null}
                {episode.duration ? <span>{episode.duration}</span> : null}
                {loadingEpisodeId === episode.guid ? <span className="pcLoadingTag">LOADED</span> : null}
              </div>
            </div>
          </td>
          <td style={{ textAlign: 'right' }}>
            <span className="pcEpisodeSize">128kbps / FLAC</span>
          </td>
        </tr>
      ))}
    </>
  )
})
