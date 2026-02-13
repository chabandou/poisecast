import type { ParsedPodcast, PodcastEpisode } from './types'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function formatDateStamp(value?: string): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  const day = pad2(d.getDate())
  const month = d.toLocaleString(undefined, { month: 'short' }).toUpperCase()
  const year = d.getFullYear()
  return `${day} ${month} ${year}`
}

function text(node: Element | null | undefined): string | undefined {
  const v = node?.textContent?.trim()
  return v && v.length ? v : undefined
}

function attr(node: Element | null | undefined, name: string): string | undefined {
  const v = node?.getAttribute(name)?.trim()
  return v && v.length ? v : undefined
}

function safeGuid(item: Element, fallback: string): string {
  return (
    text(item.querySelector('guid')) ||
    attr(item.querySelector('enclosure'), 'url') ||
    fallback
  )
}

function normalizeGenre(value?: string): string | undefined {
  const v = value?.replace(/\s+/g, ' ').trim()
  if (!v) return undefined
  if (/^(podcast|podcasts|rss|feed)$/i.test(v)) return undefined
  return v
}

function collectCategoryValues(root: Element): string[] {
  const values: string[] = []
  const seen = new Set<string>()
  const add = (value?: string) => {
    const genre = normalizeGenre(value)
    if (!genre) return
    const key = genre.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    values.push(genre)
  }

  const categories = Array.from(root.children).filter((el) => el.localName?.toLowerCase() === 'category')
  for (const categoryNode of categories) {
    add(text(categoryNode))
    add(attr(categoryNode, 'text'))
    const nested = Array.from(categoryNode.querySelectorAll('*')).filter((el) => el.localName?.toLowerCase() === 'category')
    for (const nestedNode of nested) {
      add(attr(nestedNode, 'text') || text(nestedNode))
    }
  }

  return values
}

function collectFeedGenres(channel: Element): string[] {
  const channelGenres = collectCategoryValues(channel)
  if (channelGenres.length) return channelGenres.slice(0, 6)

  // Fallback: infer top genres from item-level categories for feeds that omit channel categories.
  const counts = new Map<string, { label: string; count: number }>()
  const items = Array.from(channel.querySelectorAll('item')).slice(0, 80)
  for (const item of items) {
    for (const genre of collectCategoryValues(item)) {
      const key = genre.toLowerCase()
      const prev = counts.get(key)
      if (prev) prev.count += 1
      else counts.set(key, { label: genre, count: 1 })
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 6)
    .map((entry) => entry.label)
}

type FetchAndParseRssOptions = {
  signal?: AbortSignal
}

export async function fetchAndParseRss(
  rssUrl: string,
  options: FetchAndParseRssOptions = {},
): Promise<ParsedPodcast> {
  const res = await fetch(rssUrl, { mode: 'cors', signal: options.signal })
  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${res.status} ${res.statusText}`)
  }

  const xml = await res.text()
  const doc = new DOMParser().parseFromString(xml, 'text/xml')

  const channel = doc.querySelector('channel')
  if (!channel) throw new Error('Invalid RSS: missing <channel>')

  const title = text(channel.querySelector('title')) ?? 'Untitled Feed'
  const description = text(channel.querySelector('description'))

  // RSS <image><url> OR iTunes <itunes:image href="...">
  const imageUrl =
    text(channel.querySelector('image > url')) || attr(channel.querySelector('itunes\\:image'), 'href')
  const genres = collectFeedGenres(channel)

  const items = Array.from(channel.querySelectorAll('item'))
  const episodes = items
    .map((item, idx): PodcastEpisode | null => {
      const enclosureUrl = attr(item.querySelector('enclosure'), 'url')
      if (!enclosureUrl) return null

      const ep: PodcastEpisode = {
        guid: safeGuid(item, `${idx}-${enclosureUrl}`),
        title: text(item.querySelector('title')) ?? '(untitled episode)',
        enclosureUrl,
      }

      const pubDate = text(item.querySelector('pubDate'))
      if (pubDate) {
        ep.pubDate = pubDate
        const dateStamp = formatDateStamp(pubDate)
        if (dateStamp) ep.dateStamp = dateStamp
      }
      const duration = text(item.querySelector('itunes\\:duration'))
      if (duration) ep.duration = duration
      const description = text(item.querySelector('description')) || text(item.querySelector('content\\:encoded'))
      if (description) ep.description = description

      return ep
    })
    .filter((x): x is PodcastEpisode => x !== null)

  return {
    feed: { title, description, imageUrl, genres },
    episodes,
  }
}
