import { memo, type ReactNode } from 'react'

type EpisodeListProps = {
  items: ReactNode
  hasEpisodes: boolean
}

export const EpisodeList = memo(function EpisodeList({ items, hasEpisodes }: EpisodeListProps) {
  return (
    <div className="pcEpisodeList">
      <table>
        <tbody>{items}</tbody>
      </table>
      {!hasEpisodes ? <div className="pcEmpty">No episodes. Load a feed.</div> : null}
    </div>
  )
})
