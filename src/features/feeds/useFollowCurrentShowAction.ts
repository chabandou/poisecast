import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import { normalizeFeedUrlKey } from './feedUtils'

type UseFollowCurrentShowActionOptions = {
  rssUrl: string
  isCurrentShowFollowed: boolean
  activeSourceTitle?: string
  activeSourceCategory?: string
  podcastFeedTitle?: string
  podcastFeedGenres?: string[]
  showHost: string
  commitFollowState: (next: boolean) => void
  setLibraryFeeds: Dispatch<SetStateAction<DefaultFeed[]>>
}

export function useFollowCurrentShowAction({
  rssUrl,
  isCurrentShowFollowed,
  activeSourceTitle,
  activeSourceCategory,
  podcastFeedTitle,
  podcastFeedGenres,
  showHost,
  commitFollowState,
  setLibraryFeeds,
}: UseFollowCurrentShowActionOptions): () => void {
  return useCallback(() => {
    if (!rssUrl) return

    const targetFeedKey = normalizeFeedUrlKey(rssUrl)
    const shouldUnfollow = isCurrentShowFollowed
    const derivedTitle = podcastFeedTitle?.trim() || activeSourceTitle?.trim() || showHost
    const genreFromFeed = (podcastFeedGenres ?? []).find(
      (genre) => typeof genre === 'string' && genre.trim().length > 0,
    )
    const category = genreFromFeed?.trim() || activeSourceCategory?.trim() || undefined

    setLibraryFeeds((prev) => {
      const existingIndex = prev.findIndex((feed) => normalizeFeedUrlKey(feed.rssUrl) === targetFeedKey)
      if (shouldUnfollow) {
        if (existingIndex < 0) return prev
        return prev.filter((_, index) => index !== existingIndex)
      }

      if (existingIndex >= 0) {
        const existing = prev[existingIndex]
        const nextTitle = derivedTitle || existing.title
        const nextCategory = category || existing.category
        if (
          existing.title === nextTitle
          && (existing.category ?? undefined) === (nextCategory ?? undefined)
        ) {
          return prev
        }

        const next = [...prev]
        next[existingIndex] = {
          ...existing,
          title: nextTitle,
          ...(nextCategory ? { category: nextCategory } : {}),
        }
        return next
      }

      return [
        {
          title: derivedTitle || rssUrl,
          rssUrl,
          ...(category ? { category } : {}),
        },
        ...prev,
      ]
    })

    commitFollowState(!shouldUnfollow)
  }, [
    activeSourceCategory,
    activeSourceTitle,
    commitFollowState,
    isCurrentShowFollowed,
    podcastFeedGenres,
    podcastFeedTitle,
    rssUrl,
    setLibraryFeeds,
    showHost,
  ])
}
