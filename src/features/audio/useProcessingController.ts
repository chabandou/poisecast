import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { ModelSpec } from '../../models/models'
import { getModelCandidateUrls } from '../../models/models'
import type { PodcastEpisode } from '../../podcasts/types'
import { DenoiseEngine } from '../../audio/engine'
import { coerceErrorMessage, ignoreError } from '../system/errors'
import {
  cancelLatestAsyncRun,
  createLatestAsyncState,
  finishLatestAsyncRun,
  isAbortError,
  isLatestAsyncRunActive,
  startLatestAsyncRun,
} from '../system/latestAsync'
import type { IssueSource } from '../system/useIssueLog'
import { describeModelSource, isSameOriginUrl, toAbsoluteUrl } from '../system/url'
import {
  MODEL_CACHE_NAME,
  ORT_DOWNLOAD_RETRY_MAX,
  type ProcessingBootstrapService,
  type ResolveModelHooks,
  type ResolveOrtHooks,
} from './processingBootstrapService'
import { buildStreamProxyUrl } from './audioPlaybackNetwork'

export type AssetDownloadUiState = {
  assetLabel: string
  sourceUrl: string
  sourceLabel: string
  attempt: number
  totalAttempts: number
  fileIndex?: number
  totalFiles?: number
  loadedBytes: number
  totalBytes: number | null
  phase: 'downloading' | 'retrying'
  errorDetail: string | null
}

type UseProcessingControllerOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  model: ModelSpec | undefined
  isPlaying: boolean
  episode: PodcastEpisode | null
  sourceKind: 'remote' | 'local'
  getRemotePlaybackUrl: (ep: PodcastEpisode) => string
  processingBootstrap: ProcessingBootstrapService
  reportIssue: (source: IssueSource, summary: string, detail: unknown) => void
  setCanDenoise?: (next: boolean | null) => void
  corsProbe: (url: string, options?: { signal?: AbortSignal }) => Promise<boolean>
  probeStreamProxy: (
    proxyUrl: string,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ) => Promise<boolean>
  waitForAudioMetadata: (audioEl: HTMLAudioElement, timeoutMs?: number, signal?: AbortSignal) => Promise<void>
  engineInitTimeoutMs?: number
}

type EnsureOrtOptions = {
  showModal: boolean
  mode: 'core' | 'extended'
}

type ResetProcessingStateOptions = {
  canDenoise?: boolean | null
}

type UseProcessingControllerResult = {
  engineState: string
  setEngineState: (next: string) => void
  engineDetail: string
  setEngineDetail: (next: string) => void
  denoiseEnabled: boolean
  isInferenceActive: boolean
  isProcessingStarting: boolean
  modelDownloadUi: AssetDownloadUiState | null
  ortDownloadUi: AssetDownloadUiState | null
  downloadModalKind: 'ort' | 'model' | null
  ensureOrtAssetsReady: (opts: EnsureOrtOptions) => Promise<string>
  toggleDenoise: (next: boolean) => Promise<void>
  resetProcessingState: (opts?: ResetProcessingStateOptions) => void
  disposeProcessing: () => void
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer = 0
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(label)), ms)
      }),
    ])
  } finally {
    if (timer) window.clearTimeout(timer)
  }
}

