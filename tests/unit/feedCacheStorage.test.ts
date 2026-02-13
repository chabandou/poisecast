import { describe, expect, it } from 'vitest'
import type { ParsedPodcast } from '../../src/podcasts/types'
import {
  FEED_CACHE_SCHEMA_VERSION,
  FEED_IMAGE_CACHE_SCHEMA_VERSION,
  loadPersistedFeedCache,
  loadPersistedFeedImages,
  persistFeedCache,
  persistFeedImages,
} from '../../src/features/feeds/feedCacheStorage'

function createMemoryStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    read: (key: string) => store.get(key) ?? null,
  }
}

function samplePodcast(title: string): ParsedPodcast {
  return {
    feed: { title },
    episodes: [
      {
        guid: `${title}-guid`,
        title: `${title} Episode`,
        enclosureUrl: `https://audio.example.com/${title}.mp3`,
      },
    ],
  }
}

describe('feedCacheStorage', () => {
  it('loads v2 feed cache envelope', () => {
    const storage = createMemoryStorage({
      feedCache: JSON.stringify({
        version: FEED_CACHE_SCHEMA_VERSION,
        savedAtMs: 123,
        entries: [['https://feeds.example.com/a.xml', samplePodcast('A')]],
      }),
    })

    const result = loadPersistedFeedCache(storage, 'feedCache', 20)
    expect(result.migratedFromLegacy).toBe(false)
    expect(result.value.size).toBe(1)
    expect(result.value.get('https://feeds.example.com/a.xml')?.feed.title).toBe('A')
  })

  it('loads and marks legacy feed cache payloads for migration', () => {
    const storage = createMemoryStorage({
      feedCache: JSON.stringify({
        entries: [['https://feeds.example.com/legacy.xml', samplePodcast('Legacy')]],
      }),
    })

    const result = loadPersistedFeedCache(storage, 'feedCache', 20)
    expect(result.migratedFromLegacy).toBe(true)
    expect(result.value.get('https://feeds.example.com/legacy.xml')?.feed.title).toBe('Legacy')
  })

  it('loads and marks legacy image cache payloads for migration', () => {
    const storage = createMemoryStorage({
      feedImages: JSON.stringify({
        'https://feeds.example.com/a.xml': 'https://img.example.com/a.png',
      }),
    })

    const result = loadPersistedFeedImages(storage, 'feedImages')
    expect(result.migratedFromLegacy).toBe(true)
    expect(result.value['https://feeds.example.com/a.xml']).toBe('https://img.example.com/a.png')
  })

  it('persists feed cache and images using versioned envelopes', () => {
    const storage = createMemoryStorage()
    const feedMap = new Map<string, ParsedPodcast>([
      ['https://feeds.example.com/a.xml', samplePodcast('A')],
    ])
    const imageMap = {
      'https://feeds.example.com/a.xml': 'https://img.example.com/a.png',
    }

    persistFeedCache(storage, 'feedCache', feedMap, () => 321)
    persistFeedImages(storage, 'feedImages', imageMap, () => 654)

    const feedPayload = JSON.parse(storage.read('feedCache') ?? '{}') as {
      version?: number
      savedAtMs?: number
      entries?: unknown[]
    }
    const imagePayload = JSON.parse(storage.read('feedImages') ?? '{}') as {
      version?: number
      savedAtMs?: number
      images?: Record<string, string>
    }

    expect(feedPayload.version).toBe(FEED_CACHE_SCHEMA_VERSION)
    expect(feedPayload.savedAtMs).toBe(321)
    expect(Array.isArray(feedPayload.entries)).toBe(true)
    expect(imagePayload.version).toBe(FEED_IMAGE_CACHE_SCHEMA_VERSION)
    expect(imagePayload.savedAtMs).toBe(654)
    expect(imagePayload.images?.['https://feeds.example.com/a.xml']).toBe('https://img.example.com/a.png')
  })
})
