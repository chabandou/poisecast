export type ApplePodcastResult = {
  collectionId: number
  collectionName: string
  artistName?: string
  feedUrl?: string
  collectionViewUrl?: string
  primaryGenreName?: string
}

type AppleSearchResponse = {
  resultCount: number
  results: ApplePodcastResult[]
}

export async function searchApplePodcasts(
  term: string,
  limit = 12,
  signal?: AbortSignal,
): Promise<ApplePodcastResult[]> {
  const q = term.trim()
  if (!q) return []

  const url =
    `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=${limit}&term=` +
    encodeURIComponent(q)

  const res = await fetch(url, { mode: 'cors', signal })
  if (!res.ok) throw new Error(`Apple search failed: ${res.status} ${res.statusText}`)

  const json = (await res.json()) as AppleSearchResponse
  const results = Array.isArray(json.results) ? json.results : []

  // Keep only the fields we actually use.
  return results
    .filter((r) => typeof r?.collectionId === 'number' && typeof r?.collectionName === 'string')
    .map((r) => ({
      collectionId: r.collectionId,
      collectionName: r.collectionName,
      artistName: r.artistName,
      feedUrl: r.feedUrl,
      collectionViewUrl: r.collectionViewUrl,
      primaryGenreName: r.primaryGenreName,
    }))
}
