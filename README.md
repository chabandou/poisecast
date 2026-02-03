# Poisecast (PWA)

A Podcast player with client-side voice isolation using onnxruntime-web (WASM/WebGPU).

## Run

```bash
cd poisecast
bun install
bun dev
```

## Models

- ONNX models are served from `public/models/`.
- ONNX Runtime WASM binaries are served from `public/ort/`.

## Notes / Constraints

- Denoising uses WebAudio (`MediaElementAudioSourceNode`). For cross-origin podcast audio, the host must allow CORS or the audio graph will be muted.
- Workaround (no server): use **Import file** in the player to process a locally-downloaded episode.
- v1 supports the time-domain model (`denoiser_model.onnx`). The UMXHQ spectral models require an STFT pipeline (not implemented yet).

## Podcast Search

There is a basic podcast search UI powered by Apple iTunes Search API (no API key).
