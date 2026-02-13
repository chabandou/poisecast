import { getModelCandidateUrls, type ModelSpec } from '../../models/models'
import { coerceErrorMessage, normalizeIssueDetail } from '../system/errors'
import { parseContentLength } from '../system/format'
import { normalizeBaseUrl, toAbsoluteUrl } from '../system/url'

export const MODEL_CACHE_NAME = 'poisecast-assets'
export const ORT_DOWNLOAD_RETRY_MAX = 3
export const DEFAULT_LOCAL_ORT_BASE_URL = '/ort'
export const DEFAULT_CDN_ORT_BASE_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist'
export const DEFAULT_GITHUB_ORT_BASE_URL =
  'https://raw.githubusercontent.com/chabandou/poisecast/master/ort'
export const ORT_WASM_CORE_FILES = ['ort-wasm.wasm', 'ort-wasm-simd.wasm', 'ort-wasm-simd.jsep.wasm'] as const
export const ORT_WASM_EXTENDED_FILES = [
  'ort-wasm-threaded.wasm',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.asyncify.wasm',
] as const

const ASSET_FETCH_TIMEOUT_MS = 120_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

type CacheAssetHooks = {
  onDownloadStart?: (info: { absoluteUrl: string }) => void
  onProgress?: (info: {
    absoluteUrl: string
    loadedBytes: number
    totalBytes: number | null
  }) => void
}

export type ResolveModelHooks = {
  onDownloadStart?: (info: {
    url: string
    attempt: number
    totalAttempts: number
  }) => void
  onProgress?: (info: {
    url: string
    attempt: number
    totalAttempts: number
    loadedBytes: number
    totalBytes: number | null
  }) => void
  onSourceFailed?: (info: {
    url: string
    attempt: number
    totalAttempts: number
    message: string
  }) => void
}

export type ResolveOrtHooks = {
  onDownloadStart?: (info: {
    url: string
    fileName: string
    fileIndex: number
    totalFiles: number
    attempt: number
    totalAttempts: number
  }) => void
  onProgress?: (info: {
    url: string
    fileName: string
    fileIndex: number
    totalFiles: number
    attempt: number
    totalAttempts: number
    loadedBytes: number
    totalBytes: number | null
  }) => void
  onRetry?: (info: {
    url: string
    fileName: string
    fileIndex: number
    totalFiles: number
    attempt: number
    totalAttempts: number
    message: string
  }) => void
  onSourceFallback?: (info: {
    failedBaseUrl: string
    nextBaseUrl: string | null
    message: string
  }) => void
}

type EnsureOrtAssetsReadyOptions = {
  mode: 'core' | 'extended'
  hooks?: ResolveOrtHooks
}

type ProcessingBootstrapServiceOptions = {
  ortBaseUrl?: string
  ortBaseUrls?: readonly string[]
  modelCacheName?: string
  defaultOrtBaseUrl?: string
  ortDownloadRetryMax?: number
  coreFiles?: readonly string[]
  extendedFiles?: readonly string[]
}

function buildOrtBaseUrlCandidates(options: {
  ortBaseUrl?: string
  ortBaseUrls?: readonly string[]
  fallbackBaseUrl: string
}): string[] {
  const configured = [
    ...(options.ortBaseUrls ?? []),
    ...(options.ortBaseUrl ? [options.ortBaseUrl] : []),
    DEFAULT_LOCAL_ORT_BASE_URL,
    DEFAULT_CDN_ORT_BASE_URL,
    DEFAULT_GITHUB_ORT_BASE_URL,
  ]

  const deduped: string[] = []
  const seen = new Set<string>()
  for (const candidate of configured) {
    const normalized = normalizeBaseUrl(candidate, options.fallbackBaseUrl)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(normalized)
  }

  if (deduped.length > 0) return deduped
  return [options.fallbackBaseUrl]
}

