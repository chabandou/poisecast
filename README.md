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

- Denoising uses WebAudio (`MediaElementAudioSourceNode`). For cross-origin podcast audio, the host must allow CORS or the audio graph will be muted.
- Workaround (no server): use **Import file** in the player to process a locally-downloaded episode.
- v1 supports the time-domain model (`denoiser_model.onnx`). The UMXHQ spectral models require an STFT pipeline (not implemented yet).

## Podcast Search

There is a basic podcast search UI powered by Apple iTunes Search API (no API key).
