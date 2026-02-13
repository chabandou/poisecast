import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeedRepository } from '../../src/features/feeds/feedRepository'

function rssXml(title: string, audioUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${title}</title>
    <item>
      <guid>${audioUrl}</guid>
      <title>${title} Episode</title>
      <enclosure url="${audioUrl}" type="audio/mpeg" />
    </item>
  </channel>
</rss>`
}

describe('FeedRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('evicts least-recently-used feed entries when capacity is exceeded', async () => {
    const urlA = 'https://feeds.example.com/a.xml'
    const urlB = 'https://feeds.example.com/b.xml'
    const urlC = 'https://feeds.example.com/c.xml'

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const requestUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      return new Response(rssXml(`Feed ${requestUrl.slice(-5, -4).toUpperCase()}`, `${requestUrl}.mp3`), {
        status: 200,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      })
    })

    const repository = new FeedRepository({
      feedCacheMaxEntries: 2,
    })

    await repository.loadFeed(urlA)
    await repository.loadFeed(urlB)
    await repository.loadFeed(urlA) // refresh A as most-recent
    await repository.loadFeed(urlC) // should evict B
    await repository.loadFeed(urlB) // re-fetch expected

    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  it('expires feed cache entries using TTL', async () => {
    const url = 'https://feeds.example.com/ttl.xml'
    let nowMs = 10_000

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(rssXml('TTL Feed', 'https://audio.example.com/ttl.mp3'), {
        status: 200,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      }),
    )

    const repository = new FeedRepository({
      feedCacheMaxEntries: 2,
      feedCacheTtlMs: 1_000,
      now: () => nowMs,
    })

    await repository.loadFeed(url)
    await repository.loadFeed(url)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    nowMs += 1_001
    await repository.loadFeed(url)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('evicts and expires lookup cache entries', async () => {
    const urlA = 'https://feeds.example.com/lookup-a.xml'
    const urlB = 'https://feeds.example.com/lookup-b.xml'
    let nowMs = 50_000

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const requestUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (!requestUrl.includes('/lookup?')) {
        throw new Error(`Unexpected URL: ${requestUrl}`)
      }

      const parsed = new URL(requestUrl)
      const feedUrl = parsed.searchParams.get('feedUrl') ?? ''
      const label = feedUrl.includes('lookup-a') ? 'A' : 'B'
      return new Response(
        JSON.stringify({
          results: [
            {
              artworkUrl600: `https://img.example.com/${label}.png`,
              primaryGenreName: `Genre ${label}`,
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    })

    const repository = new FeedRepository({
      lookupCacheMaxEntries: 1,
      lookupCacheTtlMs: 1_000,
      now: () => nowMs,
    })

    await repository.loadLookupMeta(urlA)
    await repository.loadLookupMeta(urlA) // cache hit
    await repository.loadLookupMeta(urlB) // evicts A (max entries = 1)
    await repository.loadLookupMeta(urlA) // re-fetch A
    expect(fetchSpy).toHaveBeenCalledTimes(3)

    nowMs += 1_001
    await repository.loadLookupMeta(urlA) // TTL-expired A -> re-fetch
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })
})
