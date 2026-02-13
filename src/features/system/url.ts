export function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.href).toString()
  } catch {
    return url
  }
}

export function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  return trimmed.replace(/\/+$/, '')
}

export function isSameOriginUrl(value: string): boolean {
  try {
    return new URL(value, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

export function describeModelSource(url: string): string {
  try {
    const parsed = new URL(url, window.location.href)
    if (parsed.hostname === 'raw.githubusercontent.com') return 'GitHub Raw'
    if (parsed.origin === window.location.origin) return 'Local /models'
    return parsed.hostname
  } catch {
    return 'Unknown source'
  }
}
