import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFeedLoader } from '../../src/features/feeds/useFeedLoader'

const RSS_A = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Feed A</title>
    <description>Feed A description</description>
    <image><url>https://example.com/a.png</url></image>
    <category>Technology</category>
    <item>
      <guid>a-1</guid>
      <title>Episode A1</title>
      <enclosure url="https://example.com/a1.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`

const RSS_B = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Feed B</title>
    <description>Feed B description</description>
    <image><url>https://example.com/b.png</url></image>
    <category>Science</category>
    <item>
      <guid>b-1</guid>
      <title>Episode B1</title>
      <enclosure url="https://example.com/b1.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`

describe('useFeedLoader', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('keeps newest feed selection when an older request resolves late', async () => {
    const firstUrl = `https://feeds.example.com/feed-a.xml?run=${Date.now()}`
    const secondUrl = `https://feeds.example.com/feed-b.xml?run=${Date.now()}`

    let resolveFirst: ((value: Response) => void) | null = null
    let rejectFirst: ((reason?: unknown) => void) | null = null
    const firstResponse = new Promise<Response>((resolve, reject) => {
      resolveFirst = resolve
      rejectFirst = reject
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const requestUrl = request.url
      const signal = request.signal

      if (requestUrl === firstUrl) {
        const onAbort = () => rejectFirst?.(new DOMException('Aborted', 'AbortError'))
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        signal.addEventListener('abort', onAbort, { once: true })
        try {
          return await firstResponse
        } finally {
          signal.removeEventListener('abort', onAbort)
        }
      }

      if (requestUrl === secondUrl) {
        return new Response(RSS_B, {
          status: 200,
          headers: { 'content-type': 'application/xml; charset=utf-8' },
        })
      }

      return new Response(RSS_A, {
        status: 200,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      })
    })

    const { result } = renderHook(() =>
      useFeedLoader({
        audioRef: { current: null },
        cancelFooterCloseTimer: vi.fn(),
        setIsFooterClosing: vi.fn(),
        setEpisode: vi.fn(),
        setNowPlayingArtworkUrl: vi.fn(),
        setSourceKind: vi.fn(),
        resetProcessingState: vi.fn(),
        setEpisodeQuery: vi.fn(),
        feedCacheKey: `test.feedCache.${Date.now()}`,
        feedImageCacheKey: `test.feedImageCache.${Date.now()}`,
      }),
    )

    let loadFirstPromise: Promise<void>
    await act(async () => {
      loadFirstPromise = result.current.loadFeed(firstUrl)
    })

    let loadSecondPromise: Promise<void>
    await act(async () => {
      loadSecondPromise = result.current.loadFeed(secondUrl)
    })

    await act(async () => {
      await loadSecondPromise
    })

    await waitFor(() => {
      expect(result.current.podcast?.feed.title).toBe('Feed B')
    })

    resolveFirst?.(
      new Response(RSS_A, {
        status: 200,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      }),
    )

    await act(async () => {
      await loadFirstPromise!
    })

    expect(result.current.podcast?.feed.title).toBe('Feed B')
    expect(result.current.loadingFeedUrl).toBeNull()
    expect(result.current.rssError).toBeNull()
  })
})