export class ProcessingBootstrapService {
  private readonly ortBaseUrls: readonly string[]
  private readonly modelCacheName: string
  private readonly defaultOrtBaseUrl: string
  private readonly ortDownloadRetryMax: number
  private readonly coreFiles: readonly string[]
  private readonly extendedFiles: readonly string[]

  private ortCoreReady = false
  private ortExtendedReady = false
  private ortCoreReadyBaseUrl: string | null = null
  private ortExtendedReadyBaseUrl: string | null = null
  private ortCoreInitPromise: Promise<string> | null = null
  private ortExtendedInitPromise: Promise<string> | null = null

  constructor(options: ProcessingBootstrapServiceOptions) {
    this.modelCacheName = options.modelCacheName ?? MODEL_CACHE_NAME
    this.defaultOrtBaseUrl = options.defaultOrtBaseUrl ?? DEFAULT_LOCAL_ORT_BASE_URL
    this.ortDownloadRetryMax = options.ortDownloadRetryMax ?? ORT_DOWNLOAD_RETRY_MAX
    this.coreFiles = options.coreFiles ?? ORT_WASM_CORE_FILES
    this.extendedFiles = options.extendedFiles ?? ORT_WASM_EXTENDED_FILES
    this.ortBaseUrls = buildOrtBaseUrlCandidates({
      ortBaseUrl: options.ortBaseUrl,
      ortBaseUrls: options.ortBaseUrls,
      fallbackBaseUrl: this.defaultOrtBaseUrl,
    })
  }

  get preferredOrtBaseUrl(): string {
    return this.ortBaseUrls[0] ?? this.defaultOrtBaseUrl
  }

  async ensureOrtAssetsReady(options: EnsureOrtAssetsReadyOptions): Promise<string> {
    const isExtended = options.mode === 'extended'
    if (isExtended ? this.ortExtendedReady : this.ortCoreReady) {
      return isExtended
        ? (this.ortExtendedReadyBaseUrl ?? this.preferredOrtBaseUrl)
        : (this.ortCoreReadyBaseUrl ?? this.preferredOrtBaseUrl)
    }

    if (!isExtended) {
      if (!this.ortCoreInitPromise) {
        this.ortCoreInitPromise = this.resolveOrtAssetsFromSources(this.coreFiles, options.hooks)
          .then((baseUrl) => {
            this.ortCoreReady = true
            this.ortCoreReadyBaseUrl = baseUrl
            return baseUrl
          })
          .catch((error) => {
            this.ortCoreReady = false
            this.ortCoreReadyBaseUrl = null
            this.ortCoreInitPromise = null
            throw error
          })
      }
      return this.ortCoreInitPromise
    }

    if (!this.ortExtendedInitPromise) {
      this.ortExtendedInitPromise = this.resolveOrtAssetsFromSources(this.extendedFiles, options.hooks)
        .then((baseUrl) => {
          this.ortExtendedReady = true
          this.ortExtendedReadyBaseUrl = baseUrl
          return baseUrl
        })
        .catch((error) => {
          this.ortExtendedReady = false
          this.ortExtendedReadyBaseUrl = null
          this.ortExtendedInitPromise = null
          throw error
        })
    }

    return this.ortExtendedInitPromise
  }

