import { useEffect } from 'react'
import { coerceErrorMessage } from './errors'
import type { IssueSource } from './useIssueLog'

type ReportIssue = (source: IssueSource, summary: string, detail: unknown) => void

type UseAppDiagnosticsOptions = {
  rssError: string | null
  searchError: string | null
  engineState: string
  engineDetail: string
  reportIssue: ReportIssue
}

export function useAppDiagnostics({
  rssError,
  searchError,
  engineState,
  engineDetail,
  reportIssue,
}: UseAppDiagnosticsOptions): void {
  useEffect(() => {
    if (!rssError) return
    reportIssue('rss', 'Failed to load RSS feed', rssError)
  }, [reportIssue, rssError])

  useEffect(() => {
    if (!searchError) return
    reportIssue('search', 'Podcast search failed', searchError)
  }, [reportIssue, searchError])

  useEffect(() => {
    if (engineState !== 'error') return
    reportIssue('processing', 'Model/inference error', engineDetail || 'The denoise engine reported an unexpected error.')
  }, [engineDetail, engineState, reportIssue])

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      const message = event.message || coerceErrorMessage(event.error)
      reportIssue('runtime', 'Unhandled runtime error', message)
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportIssue('runtime', 'Unhandled async error', event.reason)
    }

    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [reportIssue])
}
