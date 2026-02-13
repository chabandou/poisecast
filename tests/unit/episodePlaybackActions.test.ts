import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEpisodePlaybackActions } from '../../src/features/player/useEpisodePlaybackActions'
import type { PodcastEpisode } from '../../src/podcasts/types'

describe('useEpisodePlaybackActions', () => {
  it('keeps latest episode selection when earlier probe resolves later', async () => {
    const audio = {
      src: '',
      removeAttribute: vi.fn(),
      load: vi.fn(),
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    } as unknown as HTMLAudioElement

    const episodeA: PodcastEpisode = {
      guid: 'ep-a',
      title: 'Episode A',
      enclosureUrl: 'https://example.com/a.mp3',
    }
    const episodeB: PodcastEpisode = {
      guid: 'ep-b',
      title: 'Episode B',
      enclosureUrl: 'https://example.com/b.mp3',
    }

    let resolveFirstProbe: ((value: boolean) => void) | null = null
    const firstProbePromise = new Promise<boolean>((resolve) => {
      resolveFirstProbe = resolve
    })

    const probeStreamProxy = vi
      .fn<(url: string) => Promise<boolean>>()
      .mockImplementationOnce(async () => firstProbePromise)
      .mockResolvedValue(true)

    const { result } = renderHook(() =>
      useEpisodePlaybackActions({
        audioRef: { current: audio },
        objectUrlRef: { current: null },
        proxyBypassRef: { current: new Set<string>() },
        proxyVerifiedRef: { current: new Set<string>() },
        footerCloseTimerRef: { current: null },
        episode: null,
        episodesAll: [episodeA, episodeB],
        sourceKind: 'remote',
        podcastImageUrl: null,
        rssUrl: 'https://example.com/feed.xml',
        feedImages: {},
        getRemotePlaybackUrl: (episode) => `https://proxy.example/${episode.guid}.mp3`,
        probeStreamProxy,
        cancelFooterCloseTimer: vi.fn(),
        cancelFooterExpandTimer: vi.fn(),
        setLoadingEpisodeId: vi.fn(),
        resetProcessingState: vi.fn(),
        setEpisode: vi.fn(),
        setNowPlayingArtworkUrl: vi.fn(),
        setSourceKind: vi.fn(),
        setCanDenoise: vi.fn(),
        setEngineDetail: vi.fn(),
        reportIssue: vi.fn(),
        setIsFooterClosing: vi.fn(),
        setIsFooterExpanding: vi.fn(),
        setIsFooterExpanded: vi.fn(),
        setIsFooterCollapsing: vi.fn(),
        setIsSidebarCompact: vi.fn(),
        onRequestShowDetails: vi.fn(),
      }),
    )

    const startA = result.current.startEpisode(episodeA)
    const startB = result.current.startEpisode(episodeB)

    await startB
    expect(audio.src).toBe('https://proxy.example/ep-b.mp3')

    resolveFirstProbe?.(true)
    await startA

    expect(audio.src).toBe('https://proxy.example/ep-b.mp3')
    expect(audio.load).toHaveBeenCalledTimes(1)
  })
})
