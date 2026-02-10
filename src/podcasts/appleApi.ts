const APPLE_BASE = 'https://itunes.apple.com'

function isProdBuild(): boolean {
  return import.meta.env.PROD
}

export function buildAppleLookupUrl(feedUrl: string): string {
  if (isProdBuild()) {
    return `/api/itunes?kind=lookup&feedUrl=${encodeURIComponent(feedUrl)}`
  }
  return `${APPLE_BASE}/lookup?entity=podcast&feedUrl=${encodeURIComponent(feedUrl)}`
}

export function buildAppleSearchUrl(term: string, limit: number): string {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)))
  if (isProdBuild()) {
    return `/api/itunes?kind=search&limit=${safeLimit}&term=${encodeURIComponent(term)}`
  }
  return (
    `${APPLE_BASE}/search?media=podcast&entity=podcast&limit=${safeLimit}&term=` +
    encodeURIComponent(term)
  )
}
