type AppHeaderProps = {
  processingStatus: string
  processingErrorText: string | null
  isProcessingStarting: boolean
  processingErrorInline: string | null
  isInferenceActive: boolean
  canInstall: boolean
  installing: boolean
  triggerInstall: () => Promise<void>
  topStatus: string
  denoiseEnabled: boolean
  hasEpisode: boolean
  modelSupported: boolean
  toggleDenoise: (next: boolean) => Promise<void>
}

export function AppHeader({
  processingStatus,
  processingErrorText,
  isProcessingStarting,
  processingErrorInline,
  isInferenceActive,
  canInstall,
  installing,
  triggerInstall,
  topStatus,
  denoiseEnabled,
  hasEpisode,
  modelSupported,
  toggleDenoise,
}: AppHeaderProps) {
  return (
    <>
      <header className="pcHeader">
        <div className="pcBrand">
          <div className="pcMark" aria-hidden="true">
            <span>P</span>
          </div>
          <div className="pcBrandText">
            <div className="pcBrandTitle">
              PoiseCast <span className="pcBrandVer">v0.1-BETA</span>
            </div>
          </div>
        </div>

        <div className="pcHeaderStatus">
          <div
            className={`pcStatusIndicator ${processingStatus}`}
            title={processingErrorText ?? undefined}
          >
            <span className="pcStatusDot"></span>
            <span className="pcStatusText">
              Processing:{' '}
              {isProcessingStarting ? (
                <>
                  <span>Initializing</span>
                  <span className="pcStatusBootGlyph" aria-hidden="true">
                    <span className="pcStatusBootGlyphInner" />
                  </span>
                </>
              ) : processingErrorInline ? (
                `Error · ${processingErrorInline}`
              ) : isInferenceActive ? (
                'Active'
              ) : (
                'Idle'
              )}
            </span>
          </div>
        </div>

        <div className="pcHeaderRight">
          <button
            className="pcAddSourceBtn"
            onClick={() => void triggerInstall()}
            disabled={!canInstall || installing}
          >
            {!canInstall ? 'Installed' : installing ? 'Installing…' : 'Install App'}
          </button>
          <div className="pcDspMode">
            <div className="pcDspLabel">Isolation Mode</div>
            <div className="pcDspValue">
              <span>Vocal Isolation</span>
              <span className="material-symbols-outlined">expand_more</span>
            </div>
          </div>
        </div>
      </header>

      <div className="pcMobileStatus">
        <div className="pcMobileStatusText">{topStatus}</div>
        <div className="pcMobileStatusActions">
          {canInstall ? (
            <button
              className="pcMobileInstall"
              onClick={() => void triggerInstall()}
              disabled={installing}
            >
              {installing ? 'INSTALLING…' : 'INSTALL'}
            </button>
          ) : null}
          <button
            className={`pcMobileDenoise ${denoiseEnabled ? 'on' : ''}`}
            disabled={!hasEpisode || !modelSupported || isProcessingStarting}
            onClick={() => void toggleDenoise(!denoiseEnabled)}
          >
            {denoiseEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </>
  )
}
