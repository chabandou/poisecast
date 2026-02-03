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

export async function fetchAndParseRss(rssUrl: string): Promise<ParsedPodcast> {
  const res = await fetch(rssUrl, { mode: 'cors' })
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
    feed: { title, description, imageUrl },
    episodes,
  }
}
