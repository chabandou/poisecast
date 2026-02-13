import { getModelCandidateUrls, type ModelSpec } from '../../models/models'
import { normalizeIssueDetail } from '../system/errors'
import { formatByteSize } from '../system/format'
import { describeModelSource, toAbsoluteUrl } from '../system/url'
import { ORT_DOWNLOAD_RETRY_MAX, type ProcessingBootstrapService } from './processingBootstrapService'
import type { AssetDownloadUiState } from './useProcessingController'

type UseProcessingUiModelOptions = {
  model: ModelSpec
  processingBootstrap: ProcessingBootstrapService
  downloadModalKind: 'ort' | 'model' | null
  ortDownloadUi: AssetDownloadUiState | null
  modelDownloadUi: AssetDownloadUiState | null
  isProcessingStarting: boolean
  engineState: string
  engineDetail: string
  isInferenceActive: boolean
  denoiseEnabled: boolean
  hasEpisode: boolean
}

export function useProcessingUiModel({
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
}: UseProcessingUiModelOptions) {
  const processingErrorText =
    engineState === 'error' ? normalizeIssueDetail(engineDetail || 'Unknown processing error') : null
  const processingErrorInline = processingErrorText ? normalizeIssueDetail(processingErrorText, 72) : null
  const processingStatus = isProcessingStarting
    ? 'booting'
    : processingErrorText
      ? 'error'
      : isInferenceActive
        ? 'active'
        : 'idle'

  const modelCandidateUrlsForUi = getModelCandidateUrls(model)
  const activeDownloadUi =
    downloadModalKind === 'ort'
      ? ortDownloadUi
      : downloadModalKind === 'model'
        ? modelDownloadUi
        : null
  const fallbackDownloadUi: AssetDownloadUiState | null = downloadModalKind
    ? {
        assetLabel: downloadModalKind === 'ort' ? 'ONNX Runtime WASM Core' : model.label,
        sourceUrl:
          downloadModalKind === 'ort'
            ? processingBootstrap.preferredOrtBaseUrl
            : toAbsoluteUrl(modelCandidateUrlsForUi[0] ?? model.url),
        sourceLabel:
          downloadModalKind === 'ort'
            ? describeModelSource(processingBootstrap.preferredOrtBaseUrl)
            : describeModelSource(toAbsoluteUrl(modelCandidateUrlsForUi[0] ?? model.url)),
        attempt: 1,
        totalAttempts:
          downloadModalKind === 'model' ? Math.max(1, modelCandidateUrlsForUi.length) : ORT_DOWNLOAD_RETRY_MAX,
        loadedBytes: 0,
        totalBytes: null,
        phase: 'downloading',
        errorDetail: null,
      }
    : null
  const resolvedDownloadUi = activeDownloadUi ?? fallbackDownloadUi
  const activeDownloadPercent =
    resolvedDownloadUi?.totalBytes && resolvedDownloadUi.totalBytes > 0
      ? Math.max(0, Math.min(100, (resolvedDownloadUi.loadedBytes / resolvedDownloadUi.totalBytes) * 100))
      : null
  const activeDownloadBytes =
    resolvedDownloadUi?.totalBytes && resolvedDownloadUi.totalBytes > 0
      ? `${formatByteSize(resolvedDownloadUi.loadedBytes)} / ${formatByteSize(resolvedDownloadUi.totalBytes)}`
      : resolvedDownloadUi
        ? `${formatByteSize(resolvedDownloadUi.loadedBytes)} downloaded`
        : ''
  const activeDownloadPhaseLabel = resolvedDownloadUi?.phase === 'retrying' ? 'Switching source…' : 'Downloading…'
  const activeDownloadTitle = downloadModalKind === 'ort' ? 'Downloading Runtime Assets' : 'Downloading AI model'
  const activeDownloadAssetLabel = downloadModalKind === 'ort' ? 'Runtime' : 'Model'
  const activeDownloadAttemptLabel = downloadModalKind === 'ort' ? 'Attempt' : 'Source'
  const footerProcessTooltip = !hasEpisode
    ? 'Select an episode to enable audio processing'
    : isProcessingStarting
      ? 'Initializing audio processing (loading runtime/model)…'
      : processingErrorText
        ? `Processing error: ${processingErrorText}`
        : denoiseEnabled
          ? 'Disable audio processing (AI denoise)'
          : 'Enable audio processing (AI denoise)'

  return {
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
  }
}