  async resolveModelInitUrl(model: ModelSpec, hooks: ResolveModelHooks = {}): Promise<string> {
    const attempts: string[] = []
    const candidateUrls = getModelCandidateUrls(model)

    for (let index = 0; index < candidateUrls.length; index += 1) {
      const url = candidateUrls[index]
      const attempt = index + 1
      const totalAttempts = candidateUrls.length
      const absoluteAttemptUrl = toAbsoluteUrl(url)

      try {
        const result = await this.cacheAssetOnDemand(url, {
          onDownloadStart: ({ absoluteUrl }) => {
            hooks.onDownloadStart?.({ url: absoluteUrl, attempt, totalAttempts })
          },
          onProgress: ({ absoluteUrl, loadedBytes, totalBytes }) => {
            hooks.onProgress?.({
              url: absoluteUrl,
              attempt,
              totalAttempts,
              loadedBytes,
              totalBytes,
            })
          },
        })
        return result.absoluteUrl
      } catch (error) {
        const detail = normalizeIssueDetail(coerceErrorMessage(error), 140)
        hooks.onSourceFailed?.({
          url: absoluteAttemptUrl,
          attempt,
          totalAttempts,
          message: detail,
        })
        attempts.push(`${absoluteAttemptUrl} (${detail})`)
      }
    }

    const summary = attempts.join(' | ')
    throw new Error(`Model download failed from all configured sources: ${summary || 'unknown error'}`)
  }

  private async resolveOrtAssetsFromSources(files: readonly string[], hooks: ResolveOrtHooks = {}): Promise<string> {
    const sourceFailures: string[] = []

    for (let sourceIndex = 0; sourceIndex < this.ortBaseUrls.length; sourceIndex += 1) {
      const candidateBaseUrl = this.ortBaseUrls[sourceIndex]
      const nextBaseUrl = this.ortBaseUrls[sourceIndex + 1] ?? null

      try {
        return await this.resolveOrtAssetsReady(candidateBaseUrl, files, hooks)
      } catch (error) {
        const message = normalizeIssueDetail(coerceErrorMessage(error), 160)
        sourceFailures.push(`${candidateBaseUrl}: ${message}`)
        hooks.onSourceFallback?.({
          failedBaseUrl: candidateBaseUrl,
          nextBaseUrl,
          message,
        })
      }
    }

    throw new Error(`ORT runtime download failed from all sources: ${sourceFailures.join(' | ')}`)
  }

  private async resolveOrtAssetsReady(
    baseUrl: string,
    files: readonly string[],
    hooks: ResolveOrtHooks = {},
  ): Promise<string> {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl, this.defaultOrtBaseUrl)
    const totalFiles = files.length
    const fileLoaded = new Map<string, number>()
    const fileTotals = new Map<string, number | null>()

    const emitProgress = (
      fileName: string,
      info: {
        url: string
        fileIndex: number
        attempt: number
        totalAttempts: number
        loadedBytes: number
        totalBytes: number | null
      },
    ) => {
      fileLoaded.set(fileName, info.loadedBytes)
      fileTotals.set(fileName, info.totalBytes)
      hooks.onProgress?.({
        ...info,
        fileName,
        totalFiles,
        loadedBytes: Array.from(fileLoaded.values()).reduce((sum, next) => sum + next, 0),
        totalBytes: Array.from(fileTotals.values()).every((v) => typeof v === 'number' && v > 0)
          ? (Array.from(fileTotals.values()) as number[]).reduce((sum, next) => sum + next, 0)
          : null,
      })
    }

