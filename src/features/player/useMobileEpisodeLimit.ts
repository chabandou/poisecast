import { useCallback, useEffect, useState } from 'react'

type UseMobileEpisodeLimitOptions = {
  episodeReverse: boolean
  rssUrl: string
  deferredEpisodeQuery: string
  episodesCount: number
  initialLimit?: number
  step?: number
}

type UseMobileEpisodeLimitResult = {
  mobileEpisodeLimit: number
  loadMoreMobileEpisodes: () => void
}

export function useMobileEpisodeLimit({
  episodeReverse,
  rssUrl,
  deferredEpisodeQuery,
  episodesCount,
  initialLimit = 3,
  step = 6,
}: UseMobileEpisodeLimitOptions): UseMobileEpisodeLimitResult {
  const [mobileEpisodeLimit, setMobileEpisodeLimit] = useState(initialLimit)

  useEffect(() => {
    // Reset visible mobile rows when source/filter/sort changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileEpisodeLimit(initialLimit)
  }, [deferredEpisodeQuery, episodeReverse, initialLimit, rssUrl])

  const loadMoreMobileEpisodes = useCallback(() => {
    setMobileEpisodeLimit((prev) => Math.min(episodesCount, prev + step))
  }, [episodesCount, step])

  return {
    mobileEpisodeLimit,
    loadMoreMobileEpisodes,
  }
}
