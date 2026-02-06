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

- ONNX models are served from `public/models/`.
- ONNX Runtime WASM binaries are served from `public/ort/`.
- PWA install precaches the default model. Other models are cached on demand when selected/used.

## Notes / Constraints

- Remote episode playback is routed through `/api/stream` (same-origin proxy) in production so denoising can attach without host CORS support.
- In `bun dev`, `/api/stream` is available through local Vite middleware.
- In local static preview (`bun run preview`), `/api/stream` is not available and playback falls back to direct episode URLs.
- Workaround (no server): use **Import file** in the player to process a locally-downloaded episode.
- v1 supports the time-domain model (`denoiser_model.onnx`). The UMXHQ spectral models require an STFT pipeline (not implemented yet).

## Stream Proxy Hardening

- `STREAM_PROXY_ALLOWLIST`: optional comma-separated host patterns allowed by the proxy. Example: `cdn.example.com,*.podtrac.com`
- `STREAM_PROXY_BLOCKLIST`: optional comma-separated host patterns blocked by the proxy.
- `STREAM_PROXY_RATE_MAX_REQUESTS`: max requests per IP per window (default `120`)
- `STREAM_PROXY_RATE_WINDOW_MS`: window length in ms (default `60000`)
- `STREAM_PROXY_RATE_MAX_INFLIGHT`: max concurrent in-flight proxy requests per IP (default `8`)
- `STREAM_PROXY_RATE_BLOCK_MS`: temporary block duration in ms after rate overrun (default `120000`)
- `STREAM_PROXY_RATE_MAX_ENTRIES`: in-memory limiter table size cap (default `5000`)

## Podcast Search

There is a basic podcast search UI powered by Apple iTunes Search API (no API key).
