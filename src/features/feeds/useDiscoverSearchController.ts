import { useCallback, useEffect, useRef, useState } from 'react'
import { searchApplePodcasts, type ApplePodcastResult } from '../../podcasts/appleSearch'
import { ignoreError } from '../system/errors'

type UseDiscoverSearchControllerOptions = {
  storageKey?: string
  maxSearchCache?: number
  resultLimit?: number
  debounceMs?: number
}

type UseDiscoverSearchControllerResult = {
  searchTerm: string
  setSearchTerm: (next: string) => void
  searchLoading: boolean
  searchError: string | null
  searchResults: ApplePodcastResult[]
  initializeSearchCache: () => void
}

export function useDiscoverSearchController({
  storageKey = 'poisecast.searchCache.v1',
  maxSearchCache = 50,
  resultLimit = 10,
  debounceMs = 400,
}: UseDiscoverSearchControllerOptions = {}): UseDiscoverSearchControllerResult {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<ApplePodcastResult[]>([])
  const searchCacheRef = useRef<Map<string, ApplePodcastResult[]>>(new Map())

  const initializeSearchCache = useCallback(() => {
    try {
      const searchRaw = localStorage.getItem(storageKey)
      if (!searchRaw) return
      const parsed = JSON.parse(searchRaw) as { entries: [string, ApplePodcastResult[]][] }
      if (!Array.isArray(parsed?.entries)) return
      searchCacheRef.current = new Map(parsed.entries.slice(0, maxSearchCache))
    } catch {
      ignoreError()
    }
  }, [maxSearchCache, storageKey])

  useEffect(() => {
    const query = searchTerm.trim()
    setSearchError(null)

    if (!query) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    const cacheKey = `${query.toLowerCase()}|${resultLimit}`
    const cached = searchCacheRef.current.get(cacheKey)
    if (cached) {
      setSearchResults(cached)
      setSearchLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setSearchLoading(true)
          const results = await searchApplePodcasts(query, resultLimit, controller.signal)
          searchCacheRef.current.set(cacheKey, results)
          if (searchCacheRef.current.size > maxSearchCache) {
            const firstKey = searchCacheRef.current.keys().next().value as string | undefined
            if (firstKey) searchCacheRef.current.delete(firstKey)
          }

          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify({
                entries: Array.from(searchCacheRef.current.entries()),
              }),
            )
          } catch {
            ignoreError()
          }

          setSearchResults(results)
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setSearchResults([])
          setSearchError(error instanceof Error ? error.message : String(error))
        } finally {
          setSearchLoading(false)
        }
      })()
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [debounceMs, maxSearchCache, resultLimit, searchTerm, storageKey])

  return {
    searchTerm,
    setSearchTerm,
    searchLoading,
    searchError,
    searchResults,
    initializeSearchCache,
  }
}

