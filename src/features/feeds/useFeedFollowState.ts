import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import { normalizeFeedUrlKey } from './feedUtils'

type UseFeedFollowStateOptions = {
  libraryFeeds: DefaultFeed[]
  rssUrl: string
}

export function useFeedFollowState({
  libraryFeeds,
  rssUrl,
}: UseFeedFollowStateOptions) {
  const [followedOverride, setFollowedOverride] = useState<boolean | null>(null)
  const [isFollowCheckPending, setIsFollowCheckPending] = useState(false)
  const computedFollowed = useMemo(() => {
    if (!rssUrl) return false
    return libraryFeeds.some(
      (feed) => normalizeFeedUrlKey(feed.rssUrl) === normalizeFeedUrlKey(rssUrl),
    )
  }, [libraryFeeds, rssUrl])
  const isCurrentShowFollowed = followedOverride ?? computedFollowed

  useEffect(() => {
    if (!isFollowCheckPending) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      setFollowedOverride(null)
      setIsFollowCheckPending(false)
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [isFollowCheckPending])

  const markSelectionFromSearch = useCallback(() => {
    setFollowedOverride(false)
    setIsFollowCheckPending(true)
  }, [])

  const markSelectionFromSource = useCallback(() => {
    setFollowedOverride(true)
    setIsFollowCheckPending(false)
  }, [])

  const commitFollowState = useCallback((nextFollowed: boolean) => {
    setFollowedOverride(nextFollowed)
    setIsFollowCheckPending(false)
  }, [])

  return {
    isCurrentShowFollowed,
    markSelectionFromSearch,
    markSelectionFromSource,
    commitFollowState,
  }
}
