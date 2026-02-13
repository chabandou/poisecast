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

    const corsProbe = vi.fn<(url: string, options?: { signal?: AbortSignal }) => Promise<boolean>>(
      async (_url, options) =>
        new Promise<boolean>((_resolve, reject) => {
          const abortError = new DOMException('Aborted', 'AbortError')
          if (options?.signal?.aborted) {
            reject(abortError)
            return
          }
          options?.signal?.addEventListener('abort', () => reject(abortError), { once: true })
        }),
    )

    const waitForAudioMetadata = vi.fn(async () => {})

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
    expect(audio.removeAttribute).toHaveBeenCalledWith('crossorigin')
  })
})
