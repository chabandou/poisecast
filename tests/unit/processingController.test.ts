import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useProcessingController } from '../../src/features/audio/useProcessingController'
import type { ModelSpec } from '../../src/models/models'
import type { PodcastEpisode } from '../../src/podcasts/types'
import type { ProcessingBootstrapService } from '../../src/features/audio/processingBootstrapService'
import type { IssueSource } from '../../src/features/system/useIssueLog'

describe('useProcessingController', () => {
  it('keeps latest toggle intent when an earlier enable attempt is superseded', async () => {
    const audio = {
      paused: true,
      currentTime: 0,
      removeAttribute: vi.fn(),
      load: vi.fn(),
      play: vi.fn(async () => undefined),
    } as unknown as HTMLAudioElement

    const model: ModelSpec = {
      id: 'test-model',
      label: 'Test Model',
      url: '/models/test.onnx',
      kind: 'time',
      sampleRateHz: 48_000,
      supported: true,
    }

    const episode: PodcastEpisode = {
      guid: 'episode-1',
      title: 'Episode 1',
      enclosureUrl: 'https://audio.example.com/ep1.mp3',
    }

    const processingBootstrap = {
      preferredOrtBaseUrl: '/ort',
      ensureOrtAssetsReady: vi.fn(),
      resolveModelInitUrl: vi.fn(),
    } as unknown as ProcessingBootstrapService

    const reportIssue = vi.fn<(source: IssueSource, summary: string, detail: unknown) => void>()
    const setCanDenoise = vi.fn<(next: boolean | null) => void>()

    const corsProbe = vi.fn(async () => false)
    const waitForAudioMetadata = vi.fn<(audioEl: HTMLAudioElement, timeoutMs?: number, signal?: AbortSignal) => Promise<void>>(
      async (_audioEl, _timeoutMs, signal) =>
        new Promise<void>((_resolve, reject) => {
          const abortError = new DOMException('Aborted', 'AbortError')
          if (signal?.aborted) {
            reject(abortError)
            return
          }
          signal?.addEventListener('abort', () => reject(abortError), { once: true })
        }),
    )
    const probeStreamProxy = vi.fn(async () => false)

    const { result } = renderHook(() =>
      useProcessingController({
        audioRef: { current: audio },
        model,
        isPlaying: false,
        episode,
        sourceKind: 'remote',
        getRemotePlaybackUrl: () => 'https://cdn.example.com/stream.mp3',
        processingBootstrap,
        reportIssue,
        setCanDenoise,
        corsProbe,
        probeStreamProxy,
        waitForAudioMetadata,
      }),
    )

    let enablePromise: Promise<void>
    act(() => {
      enablePromise = result.current.toggleDenoise(true)
    })

    await waitFor(() => {
      expect(result.current.isProcessingStarting).toBe(true)
    })

    await act(async () => {
      await result.current.toggleDenoise(false)
    })

    await act(async () => {
      await enablePromise!
    })

    expect(result.current.denoiseEnabled).toBe(false)
    expect(result.current.isProcessingStarting).toBe(false)
    expect(reportIssue).not.toHaveBeenCalled()
    expect(corsProbe).not.toHaveBeenCalled()
    expect(audio.removeAttribute).toHaveBeenCalledWith('crossorigin')
  })

  it('prefers proxy playback for processing even when playback fallback was direct', async () => {
    const audio = {
      paused: true,
      currentTime: 0,
      src: '',
      removeAttribute: vi.fn(),
      load: vi.fn(),
      play: vi.fn(async () => undefined),
    } as unknown as HTMLAudioElement

    const model: ModelSpec = {
      id: 'test-model',
      label: 'Test Model',
      url: '/models/test.onnx',
      kind: 'time',
      sampleRateHz: 48_000,
      supported: false,
    }

    const episode: PodcastEpisode = {
      guid: 'episode-2',
      title: 'Episode 2',
      enclosureUrl: 'https://audio.example.com/ep2.mp3',
    }
    const expectedProxyUrl = `/api/stream?url=${encodeURIComponent(episode.enclosureUrl)}`

    const processingBootstrap = {
      preferredOrtBaseUrl: '/ort',
      ensureOrtAssetsReady: vi.fn(),
      resolveModelInitUrl: vi.fn(),
    } as unknown as ProcessingBootstrapService

    const reportIssue = vi.fn<(source: IssueSource, summary: string, detail: unknown) => void>()
    const setCanDenoise = vi.fn<(next: boolean | null) => void>()
    const corsProbe = vi.fn(async () => false)
    const probeStreamProxy = vi.fn(async () => true)
    const waitForAudioMetadata = vi.fn(async () => {})

    const { result } = renderHook(() =>
      useProcessingController({
        audioRef: { current: audio },
        model,
        isPlaying: false,
        episode,
        sourceKind: 'remote',
        getRemotePlaybackUrl: () => episode.enclosureUrl,
        processingBootstrap,
        reportIssue,
        setCanDenoise,
        corsProbe,
        probeStreamProxy,
        waitForAudioMetadata,
      }),
    )

    await act(async () => {
      await result.current.toggleDenoise(true)
    })

    expect(probeStreamProxy).not.toHaveBeenCalled()
    expect(corsProbe).not.toHaveBeenCalled()
    expect(waitForAudioMetadata).toHaveBeenCalled()
    expect(audio.src).toBe(expectedProxyUrl)
    expect(setCanDenoise).toHaveBeenCalledWith(true)
    expect(reportIssue).toHaveBeenCalledWith(
      'processing',
      'Failed to enable audio processing',
      'Selected model is not supported yet',
    )
  })

  it('falls back to direct CORS probe only after a real proxy load failure', async () => {
    const audio = {
      paused: true,
      currentTime: 0,
      src: '',
      removeAttribute: vi.fn(),
      load: vi.fn(),
      play: vi.fn(async () => undefined),
    } as unknown as HTMLAudioElement

    const model: ModelSpec = {
      id: 'test-model',
      label: 'Test Model',
      url: '/models/test.onnx',
      kind: 'time',
      sampleRateHz: 48_000,
      supported: true,
    }

    const episode: PodcastEpisode = {
      guid: 'episode-3',
      title: 'Episode 3',
      enclosureUrl: 'https://audio.example.com/ep3.mp3',
    }
    const expectedProxyUrl = `/api/stream?url=${encodeURIComponent(episode.enclosureUrl)}`

    const processingBootstrap = {
      preferredOrtBaseUrl: '/ort',
      ensureOrtAssetsReady: vi.fn(),
      resolveModelInitUrl: vi.fn(),
    } as unknown as ProcessingBootstrapService

    const reportIssue = vi.fn<(source: IssueSource, summary: string, detail: unknown) => void>()
    const setCanDenoise = vi.fn<(next: boolean | null) => void>()
    const corsProbe = vi.fn(async () => false)
    const probeStreamProxy = vi.fn(async () => false)
    const waitForAudioMetadata = vi.fn(async (audioEl: HTMLAudioElement) => {
      if (audioEl.src.startsWith('/api/stream?url=')) {
        throw new Error('Proxy metadata load failed')
      }
    })

    const { result } = renderHook(() =>
      useProcessingController({
        audioRef: { current: audio },
        model,
        isPlaying: false,
        episode,
        sourceKind: 'remote',
        getRemotePlaybackUrl: () => episode.enclosureUrl,
        processingBootstrap,
        reportIssue,
        setCanDenoise,
        corsProbe,
        probeStreamProxy,
        waitForAudioMetadata,
      }),
    )

    await act(async () => {
      await result.current.toggleDenoise(true)
    })

    expect(probeStreamProxy).toHaveBeenCalledWith(
      expectedProxyUrl,
      expect.objectContaining({ timeoutMs: 12_000 }),
    )
    expect(corsProbe).toHaveBeenCalledWith(episode.enclosureUrl, expect.any(Object))
    expect(waitForAudioMetadata).toHaveBeenCalledTimes(1)
    expect(audio.src).toBe(expectedProxyUrl)
    expect(setCanDenoise).toHaveBeenCalledWith(false)
    expect(result.current.engineDetail).toBe(
      'Proxy unavailable and source blocks CORS. Download + import the file to denoise.',
    )
    expect(reportIssue).not.toHaveBeenCalled()
  })
})
