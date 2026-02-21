export type PodcastFeedInfo = {
  title: string
  description?: string
  imageUrl?: string
  genres?: string[]
}

export type PodcastEpisode = {
  guid: string
  title: string
  enclosureUrl: string
  enclosureType?: string
  enclosureLengthBytes?: number
  pubDate?: string
  dateStamp?: string
  duration?: string
  durationSeconds?: number
  author?: string
  linkUrl?: string
  imageUrl?: string
  seasonNumber?: number
  episodeNumber?: number
  episodeType?: 'full' | 'trailer' | 'bonus'
  explicit?: boolean
  description?: string
}

export type ParsedPodcast = {
  feed: PodcastFeedInfo
  episodes: PodcastEpisode[]
}
