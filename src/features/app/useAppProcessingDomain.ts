import { useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { MODELS } from '../../models/models'
import type { PodcastEpisode } from '../../podcasts/types'
import {
  probeStreamProxy,
  corsProbe,
  waitForAudioMetadata,
} from '../audio/audioPlaybackNetwork'
import {
  DEFAULT_CDN_ORT_BASE_URL,
  DEFAULT_GITHUB_ORT_BASE_URL,
  DEFAULT_LOCAL_ORT_BASE_URL,
  MODEL_CACHE_NAME,
  ProcessingBootstrapService,
} from '../audio/processingBootstrapService'
import { useProcessingController } from '../audio/useProcessingController'
import { useProcessingUiModel } from '../audio/useProcessingUiModel'
import type { IssueSource } from '../system/useIssueLog'
import { normalizeBaseUrl as normalizeBaseUrlUtil } from '../system/url'

const ENGINE_INIT_TIMEOUT_MS = 90_000

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  return normalizeBaseUrlUtil(value, fallback)
}

type UseAppProcessingDomainOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  isPlaying: boolean
  episode: PodcastEpisode | null
  sourceKind: 'remote' | 'local'
  getRemotePlaybackUrl: (ep: PodcastEpisode) => string
  reportIssue: (source: IssueSource, summary: string, detail: unknown) => void
  setCanDenoise: Dispatch<SetStateAction<boolean | null>>
  hasEpisode: boolean
}

export function useAppProcessingDomain({
  audioRef,
  isPlaying,
  episode,
  sourceKind,
  getRemotePlaybackUrl,
  reportIssue,
  setCanDenoise,
  hasEpisode,
}: UseAppProcessingDomainOptions) {
  const [modelId] = useState(MODELS[0]?.id ?? 'denoiser_model')
  const model = useMemo(
    () => MODELS.find((m) => m.id === modelId) ?? MODELS[0],
    [modelId],
  )

  const ortBaseUrl = useMemo(
    () =>
      normalizeBaseUrl(
        import.meta.env.VITE_GITHUB_ORT_BASE_URL,
        DEFAULT_LOCAL_ORT_BASE_URL,
      ),
    [],
  )
  const ortBaseUrls = useMemo(() => {
    const candidates = [
      ortBaseUrl,
      DEFAULT_CDN_ORT_BASE_URL,
      DEFAULT_GITHUB_ORT_BASE_URL,
    ]
    const deduped: string[] = []
    const seen = new Set<string>()
    for (const candidate of candidates) {
      const normalized = normalizeBaseUrl(
        candidate,
        DEFAULT_LOCAL_ORT_BASE_URL,
      )
      if (seen.has(normalized)) continue
      seen.add(normalized)
      deduped.push(normalized)
    }
    return deduped
  }, [ortBaseUrl])

  const processingBootstrap = useMemo(
    () =>
      new ProcessingBootstrapService({
        ortBaseUrls,
        modelCacheName: MODEL_CACHE_NAME,
      }),
    [ortBaseUrls],
  )

  const {
    engineState,
    engineDetail,
    setEngineDetail,
    denoiseEnabled,
    isInferenceActive,
    isProcessingStarting,
    modelDownloadUi,
    ortDownloadUi,
    downloadModalKind,
    ensureOrtAssetsReady,
    toggleDenoise,
    resetProcessingState,
    disposeProcessing,
  } = useProcessingController({
    audioRef,
    model,
    isPlaying,
    episode,
    sourceKind,
    getRemotePlaybackUrl,
    processingBootstrap,
    reportIssue,
    setCanDenoise,
    corsProbe,
    probeStreamProxy,
    waitForAudioMetadata,
    engineInitTimeoutMs: ENGINE_INIT_TIMEOUT_MS,
  })

  const {
    processingErrorText,
    processingErrorInline,
    processingStatus,
    resolvedDownloadUi,
    activeDownloadPercent,
    activeDownloadBytes,
    activeDownloadPhaseLabel,
    activeDownloadTitle,
    activeDownloadAssetLabel,
    activeDownloadAttemptLabel,
    footerProcessTooltip,
  } = useProcessingUiModel({
    model,
    processingBootstrap,
    downloadModalKind,
    ortDownloadUi,
    modelDownloadUi,
    isProcessingStarting,
    engineState,
    engineDetail,
    isInferenceActive,
    denoiseEnabled,
    hasEpisode,
  })

  const topStatus = useMemo(() => {
    return [
      `ENGINE: ${engineState.toUpperCase()}`,
      `DETAIL: ${engineDetail || 'READY'}`,
    ]
      .filter(Boolean)
      .join('   ')
  }, [engineDetail, engineState])

  const modelSupported = Boolean(model?.supported)

  return {
    model,
    modelSupported,
    processingBootstrap,
    engineState,
    engineDetail,
    setEngineDetail,
    denoiseEnabled,
    isInferenceActive,
    isProcessingStarting,
    downloadModalKind,
    ensureOrtAssetsReady,
    toggleDenoise,
    resetProcessingState,
    disposeProcessing,
    processingErrorText,
    processingErrorInline,
    processingStatus,
    resolvedDownloadUi,
    activeDownloadPercent,
    activeDownloadBytes,
    activeDownloadPhaseLabel,
    activeDownloadTitle,
    activeDownloadAssetLabel,
    activeDownloadAttemptLabel,
    footerProcessTooltip,
    topStatus,
  }
}
