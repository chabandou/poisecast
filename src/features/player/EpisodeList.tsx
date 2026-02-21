import {
  memo,
  type ReactNode,
  type RefObject,
  type UIEventHandler,
} from 'react'

type EpisodeListProps = {
  items: ReactNode
  hasEpisodes: boolean
  onScroll?: UIEventHandler<HTMLDivElement>
  containerRef?: RefObject<HTMLDivElement | null>
}

export const EpisodeList = memo(function EpisodeList({
  items,
  hasEpisodes,
  onScroll,
  containerRef,
}: EpisodeListProps) {
  return (
    <div ref={containerRef} className="pcEpisodeList" onScroll={onScroll}>
      <table>
        <tbody className="pcStaggerList">{items}</tbody>
      </table>
      {!hasEpisodes ? <div className="pcEmpty">No episodes. Load a feed.</div> : null}
    </div>
  )
})
