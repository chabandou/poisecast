export type PodcastFeedInfo = {
  title: string
  description?: string
  imageUrl?: string
}

export type PodcastEpisode = {
  guid: string
  title: string
  enclosureUrl: string
  pubDate?: string
  dateStamp?: string
  duration?: string
  description?: string
}

export type ParsedPodcast = {
  feed: PodcastFeedInfo
  episodes: PodcastEpisode[]
}
