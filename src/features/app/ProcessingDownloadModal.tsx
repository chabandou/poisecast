import type { AssetDownloadUiState } from '../audio/useProcessingController'

type ProcessingDownloadModalProps = {
  downloadModalKind: 'ort' | 'model' | null
  resolvedDownloadUi: AssetDownloadUiState | null
  activeDownloadTitle: string
  activeDownloadAttemptLabel: string
  activeDownloadAssetLabel: string
  activeDownloadPercent: number | null
  activeDownloadPhaseLabel: string
  activeDownloadBytes: string
}

export function ProcessingDownloadModal({
  downloadModalKind,
  resolvedDownloadUi,
  activeDownloadTitle,
  activeDownloadAttemptLabel,
  activeDownloadAssetLabel,
  activeDownloadPercent,
  activeDownloadPhaseLabel,
  activeDownloadBytes,
}: ProcessingDownloadModalProps) {
  if (!downloadModalKind || !resolvedDownloadUi) return null

  return (
    <div
      className="pcModelDlOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pcModelDlTitle"
    >
      <div className="pcModelDlBackdrop" aria-hidden="true" />
      <section className="pcModelDlCard pcChamfer">
        <header className="pcModelDlHead">
          <div>
            <div className="pcModelDlKicker">Processing Bootstrap (One time download)</div>
            <h2 className="pcModelDlTitle" id="pcModelDlTitle">
              {activeDownloadTitle}
            </h2>
          </div>
          <span className="pcModelDlAttempt">
            {activeDownloadAttemptLabel} {resolvedDownloadUi.attempt}/{resolvedDownloadUi.totalAttempts}
          </span>
        </header>
        <div className="pcModelDlMetaGrid">
          <div className="pcModelDlLabel">{activeDownloadAssetLabel}</div>
          <div className="pcModelDlValue">{resolvedDownloadUi.assetLabel}</div>
          <div className="pcModelDlLabel">Source</div>
          <div className="pcModelDlValue">{resolvedDownloadUi.sourceLabel}</div>
        </div>
        <div className="pcModelDlUrl">{resolvedDownloadUi.sourceUrl}</div>
        <div className="pcModelDlProgressWrap">
          <div
            className={`pcModelDlProgress ${activeDownloadPercent === null ? 'isIndeterminate' : ''}`}
          >
            <span
              style={
                activeDownloadPercent === null ? undefined : { width: `${activeDownloadPercent}%` }
              }
              aria-hidden="true"
            />
          </div>
          <div className="pcModelDlProgressMeta">
            <span className="pcModelDlPhase">
              <span className="pcModelDlBraille" aria-hidden="true">
                <span className="pcModelDlBrailleGlyph" />
              </span>
              <span>{activeDownloadPhaseLabel}</span>
            </span>
            <span>{activeDownloadBytes}</span>
          </div>
        </div>
        {resolvedDownloadUi.phase === 'retrying' ? (
          <div className="pcModelDlRetryMsg" aria-live="polite">
            Previous source failed: {resolvedDownloadUi.errorDetail ?? 'Unknown error'}
          </div>
        ) : null}
      </section>
    </div>
  )
}
