import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAndParseRss } from '../../src/podcasts/rss'

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss
  version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
>
  <channel>
    <title>Metadata Feed</title>
    <item>
      <guid>ep-1</guid>
      <title>Episode One</title>
      <link>https://example.com/ep1</link>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="123456" />
      <pubDate>Fri, 01 Jan 2025 00:00:00 GMT</pubDate>
      <itunes:duration>01:02:03</itunes:duration>
      <itunes:author>Host One</itunes:author>
      <itunes:image href="https://example.com/ep1.jpg" />
      <itunes:season>2</itunes:season>
      <itunes:episode>7</itunes:episode>
      <itunes:episodeType>trailer</itunes:episodeType>
      <itunes:explicit>clean</itunes:explicit>
      <description>Episode one description</description>
    </item>
    <item>
      <guid>ep-2</guid>
      <title>Episode Two</title>
      <enclosure url="https://example.com/ep2.mp3" />
      <media:content duration="95" />
      <dc:creator>Guest Author</dc:creator>
      <media:thumbnail url="https://example.com/ep2.jpg" />
      <itunes:episodeType>bonus</itunes:episodeType>
      <itunes:explicit>yes</itunes:explicit>
    </item>
  </channel>
</rss>`

describe('fetchAndParseRss', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses extended episode metadata when RSS item tags are present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(RSS_XML, {
        status: 200,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      }),
    )

    const parsed = await fetchAndParseRss('https://feeds.example.com/metadata.xml')
    expect(parsed.episodes).toHaveLength(2)

    const first = parsed.episodes[0]
    expect(first.enclosureType).toBe('audio/mpeg')
    expect(first.enclosureLengthBytes).toBe(123456)
    expect(first.duration).toBe('01:02:03')
    expect(first.durationSeconds).toBe(3723)
    expect(first.author).toBe('Host One')
    expect(first.linkUrl).toBe('https://example.com/ep1')
    expect(first.imageUrl).toBe('https://example.com/ep1.jpg')
    expect(first.seasonNumber).toBe(2)
    expect(first.episodeNumber).toBe(7)
    expect(first.episodeType).toBe('trailer')
    expect(first.explicit).toBe(false)

    const second = parsed.episodes[1]
    expect(second.duration).toBe('95')
    expect(second.durationSeconds).toBe(95)
    expect(second.author).toBe('Guest Author')
    expect(second.imageUrl).toBe('https://example.com/ep2.jpg')
    expect(second.episodeType).toBe('bonus')
    expect(second.explicit).toBe(true)
  })
})
