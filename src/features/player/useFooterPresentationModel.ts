import { useMemo, type CSSProperties, type RefObject } from 'react'
import type { PodcastEpisode } from '../../podcasts/types'
import { useOverflowPanText } from '../system/useOverflowPanText'
import { useFooterDescriptionController } from './useFooterDescriptionController'
import { useEpisodeWaveform } from './useEpisodeWaveform'

type UseFooterPresentationModelOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  volume: number
  episode: PodcastEpisode | null
  sourceKind: 'remote' | 'local'
  podcastTitle?: string
  isFooterExpanded: boolean
}

export function useFooterPresentationModel({
  audioRef,
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

  const waveformHeights = useEpisodeWaveform({
    audioRef,
    episodeGuid: episode?.guid ?? null,
    barCount: 64,
  })

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