    for (let i = 0; i < totalFiles; i += 1) {
      const fileName = files[i]
      const fileIndex = i + 1
      const url = `${normalizedBaseUrl}/${fileName}`

      let completed = false
      for (let attempt = 1; attempt <= this.ortDownloadRetryMax; attempt += 1) {
        hooks.onDownloadStart?.({
          url,
          fileName,
          fileIndex,
          totalFiles,
          attempt,
          totalAttempts: this.ortDownloadRetryMax,
        })

        try {
          const result = await this.cacheAssetOnDemand(url, {
            onDownloadStart: ({ absoluteUrl }) => {
              emitProgress(fileName, {
                url: absoluteUrl,
                fileIndex,
                attempt,
                totalAttempts: this.ortDownloadRetryMax,
                loadedBytes: fileLoaded.get(fileName) ?? 0,
                totalBytes: fileTotals.get(fileName) ?? null,
              })
            },
            onProgress: ({ absoluteUrl, loadedBytes, totalBytes }) => {
              emitProgress(fileName, {
                url: absoluteUrl,
                fileIndex,
                attempt,
                totalAttempts: this.ortDownloadRetryMax,
                loadedBytes,
                totalBytes,
              })
            },
          })

          if (result.fromCache) {
            emitProgress(fileName, {
              url: result.absoluteUrl,
              fileIndex,
              attempt,
              totalAttempts: this.ortDownloadRetryMax,
              loadedBytes: fileLoaded.get(fileName) ?? 0,
              totalBytes: fileTotals.get(fileName) ?? null,
            })
          }

          completed = true
          break
        } catch (error) {
          const message = normalizeIssueDetail(coerceErrorMessage(error), 180)
          hooks.onRetry?.({
            url,
            fileName,
            fileIndex,
            totalFiles,
            attempt,
            totalAttempts: this.ortDownloadRetryMax,
            message,
          })
          if (attempt < this.ortDownloadRetryMax) {
            await sleep(300 * attempt)
          }
        }
      }

      if (!completed) {
        throw new Error(`ORT runtime download failed for ${fileName} after ${this.ortDownloadRetryMax} attempts`)
      }
    }

    return normalizedBaseUrl
  }

  private async probeAssetDownload(assetUrl: string): Promise<void> {
    try {
      const head = await fetchWithTimeout(
        assetUrl,
        { method: 'HEAD', cache: 'no-store' },
        ASSET_FETCH_TIMEOUT_MS,
        `Asset probe failed for ${assetUrl}`,
      )
      if (head.ok) return
    } catch {
      // Fall back to range GET probe.
    }

    const res = await fetchWithTimeout(
      assetUrl,
      {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        cache: 'no-store',
      },
      ASSET_FETCH_TIMEOUT_MS,
      `Asset probe failed for ${assetUrl}`,
    )

    if (res.body) {
      void res.body.cancel().catch(() => {})
    }

    if (!res.ok) {
      throw new Error(`Asset download failed (${res.status})`)
    }
  }

  private async cacheAssetOnDemand(
    assetUrl: string,
    hooks: CacheAssetHooks = {},
  ): Promise<{ fromCache: boolean; absoluteUrl: string }> {
    const absoluteUrl = toAbsoluteUrl(assetUrl)

    if (!('caches' in window)) {
      hooks.onDownloadStart?.({ absoluteUrl })
      await this.probeAssetDownload(absoluteUrl)
      return { fromCache: false, absoluteUrl }
    }

    const cache = await caches.open(this.modelCacheName)
    const hit = await cache.match(absoluteUrl, { ignoreSearch: true })
    if (hit) return { fromCache: true, absoluteUrl }

    hooks.onDownloadStart?.({ absoluteUrl })
    const res = await fetchWithTimeout(
      absoluteUrl,
      { cache: 'no-store' },
      ASSET_FETCH_TIMEOUT_MS,
      `Asset download failed for ${absoluteUrl}`,
    )

    if (!res.ok) {
      throw new Error(`Asset download failed (${res.status})`)
    }

    const totalBytes = parseContentLength(res.headers)
    const onProgress = hooks.onProgress

    if (res.body && onProgress) {
      const [cacheStream, progressStream] = res.body.tee()
      const cachePutPromise = cache.put(
        absoluteUrl,
        new Response(cacheStream, {
          status: res.status,
          statusText: res.statusText,
          headers: new Headers(res.headers),
        }),
      )

      const progressPromise = (async () => {
        let loadedBytes = 0
        onProgress({ absoluteUrl, loadedBytes, totalBytes })
        const reader = progressStream.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            loadedBytes += value?.byteLength ?? 0
            onProgress({ absoluteUrl, loadedBytes, totalBytes })
          }
        } finally {
          reader.releaseLock()
        }
      })()

      await Promise.all([cachePutPromise, progressPromise])
    } else {
      await cache.put(absoluteUrl, res.clone())
    }

    return { fromCache: false, absoluteUrl }
  }
}
