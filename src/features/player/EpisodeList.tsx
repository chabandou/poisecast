import { memo, type ReactNode, type UIEventHandler } from 'react'

type EpisodeListProps = {
  items: ReactNode
  hasEpisodes: boolean
  onScroll?: UIEventHandler<HTMLDivElement>
}

export const EpisodeList = memo(function EpisodeList({
  items,
  hasEpisodes,
  onScroll,
}: EpisodeListProps) {
  return (
    <div className="pcEpisodeList" onScroll={onScroll}>
      <table>
        <tbody className="pcStaggerList">{items}</tbody>
      </table>
      {!hasEpisodes ? <div className="pcEmpty">No episodes. Load a feed.</div> : null}
    </div>
  )
})
