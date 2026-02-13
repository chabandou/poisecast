import { describe, expect, it } from 'vitest'
import {
  dedupeFeedsByUrl,
  dedupeGenres,
  normalizeFeedEntry,
  normalizeFeedUrlKey,
  normalizeLookupGenre,
  summarizeFeedStats,
} from '../../src/features/feeds/feedUtils'

describe('feedUtils', () => {
  it('normalizes and deduplicates genres', () => {
    expect(normalizeLookupGenre('  podcasts  ')).toBeNull()
    expect(normalizeLookupGenre('Technology')).toBe('Technology')
    expect(dedupeGenres(['Tech', 'tech', 'Science'])).toEqual(['Tech', 'Science'])
  })

  it('normalizes feed entries and dedupes by url', () => {
    const normalized = normalizeFeedEntry({ title: ' Demo ', rssUrl: ' https://a.example/rss ', category: 'News' })
    expect(normalized).toEqual({
      title: 'Demo',
      rssUrl: 'https://a.example/rss',
      category: 'News',
    })

    const deduped = dedupeFeedsByUrl([
      { title: 'A', rssUrl: 'https://a.example/rss' },
      { title: 'B', rssUrl: 'https://a.example/rss/' },
      { title: 'C', rssUrl: 'https://c.example/rss' },
    ])

    expect(normalizeFeedUrlKey('HTTPS://A.EXAMPLE/rss/')).toBe('https://a.example/rss')
    expect(deduped).toHaveLength(2)
    expect(deduped[0]?.title).toBe('A')
  })

  it('summarizes feed stats', () => {
    const stats = summarizeFeedStats({
      feed: { title: 'Demo' },
      episodes: [
        { guid: '1', title: 'One', enclosureUrl: 'https://audio/1.mp3', pubDate: '2025-01-02T00:00:00Z' },
        { guid: '2', title: 'Two', enclosureUrl: 'https://audio/2.mp3', pubDate: '2025-01-03T00:00:00Z' },
      ],
    })

    expect(stats.episodeCount).toBe(2)
    expect(stats.latestPubMs).toBe(new Date('2025-01-03T00:00:00Z').getTime())
  })
})
