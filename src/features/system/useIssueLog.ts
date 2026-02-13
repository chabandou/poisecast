import { useCallback, useState } from 'react'
import { coerceErrorMessage, normalizeIssueCardDetail } from './errors'

export type IssueSource = 'rss' | 'search' | 'audio' | 'download' | 'processing' | 'runtime' | 'system'

export type IssueEntry = {
  id: string
  source: IssueSource
  summary: string
  detail: string
  createdAt: number
}

export function formatIssueSource(source: IssueSource): string {
  switch (source) {
    case 'rss':
      return 'RSS'
    case 'search':
      return 'Search'
    case 'audio':
      return 'Audio'
    case 'download':
      return 'Download'
    case 'processing':
      return 'Processing'
    case 'runtime':
      return 'Runtime'
    default:
      return 'System'
  }
}

type UseIssueLogOptions = {
  limit?: number
}

export function useIssueLog({ limit = 8 }: UseIssueLogOptions = {}) {
  const [issues, setIssues] = useState<IssueEntry[]>([])

  const reportIssue = useCallback((source: IssueSource, summary: string, detail: unknown) => {
    const normalizedSummary = summary.trim() || 'System error'
    const normalizedDetail = normalizeIssueCardDetail(coerceErrorMessage(detail))

    setIssues((prev) => {
      const latest = prev[0]
      if (
        latest &&
        latest.source === source &&
        latest.summary === normalizedSummary &&
        latest.detail === normalizedDetail
      ) {
        return prev
      }

      const issue: IssueEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        source,
        summary: normalizedSummary,
        detail: normalizedDetail,
        createdAt: Date.now(),
      }
      return [issue, ...prev].slice(0, limit)
    })
  }, [limit])

  const clearIssues = useCallback(() => {
    setIssues([])
  }, [])

  return {
    issues,
    reportIssue,
    clearIssues,
  }
}

