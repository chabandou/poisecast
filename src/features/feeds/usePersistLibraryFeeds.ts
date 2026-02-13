import { useEffect } from 'react'
import type { DefaultFeed } from '../../podcasts/defaultFeeds'
import { ignoreError } from '../system/errors'

type UsePersistLibraryFeedsOptions = {
  libraryFeeds: DefaultFeed[]
  storageKey: string
  storage?: Pick<Storage, 'setItem'>
}

export function usePersistLibraryFeeds({
  libraryFeeds,
  storageKey,
  storage = localStorage,
}: UsePersistLibraryFeedsOptions): void {
  useEffect(() => {
    try {
      storage.setItem(storageKey, JSON.stringify(libraryFeeds))
    } catch {
      ignoreError()
    }
  }, [libraryFeeds, storage, storageKey])
}
