export type ModelKind = 'time' | 'spectral'

export type ModelSpec = {
  id: string
  label: string
  url: string
  kind: ModelKind
  sampleRateHz: number
  supported: boolean
}

export const MODELS: ModelSpec[] = [
  {
    id: 'denoiser_model',
    label: 'Time Denoiser (48 kHz)',
    url: '/models/denoiser_model.onnx',
    kind: 'time',
    sampleRateHz: 48_000,
    supported: true,
  },
  {
    id: 'dnr-umxhq-se-70ms-int8-dynamic',
    label: 'UMXHQ Spectral (44.1 kHz, 70ms) (coming soon)',
    url: '/models/dnr-umxhq-se-70ms-int8-dynamic.onnx',
    kind: 'spectral',
    sampleRateHz: 44_100,
    supported: false,
  },
  {
    id: 'dnr-umxhq-se-100ms-int8-dynamic',
    label: 'UMXHQ Spectral (44.1 kHz, 100ms) (coming soon)',
    url: '/models/dnr-umxhq-se-100ms-int8-dynamic.onnx',
    kind: 'spectral',
    sampleRateHz: 44_100,
    supported: false,
  },
  {
    id: 'dnr-umxhq-se-116ms-int8-dynamic',
    label: 'UMXHQ Spectral (44.1 kHz, 116ms) (coming soon)',
    url: '/models/dnr-umxhq-se-116ms-int8-dynamic.onnx',
    kind: 'spectral',
    sampleRateHz: 44_100,
    supported: false,
  },
]

