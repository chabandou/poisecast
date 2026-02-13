export function coerceErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value instanceof DOMException) return value.message
  if (value === null || value === undefined) return 'Unknown error'
  return String(value)
}

export function normalizeIssueDetail(raw: string, maxLen = 260): string {
  const compact = raw.replace(/\r\n/g, '\n').trim()
  const firstLine =
    compact
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? 'Unknown error'
  return firstLine.length > maxLen ? `${firstLine.slice(0, maxLen - 1)}…` : firstLine
}

export function normalizeIssueCardDetail(raw: string): string {
  const compact = raw.replace(/\r\n/g, '\n').trim()
  return compact || 'Unknown error'
}

export function ignoreError(): void {
  // Deliberate no-op for best-effort operations.
}