export function useProcessingController({
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
  engineInitTimeoutMs = 90_000,
}: UseProcessingControllerOptions): UseProcessingControllerResult {
  const engineRef = useRef<DenoiseEngine | null>(null)
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const toggleTaskRef = useRef(createLatestAsyncState())
  const lastInferenceAtRef = useRef(0)

  const [engineState, setEngineState] = useState<string>('idle')
  const [engineDetail, setEngineDetail] = useState<string>('')
  const [denoiseEnabled, setDenoiseEnabled] = useState(false)
  const [isInferenceActive, setIsInferenceActive] = useState(false)
  const [isProcessingStarting, setIsProcessingStarting] = useState(false)
  const [modelDownloadUi, setModelDownloadUi] = useState<AssetDownloadUiState | null>(null)
  const [ortDownloadUi, setOrtDownloadUi] = useState<AssetDownloadUiState | null>(null)
  const [downloadModalKind, setDownloadModalKind] = useState<'ort' | 'model' | null>(null)

  const ensureOrtAssetsReady = useCallback(async (opts: EnsureOrtOptions) => {
    const isExtended = opts.mode === 'extended'
    const preferredBaseUrl = processingBootstrap.preferredOrtBaseUrl
    const labelPrefix = isExtended ? 'ONNX Runtime WASM Extended' : 'ONNX Runtime WASM Core'

    if (opts.showModal) {
      setDownloadModalKind('ort')
      setOrtDownloadUi((prev) => {
        if (prev) return prev
        return {
          assetLabel: labelPrefix,
          sourceUrl: preferredBaseUrl,
          sourceLabel: describeModelSource(preferredBaseUrl),
          attempt: 1,
          totalAttempts: ORT_DOWNLOAD_RETRY_MAX,
          loadedBytes: 0,
          totalBytes: null,
          phase: 'downloading',
          errorDetail: null,
        }
      })
    }

    const hooks: ResolveOrtHooks = {
      onDownloadStart: ({ url, fileName, fileIndex, totalFiles, attempt, totalAttempts }) => {
        const sourceLabel = describeModelSource(url)
        setOrtDownloadUi((prev) => ({
          assetLabel: `${labelPrefix} (${fileIndex}/${totalFiles})`,
          sourceUrl: url,
          sourceLabel,
          attempt,
          totalAttempts,
          fileIndex,
          totalFiles,
          loadedBytes: prev?.loadedBytes ?? 0,
          totalBytes: prev?.totalBytes ?? null,
          phase: 'downloading',
          errorDetail: null,
        }))
        if (opts.showModal) {
          setEngineDetail(`Downloading runtime asset ${fileName} from ${sourceLabel}…`)
        }
      },
      onProgress: ({ url, fileIndex, totalFiles, attempt, totalAttempts, loadedBytes, totalBytes }) => {
        const sourceLabel = describeModelSource(url)
        setOrtDownloadUi({
          assetLabel: `${labelPrefix} (${fileIndex}/${totalFiles})`,
          sourceUrl: url,
          sourceLabel,
          attempt,
          totalAttempts,
          fileIndex,
          totalFiles,
          loadedBytes,
          totalBytes,
          phase: 'downloading',
          errorDetail: null,
        })
      },
      onRetry: ({ url, fileIndex, totalFiles, attempt, totalAttempts, message }) => {
        const sourceLabel = describeModelSource(url)
        setOrtDownloadUi((prev) => ({
          assetLabel: `${labelPrefix} (${fileIndex}/${totalFiles})`,
          sourceUrl: url,
          sourceLabel,
          attempt,
          totalAttempts,
          fileIndex,
          totalFiles,
          loadedBytes: prev?.loadedBytes ?? 0,
          totalBytes: prev?.totalBytes ?? null,
          phase: 'retrying',
          errorDetail: message,
        }))
        if (opts.showModal) {
          setEngineDetail(`Runtime download failed (attempt ${attempt}/${totalAttempts}). Retrying…`)
        }
      },
      onSourceFallback: ({ nextBaseUrl }) => {
        if (!opts.showModal || !nextBaseUrl) return
        setEngineDetail('Primary runtime source failed. Trying fallback source…')
      },
    }

    return processingBootstrap.ensureOrtAssetsReady({
      mode: opts.mode,
      hooks,
    })
  }, [processingBootstrap])

  const ensureEngine = useCallback(async () => {
    if (!model) throw new Error('No model selected')
    if (!model.supported) throw new Error('Selected model is not supported yet')

    if (!engineRef.current) engineRef.current = new DenoiseEngine()
    engineRef.current.setInferenceActivityHandler(() => {
      lastInferenceAtRef.current = performance.now()
    })

    if (!initPromiseRef.current) {
      setEngineState('loading-model')
      setEngineDetail('Preparing ONNX runtime…')
      setDownloadModalKind('ort')
      setOrtDownloadUi((prev) => {
        if (prev) return prev
        return {
          assetLabel: 'ONNX Runtime WASM Core',
          sourceUrl: processingBootstrap.preferredOrtBaseUrl,
          sourceLabel: describeModelSource(processingBootstrap.preferredOrtBaseUrl),
          attempt: 1,
          totalAttempts: ORT_DOWNLOAD_RETRY_MAX,
          loadedBytes: 0,
          totalBytes: null,
          phase: 'downloading',
          errorDetail: null,
        }
      })

      initPromiseRef.current = (async () => {
        let ortWasmBaseUrl = await ensureOrtAssetsReady({ showModal: true, mode: 'core' })
        setEngineDetail('Loading ONNX session…')

        const modelCandidateUrls = getModelCandidateUrls(model)
        const initialModelSourceUrl = toAbsoluteUrl(modelCandidateUrls[0] ?? model.url)
        setDownloadModalKind('model')
        setModelDownloadUi((prev) => {
          if (prev) return prev
          return {
            assetLabel: model.label,
            sourceUrl: initialModelSourceUrl,
            sourceLabel: describeModelSource(initialModelSourceUrl),
            attempt: 1,
            totalAttempts: Math.max(1, modelCandidateUrls.length),
            loadedBytes: 0,
            totalBytes: null,
            phase: 'downloading',
            errorDetail: null,
          }
        })

        const modelHooks: ResolveModelHooks = {
          onDownloadStart: ({ url, attempt, totalAttempts }) => {
            const sourceLabel = describeModelSource(url)
            setDownloadModalKind('model')
            setModelDownloadUi({
              assetLabel: model.label,
              sourceUrl: url,
              sourceLabel,
              attempt,
              totalAttempts,
              loadedBytes: 0,
              totalBytes: null,
              phase: 'downloading',
              errorDetail: null,
            })
            setEngineDetail(`Downloading model from ${sourceLabel}…`)
          },
          onProgress: ({ url, attempt, totalAttempts, loadedBytes, totalBytes }) => {
            const sourceLabel = describeModelSource(url)
            setModelDownloadUi((prev) => ({
              assetLabel: prev?.assetLabel ?? model.label,
              sourceUrl: url,
              sourceLabel,
              attempt,
              totalAttempts,
              loadedBytes,
              totalBytes,
              phase: 'downloading',
              errorDetail: prev?.phase === 'retrying' ? prev.errorDetail : null,
            }))
          },
          onSourceFailed: ({ url, attempt, totalAttempts, message }) => {
            const sourceLabel = describeModelSource(url)
            setModelDownloadUi((prev) => ({
              assetLabel: prev?.assetLabel ?? model.label,
              sourceUrl: url,
              sourceLabel,
              attempt,
              totalAttempts,
              loadedBytes: prev?.loadedBytes ?? 0,
              totalBytes: prev?.totalBytes ?? null,
              phase: 'retrying',
              errorDetail: message,
            }))
            if (attempt < totalAttempts) {
              setEngineDetail('Primary model source failed. Trying fallback source…')
            }
          },
        }
        const modelUrl = await processingBootstrap.resolveModelInitUrl(model, modelHooks)

        const initSession = async () => {
          setEngineDetail('Initializing ONNX runtime session…')
          await withTimeout(
            engineRef.current!.init({
              modelUrl,
              sampleRateHz: model.sampleRateHz,
              ortWasmBaseUrl,
              assetCacheName: MODEL_CACHE_NAME,
            }),
            engineInitTimeoutMs,
            'Timed out while initializing ONNX runtime/session',
          )
          engineRef.current!.setWarmupMs(250)
        }

        try {
          await initSession()
        } catch (firstInitError) {
          setEngineDetail('Loading additional runtime variants…')
          ortWasmBaseUrl = await ensureOrtAssetsReady({ showModal: true, mode: 'extended' })
          setEngineDetail('Retrying ONNX session init…')

          try {
            await engineRef.current?.dispose()
          } catch {
            ignoreError()
          }

          engineRef.current = new DenoiseEngine()
          engineRef.current.setInferenceActivityHandler(() => {
            lastInferenceAtRef.current = performance.now()
          })

          try {
            await initSession()
          } catch {
            throw firstInitError
          }
        }
      })()
    }

    try {
      await initPromiseRef.current
      const status = engineRef.current!.status
      if (status.state === 'ready') {
        setEngineState('ready')
        setEngineDetail(`Backend: ${status.backend.toUpperCase()} · frame ${status.frameSize}`)
      } else if (status.state === 'error') {
        setEngineState('error')
        setEngineDetail(status.message)
      } else {
        setEngineState(status.state)
        setEngineDetail('')
      }
    } catch (error) {
      setEngineState('error')
      setEngineDetail(error instanceof Error ? error.message : String(error))
      initPromiseRef.current = null
      throw error
    } finally {
      setModelDownloadUi(null)
      setDownloadModalKind(null)
    }
  }, [ensureOrtAssetsReady, engineInitTimeoutMs, model, processingBootstrap])

  const resetProcessingState = useCallback((opts: ResetProcessingStateOptions = {}) => {
    cancelLatestAsyncRun(toggleTaskRef.current)
    if (typeof opts.canDenoise !== 'undefined') setCanDenoise?.(opts.canDenoise)
    setDenoiseEnabled(false)
    setIsInferenceActive(false)
    setIsProcessingStarting(false)
    lastInferenceAtRef.current = 0
    engineRef.current?.setEnabled(false)
  }, [setCanDenoise])

  const toggleDenoise = useCallback(async (next: boolean) => {
    const run = startLatestAsyncRun(toggleTaskRef.current)
    const isActive = () => isLatestAsyncRunActive(toggleTaskRef.current, run)
    const audioEl = audioRef.current
    try {
      if (!audioEl || !episode) return

      if (!next) {
        resetProcessingState()
        audioEl.removeAttribute('crossorigin')
        return
      }

      setIsProcessingStarting(true)
      setEngineDetail('')
      setEngineState(engineRef.current?.status.state ?? 'idle')

      let remotePlaybackUrl = episode.enclosureUrl
      let remoteNeedsCors = false

      if (sourceKind === 'remote') {
        const proxyUrl = buildStreamProxyUrl(episode.enclosureUrl)
        const fallbackUrl = getRemotePlaybackUrl(episode)
        const wasPaused = audioEl.paused
        const currentTime = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0

        const applyRemoteSource = async (url: string, needsCors: boolean): Promise<void> => {
          if (needsCors) audioEl.crossOrigin = 'anonymous'
          else audioEl.removeAttribute('crossorigin')
          audioEl.src = url
          audioEl.load()
          await waitForAudioMetadata(audioEl, 12_000, run.signal)
          if (!isActive()) return
          try {
            if (currentTime > 0) audioEl.currentTime = currentTime
          } catch {
            ignoreError()
          }
          if (!wasPaused) {
            try {
              await audioEl.play()
            } catch {
              ignoreError()
            }
          }
        }

        remotePlaybackUrl = proxyUrl
        remoteNeedsCors = false

        let proxyLoadError: unknown = null
        try {
          await applyRemoteSource(remotePlaybackUrl, remoteNeedsCors)
        } catch (error) {
          proxyLoadError = error
        }
        if (!isActive()) return

        if (proxyLoadError) {
          const proxyStillReachable = await probeStreamProxy(proxyUrl, {
            signal: run.signal,
            timeoutMs: 12_000,
          })
          if (!isActive()) return

          if (proxyStillReachable) {
            throw proxyLoadError
          }

          remotePlaybackUrl = fallbackUrl === proxyUrl ? episode.enclosureUrl : fallbackUrl
          remoteNeedsCors = !isSameOriginUrl(remotePlaybackUrl)
          const canEnableFallback = remoteNeedsCors
            ? await corsProbe(remotePlaybackUrl, { signal: run.signal })
            : true
          if (!isActive()) return

          setCanDenoise?.(canEnableFallback)
          if (!canEnableFallback) {
            setDenoiseEnabled(false)
            setIsInferenceActive(false)
            lastInferenceAtRef.current = 0
            const proxyFailureReason = proxyLoadError ? coerceErrorMessage(proxyLoadError) : 'Unknown proxy failure'
            setEngineDetail(
              `Proxy unavailable (${proxyFailureReason}) and source blocks CORS. Download + import the file to denoise.`,
            )
            return
          }

          await applyRemoteSource(remotePlaybackUrl, remoteNeedsCors)
          if (!isActive()) return
        }
        setCanDenoise?.(true)
      } else {
        setCanDenoise?.(true)
      }

      const ensureEnginePromise = ensureEngine()
      await ensureEnginePromise
      if (!isActive()) return
      await engineRef.current!.attach(audioEl)
      if (!isActive()) return
      engineRef.current!.setEnabled(true)
      setDenoiseEnabled(true)
    } catch (error) {
      if (isAbortError(error) || run.signal.aborted || !isActive()) return
      const message = coerceErrorMessage(error)
      setEngineState('error')
      setDenoiseEnabled(false)
      setIsInferenceActive(false)
      lastInferenceAtRef.current = 0
      setEngineDetail(message)
      reportIssue('processing', 'Failed to enable audio processing', message)
    } finally {
      if (isActive()) {
        setIsProcessingStarting(false)
      }
      finishLatestAsyncRun(toggleTaskRef.current, run)
    }
  }, [
    audioRef,
    corsProbe,
    ensureEngine,
    episode,
    getRemotePlaybackUrl,
    probeStreamProxy,
    reportIssue,
    resetProcessingState,
    setCanDenoise,
    sourceKind,
    waitForAudioMetadata,
  ])

  const disposeProcessing = useCallback(() => {
    cancelLatestAsyncRun(toggleTaskRef.current)
    engineRef.current?.setInferenceActivityHandler(null)
    void engineRef.current?.dispose()
    engineRef.current = null
    initPromiseRef.current = null
  }, [])

  useEffect(() => {
    if (!denoiseEnabled || !isPlaying || engineState !== 'ready') {
      setIsInferenceActive(false)
      return
    }

    const thresholdMs = 700
    const intervalMs = 180
    const updateInferenceState = () => {
      const nextIsActive = performance.now() - lastInferenceAtRef.current <= thresholdMs
      setIsInferenceActive((prev) => (prev === nextIsActive ? prev : nextIsActive))
    }

    updateInferenceState()
    const timer = window.setInterval(updateInferenceState, intervalMs)
    return () => window.clearInterval(timer)
  }, [denoiseEnabled, engineState, isPlaying])

  return {
    engineState,
    setEngineState,
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
  }
}
