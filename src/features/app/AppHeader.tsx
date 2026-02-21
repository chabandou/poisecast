import { useId } from "react";

type AppHeaderProps = {
  processingStatus: string;
  processingErrorText: string | null;
  isProcessingStarting: boolean;
  processingErrorInline: string | null;
  isInferenceActive: boolean;
  canInstall: boolean;
  installing: boolean;
  triggerInstall: () => Promise<void>;
  topStatus: string;
  denoiseEnabled: boolean;
  hasEpisode: boolean;
  modelSupported: boolean;
  toggleDenoise: (next: boolean) => Promise<void>;
};

function AppWaveIcon() {
  const gradientId = useId().replace(/:/g, "");

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient
          id={gradientId}
          x1="12"
          y1="3"
          x2="12"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop className="pcWaveStopPrimary" offset="0" />
          <stop className="pcWaveStopPrimary" offset="0.4" />
          <stop className="pcWaveStopAccent" offset="1" />
        </linearGradient>
      </defs>
      <path
        d="M3 12C3.00015 8.14286 4.28571 3 6.85714 3C10.7143 2.9999 13.2857 21 17.1429 21C19.7143 21 21 15.8571 21 12M3 12H5M19 12H21M15.5 12H16.5M7.5 12H8.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
            <AppWaveIcon />
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
              Processing:{" "}
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
                "Active"
              ) : (
                "Idle"
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
            {!canInstall
              ? "Installed"
              : installing
                ? "Installing…"
                : "Install App"}
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
        <div className="pcMobileStatusBrand">
          <div className="pcMarkSm" aria-hidden="true">
            <AppWaveIcon />
          </div>
          <div className="pcMobileStatusText">{topStatus}</div>
        </div>
        <div className="pcMobileStatusActions">
          {canInstall ? (
            <button
              className="pcMobileStatusBtn pcMobileInstall"
              onClick={() => void triggerInstall()}
              disabled={installing}
            >
              <span className="material-symbols-outlined">
                {installing ? "hourglass_empty" : "download"}
              </span>
              <span className="pcMobileStatusBtnLabel">
                {installing ? "INSTALLING" : "INSTALL"}
              </span>
            </button>
          ) : null}
          <button
            className={`pcMobileStatusBtn pcMobileDenoise ${denoiseEnabled ? "active" : ""}`}
            disabled={!hasEpisode || !modelSupported || isProcessingStarting}
            onClick={() => void toggleDenoise(!denoiseEnabled)}
          >
            <span className="material-symbols-outlined">
              {denoiseEnabled ? "graphic_eq" : "equalizer"}
            </span>
            <span className="pcMobileStatusBtnLabel">
              {denoiseEnabled ? "ON" : "OFF"}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
