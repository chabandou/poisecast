import {
  type CSSProperties,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ImgHTMLAttributes,
} from 'react'

type GlitchImageVariant = 'hero' | 'artwork' | 'card' | 'mini'
type GlitchImagePhase = 'dormant' | 'loading' | 'entering' | 'ready'
type GlitchFragmentMotionProfile = {
  sliceX: number
  sliceY: number
  chunkX: number
  chunkY: number
  rotate: number
  skew: number
  delay: number
}

type GlitchImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  variant?: GlitchImageVariant
  wrapperClassName?: string
  startDelayMs?: number
}

const ENTER_MS_BY_VARIANT: Record<GlitchImageVariant, number> = {
  hero: 860,
  artwork: 760,
  card: 620,
  mini: 360,
}
const FRAGMENT_PROFILE_BY_VARIANT: Record<
  GlitchImageVariant,
  GlitchFragmentMotionProfile
> = {
  hero: {
    sliceX: 32,
    sliceY: 14,
    chunkX: 40,
    chunkY: 22,
    rotate: 10,
    skew: 12,
    delay: 96,
  },
  artwork: {
    sliceX: 26,
    sliceY: 12,
    chunkX: 34,
    chunkY: 18,
    rotate: 8,
    skew: 10,
    delay: 82,
  },
  card: {
    sliceX: 20,
    sliceY: 10,
    chunkX: 28,
    chunkY: 15,
    rotate: 7,
    skew: 8,
    delay: 70,
  },
  mini: {
    sliceX: 8,
    sliceY: 5,
    chunkX: 12,
    chunkY: 6,
    rotate: 3,
    skew: 3,
    delay: 30,
  },
}

type GlitchFragmentVars = CSSProperties & Record<`--pc-frag-${string}`, string>

function cx(...classes: Array<string | undefined | false>): string {
  return classes.filter(Boolean).join(' ')
}

