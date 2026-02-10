# Poisecast (PWA)

A Podcast player with client-side voice isolation using onnxruntime-web (WASM/WebGPU).

## Run

```bash
cd poisecast
bun install
bun dev
```

For PWA install/offline checks, use a production preview:

```bash
bun run build
bun run preview
```

Firefox install paths:

- Windows: use the Web Apps button in the address bar.
- Android: open browser menu and choose **Install** / **Add to Home screen**.

## Models

- ONNX model loading is GitHub-only by default: `https://raw.githubusercontent.com/chabandou/poisecast/master/models/`.
- Override the GitHub base with `VITE_GITHUB_MODELS_BASE_URL` (for example, to pin a tag/commit or use another CDN).
- ONNX Runtime WASM binaries are served from `public/ort/`.
- PWA install precaches core ORT runtime files. Models are downloaded on demand and cached when first used.

## Notes / Constraints

- Remote episode playback is routed through `/api/stream` (same-origin proxy) in production so denoising can attach without host CORS support.
- In `bun dev`, `/api/stream` is available through local Vite middleware.
- In local static preview (`bun run preview`), `/api/stream` is not available and playback falls back to direct episode URLs.
- Workaround (no server): use **Import file** in the player to process a locally-downloaded episode.
- v1 supports the time-domain model (`denoiser_model.onnx`). The UMXHQ spectral models require an STFT pipeline (not implemented yet).
