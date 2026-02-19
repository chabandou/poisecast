import { useEffect, useMemo, useState, type RefObject } from 'react'

type UseEpisodeWaveformOptions = {
  audioRef: RefObject<HTMLAudioElement | null>
  episodeGuid: string | null
  barCount?: number
}

type ResolveWaveformOptions = {
  signal: AbortSignal
  barCount: number
}

const WAVEFORM_CACHE_LIMIT = 48
const WAVEFORM_FETCH_MAX_BYTES = 64 * 1024 * 1024
const waveformCache = new Map<string, string[]>()

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function buildFallbackWaveform(seed: string, barCount: number): string[] {
  const hashed = hashSeed(seed)
  return Array.from({ length: barCount }, (_, index) => {
    const n = noise(hashed + index * 37.17)
    const envelope = 0.38 + 0.62 * Math.sin((index / Math.max(1, barCount - 1)) * Math.PI)
    const heightPct = 18 + n * envelope * 74
    return `${heightPct.toFixed(1)}%`
  })
}

function capCacheSize(): void {
  while (waveformCache.size > WAVEFORM_CACHE_LIMIT) {
    const oldestKey = waveformCache.keys().next().value as string | undefined
    if (!oldestKey) break
    waveformCache.delete(oldestKey)
  }
}

function cacheWaveform(cacheKey: string, heights: string[]): void {
  waveformCache.set(cacheKey, heights)
  capCacheSize()
}

function smoothPeaks(peaks: number[]): number[] {
  return peaks.map((peak, index) => {
    const prev = peaks[index - 1] ?? peak
    const next = peaks[index + 1] ?? peak
    return (prev + peak * 2 + next) / 4
  })
}

function peaksToHeights(peaks: number[]): string[] {
  if (peaks.length === 0) return []

  const smoothed = smoothPeaks(peaks)
  const sorted = [...smoothed].sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.floor((sorted.length - 1) * 0.95))
  const scale = Math.max(sorted[p95Index] ?? 0, 0.02)

  return smoothed.map((peak) => {
    const normalized = clamp(peak / scale, 0, 1)
    const eased = normalized ** 0.72
    const heightPct = 14 + eased * 86
    return `${heightPct.toFixed(1)}%`
  })
}

function computePeaks(audioBuffer: AudioBuffer, barCount: number): number[] {
  if (barCount <= 0 || audioBuffer.length <= 0) return []

  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, idx) =>
    audioBuffer.getChannelData(idx),
  )
  const totalSamples = audioBuffer.length
  const samplesPerBar = Math.max(1, Math.floor(totalSamples / barCount))

  return Array.from({ length: barCount }, (_, barIndex) => {
    const start = barIndex * samplesPerBar
    const end = barIndex === barCount - 1 ? totalSamples : Math.min(totalSamples, start + samplesPerBar)
    const stride = Math.max(1, Math.floor((end - start) / 48))

    let peak = 0
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += stride) {
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
        const sample = Math.abs(channels[channelIndex]?.[sampleIndex] ?? 0)
        if (sample > peak) peak = sample
      }
    }
    return peak
  })
}

async function decodeWaveformFromUrl(
  sourceUrl: string,
  options: ResolveWaveformOptions,
): Promise<string[]> {
  const cacheKey = `${options.barCount}::${sourceUrl}`
  const cached = waveformCache.get(cacheKey)
  if (cached) return cached

  const response = await fetch(sourceUrl, {
    signal: options.signal,
    cache: 'force-cache',
  })
  if (!response.ok) {
    throw new Error(`Waveform fetch failed: HTTP ${response.status}`)
  }

  const contentLengthHeader = response.headers.get('content-length')
  const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN
  if (Number.isFinite(contentLength) && contentLength > WAVEFORM_FETCH_MAX_BYTES) {
    throw new Error('Episode is too large for browser waveform extraction')
  }

  const payload = await response.arrayBuffer()
  const decodingContext = new OfflineAudioContext(1, 1, 44_100)
  const audioBuffer = await decodingContext.decodeAudioData(payload.slice(0))
  const peaks = computePeaks(audioBuffer, options.barCount)
  const heights = peaksToHeights(peaks)
  cacheWaveform(cacheKey, heights)
  return heights
}

export function useEpisodeWaveform({
  audioRef,
  episodeGuid,
  barCount = 64,
}: UseEpisodeWaveformOptions): string[] {
  const fallbackSeed = episodeGuid ?? 'no-episode'
  const fallbackHeights = useMemo(
    () => buildFallbackWaveform(fallbackSeed, barCount),
    [barCount, fallbackSeed],
  )
  const [waveformHeights, setWaveformHeights] = useState<string[]>(fallbackHeights)

  useEffect(() => {
    setWaveformHeights(fallbackHeights)
  }, [fallbackHeights])

  useEffect(() => {
    if (!episodeGuid) return

    const audioEl = audioRef.current
    if (!audioEl) return

    const controller = new AbortController()
    let isMounted = true
    let lastResolvedSrc = ''

    const resolveForCurrentSource = async () => {
      const sourceUrl = audioEl.currentSrc || audioEl.src
      if (!sourceUrl || sourceUrl === lastResolvedSrc) return
      lastResolvedSrc = sourceUrl

      try {
        const heights = await decodeWaveformFromUrl(sourceUrl, {
          signal: controller.signal,
          barCount,
        })
        if (!isMounted || controller.signal.aborted) return
        setWaveformHeights(heights.length > 0 ? heights : fallbackHeights)
      } catch (error) {
        if (!isMounted || controller.signal.aborted || isAbortError(error)) return
        setWaveformHeights(fallbackHeights)
      }
    }

    const onSourceChange = () => {
      void resolveForCurrentSource()
    }

    void resolveForCurrentSource()
    audioEl.addEventListener('loadedmetadata', onSourceChange)
    audioEl.addEventListener('durationchange', onSourceChange)
    audioEl.addEventListener('canplay', onSourceChange)

    return () => {
      isMounted = false
      controller.abort()
      audioEl.removeEventListener('loadedmetadata', onSourceChange)
      audioEl.removeEventListener('durationchange', onSourceChange)
      audioEl.removeEventListener('canplay', onSourceChange)
    }
  }, [audioRef, barCount, episodeGuid, fallbackHeights, fallbackSeed])

  return waveformHeights
}