function randomSigned(max: number): number {
  const magnitude = max * (0.45 + Math.random() * 0.55)
  return (Math.random() < 0.5 ? -1 : 1) * magnitude
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function toPx(value: number): string {
  return `${value.toFixed(2)}px`
}

function toDeg(value: number): string {
  return `${value.toFixed(2)}deg`
}

function toMs(value: number): string {
  return `${Math.round(value)}ms`
}

function toNum(value: number): string {
  return value.toFixed(3)
}

function createFragmentVars(variant: GlitchImageVariant): GlitchFragmentVars {
  const profile = FRAGMENT_PROFILE_BY_VARIANT[variant]
  const baseStep = Math.max(10, profile.delay * 0.14)
  const jitterMax = profile.delay * 0.95
  const delayFor = (slot: number): string =>
    toMs(slot * baseStep + randomBetween(0, jitterMax))

  return {
    '--pc-frag-slice-a-x': toPx(randomSigned(profile.sliceX * 0.92)),
    '--pc-frag-slice-a-y': toPx(randomSigned(profile.sliceY * 1.92)),
    '--pc-frag-slice-a-rot': toDeg(randomSigned(profile.rotate)),
    '--pc-frag-slice-a-skew': toDeg(randomSigned(profile.skew)),
    '--pc-frag-slice-a-x2': toPx(randomSigned(profile.sliceX * 1.24)),
    '--pc-frag-slice-a-y2': toPx(randomSigned(profile.sliceY * 2.36)),
    '--pc-frag-slice-a-rot2': toDeg(randomSigned(profile.rotate * 1.38)),
    '--pc-frag-slice-a-skew2': toDeg(randomSigned(profile.skew * 1.28)),
    '--pc-frag-slice-a-delay': delayFor(0),
    '--pc-frag-slice-b-x': toPx(randomSigned(profile.sliceX * 0.9)),
    '--pc-frag-slice-b-y': toPx(randomSigned(profile.sliceY * 1.86)),
    '--pc-frag-slice-b-rot': toDeg(randomSigned(profile.rotate)),
    '--pc-frag-slice-b-skew': toDeg(randomSigned(profile.skew)),
    '--pc-frag-slice-b-x2': toPx(randomSigned(profile.sliceX * 1.16)),
    '--pc-frag-slice-b-y2': toPx(randomSigned(profile.sliceY * 2.24)),
    '--pc-frag-slice-b-rot2': toDeg(randomSigned(profile.rotate * 1.32)),
    '--pc-frag-slice-b-skew2': toDeg(randomSigned(profile.skew * 1.24)),
    '--pc-frag-slice-b-delay': delayFor(0.55),
    '--pc-frag-slice-c-x': toPx(randomSigned(profile.sliceX * 0.86)),
    '--pc-frag-slice-c-y': toPx(randomSigned(profile.sliceY * 1.98)),
    '--pc-frag-slice-c-rot': toDeg(randomSigned(profile.rotate)),
    '--pc-frag-slice-c-skew': toDeg(randomSigned(profile.skew)),
    '--pc-frag-slice-c-x2': toPx(randomSigned(profile.sliceX * 1.2)),
    '--pc-frag-slice-c-y2': toPx(randomSigned(profile.sliceY * 2.3)),
    '--pc-frag-slice-c-rot2': toDeg(randomSigned(profile.rotate * 1.34)),
    '--pc-frag-slice-c-skew2': toDeg(randomSigned(profile.skew * 1.26)),
    '--pc-frag-slice-c-delay': delayFor(1.12),
    '--pc-frag-vchunk-a-x': toPx(randomSigned(profile.chunkX * 0.74)),
    '--pc-frag-vchunk-a-y': toPx(randomSigned(profile.chunkY * 2.06)),
    '--pc-frag-vchunk-a-rot': toDeg(randomSigned(profile.rotate * 0.94)),
    '--pc-frag-vchunk-a-skew': toDeg(randomSigned(profile.skew * 0.72)),
    '--pc-frag-vchunk-a-x2': toPx(randomSigned(profile.chunkX * 1.02)),
    '--pc-frag-vchunk-a-y2': toPx(randomSigned(profile.chunkY * 2.52)),
    '--pc-frag-vchunk-a-rot2': toDeg(randomSigned(profile.rotate * 1.22)),
    '--pc-frag-vchunk-a-skew2': toDeg(randomSigned(profile.skew * 1.08)),
    '--pc-frag-vchunk-a-delay': delayFor(2.16),
    '--pc-frag-vchunk-b-x': toPx(randomSigned(profile.chunkX * 0.7)),
    '--pc-frag-vchunk-b-y': toPx(randomSigned(profile.chunkY * 1.94)),
    '--pc-frag-vchunk-b-rot': toDeg(randomSigned(profile.rotate * 0.9)),
    '--pc-frag-vchunk-b-skew': toDeg(randomSigned(profile.skew * 0.7)),
    '--pc-frag-vchunk-b-x2': toPx(randomSigned(profile.chunkX * 0.98)),
    '--pc-frag-vchunk-b-y2': toPx(randomSigned(profile.chunkY * 2.44)),
    '--pc-frag-vchunk-b-rot2': toDeg(randomSigned(profile.rotate * 1.18)),
    '--pc-frag-vchunk-b-skew2': toDeg(randomSigned(profile.skew * 1.04)),
    '--pc-frag-vchunk-b-delay': delayFor(2.64),
    '--pc-frag-chunk-a-x': toPx(randomSigned(profile.chunkX * 0.82)),
    '--pc-frag-chunk-a-y': toPx(randomSigned(profile.chunkY * 1.84)),
    '--pc-frag-chunk-a-rot': toDeg(randomSigned(profile.rotate)),
    '--pc-frag-chunk-a-skew': toDeg(randomSigned(profile.skew)),
    '--pc-frag-chunk-a-x2': toPx(randomSigned(profile.chunkX * 1.18)),
    '--pc-frag-chunk-a-y2': toPx(randomSigned(profile.chunkY * 2.18)),
    '--pc-frag-chunk-a-rot2': toDeg(randomSigned(profile.rotate * 1.28)),
    '--pc-frag-chunk-a-skew2': toDeg(randomSigned(profile.skew * 1.18)),
    '--pc-frag-chunk-a-delay': delayFor(4.1),
    '--pc-frag-chunk-b-x': toPx(randomSigned(profile.chunkX * 0.8)),
    '--pc-frag-chunk-b-y': toPx(randomSigned(profile.chunkY * 1.78)),
    '--pc-frag-chunk-b-rot': toDeg(randomSigned(profile.rotate)),
    '--pc-frag-chunk-b-skew': toDeg(randomSigned(profile.skew)),
    '--pc-frag-chunk-b-x2': toPx(randomSigned(profile.chunkX * 1.14)),
    '--pc-frag-chunk-b-y2': toPx(randomSigned(profile.chunkY * 2.12)),
    '--pc-frag-chunk-b-rot2': toDeg(randomSigned(profile.rotate * 1.22)),
    '--pc-frag-chunk-b-skew2': toDeg(randomSigned(profile.skew * 1.16)),
    '--pc-frag-chunk-b-delay': delayFor(4.58),
    '--pc-frag-rgb-cyan-a': toNum(randomBetween(0.52, 0.9)),
    '--pc-frag-rgb-red-a': toNum(randomBetween(0.4, 0.8)),
    '--pc-frag-rgb-cyan-b': toNum(randomBetween(0.42, 0.78)),
    '--pc-frag-rgb-red-b': toNum(randomBetween(0.34, 0.7)),
    '--pc-frag-rgb-cyan-c': toNum(randomBetween(0.24, 0.56)),
    '--pc-frag-rgb-red-c': toNum(randomBetween(0.2, 0.48)),
    '--pc-frag-load-cyan-a': toNum(randomBetween(0.36, 0.66)),
    '--pc-frag-load-red-a': toNum(randomBetween(0.24, 0.52)),
    '--pc-frag-load-cyan-b': toNum(randomBetween(0.28, 0.6)),
    '--pc-frag-load-red-b': toNum(randomBetween(0.2, 0.46)),
  }
}

export const GlitchImage = memo(function GlitchImage({
  variant = 'card',
  wrapperClassName,
  startDelayMs = 0,
  className,
  onLoad,
  onError,
  src,
  alt,
  ...imgProps
}: GlitchImageProps) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const enterTimerRef = useRef<number | null>(null)
  const startTimerRef = useRef<number | null>(null)
  const cycleRef = useRef(0)
  const [phase, setPhase] = useState<GlitchImagePhase>(
    startDelayMs > 0 ? 'dormant' : 'loading',
  )
  const hasOutsideFx = (wrapperClassName ?? '')
    .split(/\s+/)
    .includes('pcGlitchImage--outsideFx')
  const fragmentVars = useMemo<GlitchFragmentVars | undefined>(() => {
    if (!src) return undefined
    return createFragmentVars(variant)
  }, [src, variant])

  useEffect(() => {
    cycleRef.current += 1
    const cycle = cycleRef.current
    const safeStartDelayMs = Math.max(0, startDelayMs)
    setPhase(safeStartDelayMs > 0 ? 'dormant' : 'loading')

    const img = imgRef.current
    let detachListeners: (() => void) | null = null
    const beginLoadSequence = () => {
      if (cycleRef.current !== cycle) return
      setPhase('loading')

      if (!img || !src) {
        setPhase('ready')
        return
      }

      const finishEnter = () => {
        if (cycleRef.current !== cycle) return
        setPhase('entering')
        if (enterTimerRef.current !== null) {
          window.clearTimeout(enterTimerRef.current)
          enterTimerRef.current = null
        }
        enterTimerRef.current = window.setTimeout(() => {
          if (cycleRef.current !== cycle) return
          setPhase('ready')
          enterTimerRef.current = null
        }, ENTER_MS_BY_VARIANT[variant])
      }

      const resolveReady = () => {
        if (typeof img.decode === 'function') {
          void img
            .decode()
            .catch(() => undefined)
            .finally(finishEnter)
          return
        }
        finishEnter()
      }

      if (img.complete && img.naturalWidth > 0) {
        resolveReady()
        return
      }

      const onLoadInternal = () => {
        resolveReady()
      }
      const onErrorInternal = () => {
        if (cycleRef.current !== cycle) return
        setPhase('ready')
      }

      img.addEventListener('load', onLoadInternal)
      img.addEventListener('error', onErrorInternal)
      detachListeners = () => {
        img.removeEventListener('load', onLoadInternal)
        img.removeEventListener('error', onErrorInternal)
      }
    }

    if (safeStartDelayMs > 0) {
      if (startTimerRef.current !== null) {
        window.clearTimeout(startTimerRef.current)
        startTimerRef.current = null
      }
      startTimerRef.current = window.setTimeout(() => {
        startTimerRef.current = null
        beginLoadSequence()
      }, safeStartDelayMs)
    } else {
      beginLoadSequence()
    }

    return () => {
      if (detachListeners) {
        detachListeners()
        detachListeners = null
      }
      if (startTimerRef.current !== null) {
        window.clearTimeout(startTimerRef.current)
        startTimerRef.current = null
      }
    }
  }, [src, variant, startDelayMs])

  useEffect(() => {
    return () => {
      if (startTimerRef.current !== null) {
        window.clearTimeout(startTimerRef.current)
        startTimerRef.current = null
      }
      if (enterTimerRef.current !== null) {
        window.clearTimeout(enterTimerRef.current)
        enterTimerRef.current = null
      }
    }
  }, [])

  return (
    <span
      className={cx(
        'pcGlitchImage',
        `pcGlitchImage--${variant}`,
        phase === 'dormant' && 'isDormant',
        phase === 'loading' && 'isLoading',
        phase === 'entering' && 'isEntering',
        phase === 'ready' && 'isReady',
        wrapperClassName,
      )}
      style={fragmentVars}
    >
      <span className="pcGlitchImageClip">
        <img
          {...imgProps}
          ref={imgRef}
          src={src}
          alt={alt}
          className={cx('pcGlitchImageImg', className)}
          onLoad={onLoad}
          onError={onError}
        />
        <span className="pcGlitchLoadingFx" aria-hidden="true">
          <span className="pcGlitchLoadingBase" />
          <span className="pcGlitchLoadingScanline" />
          <span className="pcGlitchLoadingFragments">
            <span className="pcGlitchLoadingFragment pcGlitchLoadingFragment--sliceA" />
            <span className="pcGlitchLoadingFragment pcGlitchLoadingFragment--sliceB" />
            <span className="pcGlitchLoadingFragment pcGlitchLoadingFragment--sliceC" />
            <span className="pcGlitchLoadingFragment pcGlitchLoadingFragment--chunkA" />
            <span className="pcGlitchLoadingFragment pcGlitchLoadingFragment--vChunkA" />
            <span className="pcGlitchLoadingFragment pcGlitchLoadingFragment--vChunkB" />
          </span>
        </span>
        <span className="pcGlitchLayer pcGlitchLayerNoise" aria-hidden="true" />
        <span className="pcGlitchLayer pcGlitchLayerScan" aria-hidden="true" />
        <span className="pcGlitchLayer pcGlitchLayerRgbA" aria-hidden="true" />
        <span className="pcGlitchLayer pcGlitchLayerRgbB" aria-hidden="true" />
      </span>
      {hasOutsideFx ? (
        <span className="pcGlitchLoadingOutside" aria-hidden="true">
          <span className="pcGlitchLoadingOutsideFragment pcGlitchLoadingOutsideFragment--sliceA" />
          <span className="pcGlitchLoadingOutsideFragment pcGlitchLoadingOutsideFragment--sliceB" />
          <span className="pcGlitchLoadingOutsideFragment pcGlitchLoadingOutsideFragment--chunkA" />
          <span className="pcGlitchLoadingOutsideFragment pcGlitchLoadingOutsideFragment--vChunkA" />
          <span className="pcGlitchLoadingOutsideFragment pcGlitchLoadingOutsideFragment--vChunkB" />
        </span>
      ) : null}
      {hasOutsideFx && src ? (
        <span className="pcGlitchFragments" aria-hidden="true">
          <span className="pcGlitchFragment pcGlitchFragment--sliceA">
            <img
              className="pcGlitchFragmentImg"
              src={src}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </span>
          <span className="pcGlitchFragment pcGlitchFragment--sliceB">
            <img
              className="pcGlitchFragmentImg"
              src={src}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </span>
          <span className="pcGlitchFragment pcGlitchFragment--sliceC">
            <img
              className="pcGlitchFragmentImg"
              src={src}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </span>
          <span className="pcGlitchFragment pcGlitchFragment--chunkA">
            <img
              className="pcGlitchFragmentImg"
              src={src}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </span>
          <span className="pcGlitchFragment pcGlitchFragment--chunkB">
            <img
              className="pcGlitchFragmentImg"
              src={src}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </span>
          <span className="pcGlitchFragment pcGlitchFragment--vChunkA">
            <img
              className="pcGlitchFragmentImg"
              src={src}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </span>
          <span className="pcGlitchFragment pcGlitchFragment--vChunkB">
            <img
              className="pcGlitchFragmentImg"
              src={src}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </span>
        </span>
      ) : null}
    </span>
  )
})
