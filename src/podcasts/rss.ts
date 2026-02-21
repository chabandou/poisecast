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

function findDescendantByLocalName(root: Element, localName: string): Element | undefined {
  const lowerLocalName = localName.toLowerCase()
  return Array.from(root.querySelectorAll('*')).find(
    (node) => node.localName?.toLowerCase() === lowerLocalName,
  )
}

function findDescendantByLocalNameWithAttr(
  root: Element,
  localName: string,
  attrName: string,
): Element | undefined {
  const lowerLocalName = localName.toLowerCase()
  return Array.from(root.querySelectorAll('*')).find(
    (node) => node.localName?.toLowerCase() === lowerLocalName && Boolean(attr(node, attrName)),
  )
}

function namespacedText(root: Element, selector: string, localName: string): string | undefined {
  return text(root.querySelector(selector)) || text(findDescendantByLocalName(root, localName))
}

function namespacedAttr(
  root: Element,
  selector: string,
  attrName: string,
  localName: string,
): string | undefined {
  return (
    attr(root.querySelector(selector), attrName) ||
    attr(findDescendantByLocalNameWithAttr(root, localName, attrName), attrName)
  )
}

function safeGuid(item: Element, fallback: string): string {
  return (
    text(item.querySelector('guid')) ||
    attr(item.querySelector('enclosure'), 'url') ||
    fallback
  )
}

function parseNonNegativeInteger(value?: string): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 0) return undefined
  return parsed
}

function parseEpisodeType(value?: string): PodcastEpisode['episodeType'] | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'full' || normalized === 'trailer' || normalized === 'bonus') {
    return normalized
  }
  return undefined
}

function parseExplicit(value?: string): boolean | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'yes' || normalized === 'true' || normalized === 'explicit') return true
  if (normalized === 'no' || normalized === 'false' || normalized === 'clean') return false
  return undefined
}

function parseDurationSeconds(value?: string): number | undefined {
  if (!value) return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  if (trimmed.includes(':')) {
    const partStrings = trimmed.split(':').map((part) => part.trim())
    if (partStrings.some((part) => !/^\d+$/.test(part))) return undefined
    const parts = partStrings.map((part) => Number(part))
    const seconds = parts.reduce((acc, part) => acc * 60 + part, 0)
    return seconds > 0 ? seconds : undefined
  }

  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.trunc(parsed)
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
    text(channel.querySelector('image > url')) ||
    namespacedAttr(channel, 'itunes\\:image', 'href', 'image')
  const genres = collectFeedGenres(channel)

  const items = Array.from(channel.querySelectorAll('item'))
  const episodes = items
    .map((item, idx): PodcastEpisode | null => {
      const enclosure = item.querySelector('enclosure')
      const enclosureUrl = attr(enclosure, 'url')
      if (!enclosureUrl) return null

      const ep: PodcastEpisode = {
        guid: safeGuid(item, `${idx}-${enclosureUrl}`),
        title: text(item.querySelector('title')) ?? '(untitled episode)',
        enclosureUrl,
      }

      const enclosureType = attr(enclosure, 'type')
      if (enclosureType) ep.enclosureType = enclosureType
      const enclosureLengthBytes = parseNonNegativeInteger(attr(enclosure, 'length'))
      if (typeof enclosureLengthBytes !== 'undefined') ep.enclosureLengthBytes = enclosureLengthBytes

      const pubDate = text(item.querySelector('pubDate'))
      if (pubDate) {
        ep.pubDate = pubDate
        const dateStamp = formatDateStamp(pubDate)
        if (dateStamp) ep.dateStamp = dateStamp
      }

      const duration =
        namespacedText(item, 'itunes\\:duration', 'duration') ||
        namespacedAttr(item, 'media\\:content', 'duration', 'content')
      if (duration) ep.duration = duration
      const durationSeconds = parseDurationSeconds(duration)
      if (typeof durationSeconds !== 'undefined') ep.durationSeconds = durationSeconds

      const author =
        namespacedText(item, 'itunes\\:author', 'author') ||
        namespacedText(item, 'dc\\:creator', 'creator')
      if (author) ep.author = author
      const linkUrl = text(item.querySelector('link'))
      if (linkUrl) ep.linkUrl = linkUrl
      const imageUrl =
        namespacedAttr(item, 'itunes\\:image', 'href', 'image') ||
        namespacedAttr(item, 'media\\:thumbnail', 'url', 'thumbnail')
      if (imageUrl) ep.imageUrl = imageUrl

      const seasonNumber = parseNonNegativeInteger(namespacedText(item, 'itunes\\:season', 'season'))
      if (typeof seasonNumber !== 'undefined') ep.seasonNumber = seasonNumber
      const episodeNumber = parseNonNegativeInteger(namespacedText(item, 'itunes\\:episode', 'episode'))
      if (typeof episodeNumber !== 'undefined') ep.episodeNumber = episodeNumber
      const episodeType = parseEpisodeType(namespacedText(item, 'itunes\\:episodeType', 'episodetype'))
      if (episodeType) ep.episodeType = episodeType
      const explicit = parseExplicit(namespacedText(item, 'itunes\\:explicit', 'explicit'))
      if (typeof explicit !== 'undefined') ep.explicit = explicit

      const description =
        text(item.querySelector('description')) ||
        namespacedText(item, 'content\\:encoded', 'encoded')
      if (description) ep.description = description

      return ep
    })
    .filter((x): x is PodcastEpisode => x !== null)

  return {
    feed: { title, description, imageUrl, genres },
    episodes,
  }
}
