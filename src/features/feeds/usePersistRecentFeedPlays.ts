import { useEffect } from 'react'
import { ignoreError } from '../system/errors'
import type { RecentFeedPlay } from './recentFeedPlays'

type UsePersistRecentFeedPlaysOptions = {
  recentFeedPlays: RecentFeedPlay[]
  storageKey: string
  storage?: Pick<Storage, 'setItem'>
}

export function usePersistRecentFeedPlays({
  recentFeedPlays,
  storageKey,
  storage = localStorage,
}: UsePersistRecentFeedPlaysOptions): void {
  useEffect(() => {
    try {
      storage.setItem(storageKey, JSON.stringify(recentFeedPlays))
    } catch {
      ignoreError()
    }
  }, [recentFeedPlays, storage, storageKey])
}
