export type RgbColor = {
  r: number
  g: number
  b: number
}

export type ArtworkThemeTokens = {
  primary: string
  accent: string
  primaryDim: string
  glow: string
  glowSm: string
}

type DominantColorOptions = {
  minAlpha?: number
}

type ImageColorOptions = DominantColorOptions & {
  sampleSize?: number
  signal?: AbortSignal
}

type HslColor = {
  h: number
  s: number
  l: number
}

type HistogramBucket = {
  weight: number
  weightedR: number
  weightedG: number
  weightedB: number
}

const DEFAULT_SAMPLE_SIZE = 48
const DEFAULT_MIN_ALPHA = 96
const CHROMA_MIN_SATURATION = 0.12
const GRAYSCALE_REJECT_SATURATION = 0.08
const NEAR_BLACK_THRESHOLD = 22
const NEAR_WHITE_THRESHOLD = 236

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toHexPair(value: number): string {
  const normalized = clamp(Math.round(value), 0, 255)
  return normalized.toString(16).padStart(2, '0')
}

function rgbToHex(color: RgbColor): string {
  return `#${toHexPair(color.r)}${toHexPair(color.g)}${toHexPair(color.b)}`
}

function toRgba(color: RgbColor, alpha: number): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${clamp(alpha, 0, 1)})`
}

function rgbToHsl(color: RgbColor): HslColor {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  const l = (max + min) / 2

  if (delta === 0) {
    return { h, s: 0, l }
  }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)

  switch (max) {
    case r:
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
      break
    case g:
      h = ((b - r) / delta + 2) / 6
      break
    default:
      h = ((r - g) / delta + 4) / 6
      break
  }

  return { h, s, l }
}

function hueToRgb(p: number, q: number, t: number): number {
  let normalized = t
  if (normalized < 0) normalized += 1
  if (normalized > 1) normalized -= 1
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized
  if (normalized < 1 / 2) return q
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6
  return p
}

function hslToRgb(color: HslColor): RgbColor {
  const { h, s, l } = color
  if (s === 0) {
    const gray = Math.round(l * 255)
    return { r: gray, g: gray, b: gray }
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  }
}

function isNearBlack({ r, g, b }: RgbColor): boolean {
  return Math.max(r, g, b) < NEAR_BLACK_THRESHOLD
}

function isNearWhite({ r, g, b }: RgbColor): boolean {
  return Math.min(r, g, b) > NEAR_WHITE_THRESHOLD
}

function accumulatePixel(
  buckets: Map<number, HistogramBucket>,
  color: RgbColor,
  saturation: number,
  lightness: number,
): void {
  const bucketKey = ((color.r >> 4) << 8) | ((color.g >> 4) << 4) | (color.b >> 4)
  const intensityBoost = 0.85 + saturation * 0.75 + (1 - Math.abs(lightness - 0.52)) * 0.2
  const weight = clamp(intensityBoost, 0.1, 2)

  const existing = buckets.get(bucketKey)
  if (!existing) {
    buckets.set(bucketKey, {
      weight,
      weightedR: color.r * weight,
      weightedG: color.g * weight,
      weightedB: color.b * weight,
    })
    return
  }

  existing.weight += weight
  existing.weightedR += color.r * weight
  existing.weightedG += color.g * weight
  existing.weightedB += color.b * weight
}

function resolveDominantBucketColor(
  pixels: Uint8ClampedArray,
  options: DominantColorOptions & { requireChromatic: boolean },
): RgbColor | null {
  const buckets = new Map<number, HistogramBucket>()
  const minAlpha = options.minAlpha ?? DEFAULT_MIN_ALPHA

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0
    if (alpha < minAlpha) continue

    const color = {
      r: pixels[index] ?? 0,
      g: pixels[index + 1] ?? 0,
      b: pixels[index + 2] ?? 0,
    }

    if (isNearBlack(color) || isNearWhite(color)) continue

    const { s, l } = rgbToHsl(color)
    if (options.requireChromatic && s < CHROMA_MIN_SATURATION) continue

    accumulatePixel(buckets, color, s, l)
  }

  let best: HistogramBucket | null = null
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) {
      best = bucket
    }
  }

  if (!best || best.weight <= 0) return null

  return {
    r: best.weightedR / best.weight,
    g: best.weightedG / best.weight,
    b: best.weightedB / best.weight,
  }
}

export function extractDominantColorFromPixels(
  pixels: Uint8ClampedArray,
  options: DominantColorOptions = {},
): RgbColor | null {
  const chromaticResult = resolveDominantBucketColor(pixels, {
    ...options,
    requireChromatic: true,
  })
  if (chromaticResult) return chromaticResult

  return resolveDominantBucketColor(pixels, {
    ...options,
    requireChromatic: false,
  })
}

export function toPastelNeonColor(color: RgbColor): RgbColor {
  const source = rgbToHsl(color)
  const targetSaturation = clamp(Math.max(source.s * 1.15, 0.58), 0.58, 0.84)
  const targetLightness = clamp(0.68 + (source.l - 0.5) * 0.24, 0.62, 0.8)

  return hslToRgb({
    h: source.h,
    s: targetSaturation,
    l: targetLightness,
  })
}

export function createArtworkThemeTokens(color: RgbColor): ArtworkThemeTokens {
  const pastelPrimary = toPastelNeonColor(color)
  const primaryHsl = rgbToHsl(pastelPrimary)
  const accent = hslToRgb({
    h: primaryHsl.h,
    s: clamp(primaryHsl.s + 0.07, 0.6, 0.9),
    l: clamp(primaryHsl.l - 0.09, 0.5, 0.74),
  })

  return {
    primary: rgbToHex(pastelPrimary),
    accent: rgbToHex(accent),
    primaryDim: toRgba(pastelPrimary, 0.12),
    glow: toRgba(pastelPrimary, 0.45),
    glowSm: toRgba(pastelPrimary, 0.34),
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw new DOMException('Aborted', 'AbortError')
}

function loadImageElement(imageUrl: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal)

    const image = new Image()
    image.decoding = 'async'
    image.crossOrigin = 'anonymous'
    image.referrerPolicy = 'no-referrer'

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      cleanup()
      image.src = ''
      reject(new DOMException('Aborted', 'AbortError'))
    }

    image.onload = () => {
      cleanup()
      resolve(image)
    }

    image.onerror = () => {
      cleanup()
      reject(new Error(`Failed to load image: ${imageUrl}`))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    image.src = imageUrl
  })
}

function readImagePixels(image: HTMLImageElement, sampleSize: number): Uint8ClampedArray | null {
  const canvas = document.createElement('canvas')
  canvas.width = sampleSize
  canvas.height = sampleSize

  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  })
  if (!context) return null

  context.clearRect(0, 0, sampleSize, sampleSize)
  context.drawImage(image, 0, 0, sampleSize, sampleSize)

  try {
    return context.getImageData(0, 0, sampleSize, sampleSize).data
  } catch {
    return null
  }
}

async function extractDominantColorFromImageUrl(
  imageUrl: string,
  options: ImageColorOptions = {},
): Promise<RgbColor | null> {
  const sampleSize = clamp(options.sampleSize ?? DEFAULT_SAMPLE_SIZE, 16, 96)
  const image = await loadImageElement(imageUrl, options.signal)
  throwIfAborted(options.signal)

  const pixels = readImagePixels(image, sampleSize)
  if (!pixels) return null

  return extractDominantColorFromPixels(pixels, {
    minAlpha: options.minAlpha,
  })
}

function isProxyEligible(imageUrl: string): boolean {
  if (!imageUrl) return false
  if (imageUrl.startsWith('data:')) return false
  if (imageUrl.startsWith('blob:')) return false
  if (imageUrl.startsWith('/api/stream?url=')) return false
  return true
}

export function buildArtworkProxyUrl(imageUrl: string): string {
  return `/api/stream?url=${encodeURIComponent(imageUrl)}`
}

export async function deriveArtworkThemeFromImageUrl(
  imageUrl: string,
  options: ImageColorOptions = {},
): Promise<ArtworkThemeTokens | null> {
  const candidates = isProxyEligible(imageUrl)
    ? [imageUrl, buildArtworkProxyUrl(imageUrl)]
    : [imageUrl]

  for (const candidate of candidates) {
    throwIfAborted(options.signal)

    try {
      const dominant = await extractDominantColorFromImageUrl(candidate, options)
      if (!dominant) continue

      const { s } = rgbToHsl(dominant)
      if (s < GRAYSCALE_REJECT_SATURATION) continue

      return createArtworkThemeTokens(dominant)
    } catch (error) {
      if (isAbortError(error)) throw error
    }
  }

  return null
}
