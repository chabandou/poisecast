import { useMemo, type CSSProperties } from 'react'
import type { PodcastEpisode } from '../../podcasts/types'
import { useOverflowPanText } from '../system/useOverflowPanText'
import { useFooterDescriptionController } from './useFooterDescriptionController'

type UseFooterPresentationModelOptions = {
  volume: number
  episode: PodcastEpisode | null
  sourceKind: 'remote' | 'local'
  podcastTitle?: string
  isFooterExpanded: boolean
}

export function useFooterPresentationModel({
  volume,
  episode,
  sourceKind,
  podcastTitle,
  isFooterExpanded,
}: UseFooterPresentationModelOptions) {
  const footerVolumePct = Math.round(volume * 100)
  const footerVolumeIcon =
    volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'
  const footerEpisodeTitle = episode?.title ?? 'Select an episode'
  const footerEpisodeShow =
    sourceKind === 'local' ? 'LOCAL FILE' : (podcastTitle ?? 'NO SOURCE SELECTED')
  const footerDescriptionHtml = episode?.description || 'No description available.'

  const {
    footerDescriptionRef,
    footerDescriptionStyle,
    isFooterDescriptionExpanded,
    isFooterDescriptionOverflowing,
    toggleFooterDescriptionExpanded,
  } = useFooterDescriptionController({
    episodeGuid: episode?.guid,
    isFooterExpanded,
    footerDescriptionHtml,
  })

  const {
    ref: footerTitlePanRef,
    overflow: footerTitlePanOverflow,
    distance: footerTitlePanDistance,
    style: footerTitlePanStyle,
  } = useOverflowPanText<HTMLSpanElement>(footerEpisodeTitle)
  const {
    ref: footerShowPanRef,
    overflow: footerShowPanOverflow,
    distance: footerShowPanDistance,
    style: footerShowPanStyle,
  } = useOverflowPanText<HTMLSpanElement>(footerEpisodeShow)
  const footerPanActive = footerTitlePanOverflow || footerShowPanOverflow
  const footerPanDistanceMax = Math.max(footerTitlePanDistance, footerShowPanDistance)
  const footerPanDuration = Math.max(8, 8 + footerPanDistanceMax / 18)
  const footerPanSharedStyle = useMemo(
    () =>
      ({
        ['--pc-pan-duration' as const]: `${footerPanDuration}s`,
        ['--pc-pan-delay' as const]: '0.8s',
      }) as CSSProperties,
    [footerPanDuration],
  )

  const waveformHeights = useMemo(
    () =>
      Array.from({ length: 64 }, (_, index) => {
        if (index % 5 === 0) return '75%'
        if (index % 3 === 0) return '50%'
        return '25%'
      }),
    [],
  )

  return {
    footerVolumePct,
    footerVolumeIcon,
    footerEpisodeTitle,
    footerEpisodeShow,
    footerDescriptionHtml,
    footerDescriptionRef,
    footerDescriptionStyle,
    isFooterDescriptionExpanded,
    isFooterDescriptionOverflowing,
    toggleFooterDescriptionExpanded,
    footerPanActive,
    footerTitlePanRef,
    footerTitlePanStyle,
    footerShowPanRef,
    footerShowPanStyle,
    footerPanSharedStyle,
    waveformHeights,
  }
}
