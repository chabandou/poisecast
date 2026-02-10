export type ModelKind = 'time' | 'spectral'

export type ModelSpec = {
  id: string
  label: string
  url: string
  kind: ModelKind
  sampleRateHz: number
  supported: boolean
}

const DEFAULT_GITHUB_MODELS_BASE_URL = 'https://raw.githubusercontent.com/chabandou/poisecast/master/models'

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

function getModelFileName(modelUrl: string): string | null {
  const clean = modelUrl.split('#', 1)[0]?.split('?', 1)[0] ?? modelUrl
  const segments = clean.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? null
}

const githubModelsBaseUrl =
  normalizeBaseUrl(import.meta.env.VITE_GITHUB_MODELS_BASE_URL) ?? DEFAULT_GITHUB_MODELS_BASE_URL

export function getModelCandidateUrls(model: ModelSpec): string[] {
  const fileName = getModelFileName(model.url)
  if (!fileName) return []
  return [`${githubModelsBaseUrl}/${fileName}`]
}

export const MODELS: ModelSpec[] = [
  {
    id: 'denoiser_model',
    label: 'Vocals (48 kHz)',
    url: '/models/denoiser_model.onnx',
    kind: 'time',
    sampleRateHz: 48_000,
    supported: true,
  },
  {
    id: 'dnr-umxhq-se-116ms-int8-dynamic',
    label: 'Vocals & Effects (44.1 kHz, UMX) (coming soon)',
    url: '/models/dnr-umxhq-se-116ms-int8-dynamic.onnx',
    kind: 'spectral',
    sampleRateHz: 44_100,
    supported: false,
  },
  {
    id: 'dnr-3s-vox7-l1snr-int8',
    label: 'Vocals & Effects (44.1 kHz, vox7) (coming soon)',
    url: '/models/dnr-3s-vox7-l1snr-int8.onnx',
    kind: 'spectral',
    sampleRateHz: 44_100,
    supported: false,
  }
]
