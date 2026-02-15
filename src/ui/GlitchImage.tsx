import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ImgHTMLAttributes,
} from 'react'

type GlitchImageVariant = 'hero' | 'artwork' | 'card' | 'mini'

type GlitchImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  variant?: GlitchImageVariant
  wrapperClassName?: string
  isInView?: boolean
  forceLoading?: boolean
  startDelayMs?: number
}

type TileRevealPreset = {
  tilesX: number
  tilesY: number
  revealMinMs: number
  revealMaxMs: number
  tileDurMinMs: number
  tileDurMaxMs: number
  blurStartPx: number
  dimStart: number
  scaleStart: number
}

type TileCell = {
  id: string
  col: number
  row: number
  delayMs: number
  durationMs: number
  alpha: number
  driftX: number
  driftY: number
  bgPosX: number
  bgPosY: number
  bgSizeX: number
  bgSizeY: number
}

type PendingTileCell = {
  id: string
  col: number
  row: number
  alpha: number
  sequenceDelayMs: number
}

const TILE_REVEAL_PRESETS: Record<GlitchImageVariant, TileRevealPreset> = {
  hero: {
    tilesX: 9,
    tilesY: 6,
    revealMinMs: 440,
    revealMaxMs: 640,
    tileDurMinMs: 170,
    tileDurMaxMs: 260,
    blurStartPx: 2.8,
    dimStart: 0.72,
    scaleStart: 1.03,
  },
  artwork: {
    tilesX: 8,
    tilesY: 8,
    revealMinMs: 430,
    revealMaxMs: 620,
    tileDurMinMs: 165,
    tileDurMaxMs: 250,
    blurStartPx: 2.5,
    dimStart: 0.74,
    scaleStart: 1.026,
  },
  card: {
    tilesX: 4,
    tilesY: 4,
    revealMinMs: 260,
    revealMaxMs: 360,
    tileDurMinMs: 120,
    tileDurMaxMs: 180,
    blurStartPx: 1.4,
    dimStart: 0.84,
    scaleStart: 1.012,
  },
  mini: {
    tilesX: 6,
    tilesY: 6,
    revealMinMs: 330,
    revealMaxMs: 500,
    tileDurMinMs: 140,
    tileDurMaxMs: 210,
    blurStartPx: 1.8,
    dimStart: 0.82,
    scaleStart: 1.018,
  },
}

function cx(...classes: Array<string | undefined | false>): string {
  return classes.filter(Boolean).join(' ')
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomSign(): number {
  return Math.random() > 0.5 ? 1 : -1
}

function toPx(value: number): string {
  return `${value.toFixed(2)}px`
}

function toMs(value: number): string {
  return `${Math.round(value)}ms`
}

function toNum(value: number): string {
  return value.toFixed(3)
}

function stableNoise(input: number): number {
  const x = Math.sin(input * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function buildTopLeftToBottomRightOrder(
  tilesX: number,
  tilesY: number,
): number[] {
  const indices = Array.from({ length: tilesX * tilesY }, (_, i) => i)

  return indices
    .map((tileIndex) => {
      const col = tileIndex % tilesX
      const row = Math.floor(tileIndex / tilesX)
      const diagonal = row + col
      const rowBias = row / Math.max(1, tilesY - 1)
      const colBias = col / Math.max(1, tilesX - 1)
      const jitter = rand(-0.12, 0.12)
      return {
        tileIndex,
        score: diagonal + rowBias * 0.18 + colBias * 0.12 + jitter,
      }
    })
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.tileIndex)
}

function buildTileReveal(
  preset: TileRevealPreset,
): {
  rootVars: CSSProperties
  cells: TileCell[]
  totalMs: number
} {
  const totalTiles = preset.tilesX * preset.tilesY
  const revealMs = rand(preset.revealMinMs, preset.revealMaxMs)
  const order = buildTopLeftToBottomRightOrder(preset.tilesX, preset.tilesY)

  let longestEndMs = 0

  const cells = order.map((tileIndex, orderIndex) => {
    const col = tileIndex % preset.tilesX
    const row = Math.floor(tileIndex / preset.tilesX)
    const t = totalTiles <= 1 ? 0 : orderIndex / (totalTiles - 1)
    const delayMs = t * revealMs + rand(0, revealMs * 0.08)
    const durationMs = rand(preset.tileDurMinMs, preset.tileDurMaxMs)
    const endMs = delayMs + durationMs
    if (endMs > longestEndMs) longestEndMs = endMs

    return {
      id: `tile-${tileIndex}`,
      col,
      row,
      delayMs,
      durationMs,
      alpha: rand(0.9, 1),
      driftX: rand(4, 14) * randomSign(),
      driftY: rand(3, 12) * randomSign(),
      bgPosX: preset.tilesX > 1 ? (col / (preset.tilesX - 1)) * 100 : 50,
      bgPosY: preset.tilesY > 1 ? (row / (preset.tilesY - 1)) * 100 : 50,
      bgSizeX: preset.tilesX * 100,
      bgSizeY: preset.tilesY * 100,
    }
  })

  return {
    rootVars: {
      '--pc-tile-cols': `${preset.tilesX}`,
      '--pc-tile-rows': `${preset.tilesY}`,
      '--pc-tile-blur-start': toPx(preset.blurStartPx),
      '--pc-tile-dim-start': toNum(preset.dimStart),
      '--pc-tile-scale-start': toNum(preset.scaleStart),
      '--pc-tile-image-ms': toMs(longestEndMs),
    } as CSSProperties,
    cells,
    totalMs: longestEndMs,
  }
}

function buildTileCellVars(cell: TileCell, imageUrl: string): CSSProperties {
  return {
    '--pc-tile-col': `${cell.col}`,
    '--pc-tile-row': `${cell.row}`,
    '--pc-tile-delay': toMs(cell.delayMs),
    '--pc-tile-dur': toMs(cell.durationMs),
    '--pc-tile-alpha': toNum(cell.alpha),
    '--pc-tile-drift-x': toPx(cell.driftX),
    '--pc-tile-drift-y': toPx(cell.driftY),
    backgroundImage: `url(${imageUrl})`,
    backgroundSize: `${cell.bgSizeX}% ${cell.bgSizeY}%`,
    backgroundPosition: `${cell.bgPosX.toFixed(3)}% ${cell.bgPosY.toFixed(3)}%`,
  } as CSSProperties
}

function buildPendingTiles(preset: TileRevealPreset): PendingTileCell[] {
  const order = buildTopLeftToBottomRightOrder(preset.tilesX, preset.tilesY)
  const totalTiles = order.length
  return order.map((tileIndex, orderIndex) => {
    const col = tileIndex % preset.tilesX
    const row = Math.floor(tileIndex / preset.tilesX)
    const alpha = 0.14 + stableNoise(tileIndex + 1.37) * 0.12
    const t = totalTiles <= 1 ? 0 : orderIndex / (totalTiles - 1)
    const sequenceDelayMs = Math.round(t * 720)
    return {
      id: `pending-${tileIndex}`,
      col,
      row,
      alpha,
      sequenceDelayMs,
    }
  })
}

function buildPendingTileVars(cell: PendingTileCell): CSSProperties {
  return {
    '--pc-pending-col': `${cell.col}`,
    '--pc-pending-row': `${cell.row}`,
    '--pc-pending-alpha': toNum(cell.alpha),
    '--pc-pending-seq-delay': toMs(cell.sequenceDelayMs),
  } as CSSProperties
}

export const GlitchImage = memo(function GlitchImage({
  variant = 'card',
  wrapperClassName,
  isInView = true,
  forceLoading = false,
  startDelayMs = 0,
  className,
  src,
  alt,
  onLoad,
  onError,
  ...imgProps
}: GlitchImageProps) {
  const IMAGE_ENTER_MS = 220
  const TILE_SETTLE_MS = 440
  const imgElementRef = useRef<HTMLImageElement | null>(null)
  const [isTileRevealing, setIsTileRevealing] = useState(false)
  const [isImageEntering, setIsImageEntering] = useState(false)
  const [isTileSettling, setIsTileSettling] = useState(false)
  const [isAnimationPending, setIsAnimationPending] = useState(false)
  const [hasImageError, setHasImageError] = useState(false)
  const [isImageReady, setIsImageReady] = useState(false)
  const [hasSettledForSrc, setHasSettledForSrc] = useState(false)
  const [cells, setCells] = useState<TileCell[]>([])
  const [rootVars, setRootVars] = useState<CSSProperties>({})
  const preset = TILE_REVEAL_PRESETS[variant]
  const pendingCells = useMemo(() => buildPendingTiles(preset), [preset])
  const styleVars = useMemo(
    () =>
      ({
        '--pc-tile-cols': `${preset.tilesX}`,
        '--pc-tile-rows': `${preset.tilesY}`,
        ...rootVars,
      }) as CSSProperties,
    [preset, rootVars],
  )
  const isPendingActive =
    isInView &&
    !hasImageError &&
    !hasSettledForSrc &&
    (forceLoading || !isImageReady || isAnimationPending)

  useLayoutEffect(() => {
    if (!src) {
      setIsImageReady(false)
      setIsTileRevealing(false)
      setIsImageEntering(false)
      setIsTileSettling(false)
      setIsAnimationPending(false)
      setHasImageError(false)
      setHasSettledForSrc(false)
      setCells([])
      setRootVars({})
      return
    }

    const img = imgElementRef.current
    if (img?.complete && img.naturalWidth > 0) {
      setHasImageError(false)
      setIsImageReady(true)
      setHasSettledForSrc(true)
      return
    }

    setIsImageReady(false)
    setIsTileRevealing(false)
    setIsImageEntering(false)
    setIsTileSettling(false)
    setIsAnimationPending(false)
    setHasImageError(false)
    setHasSettledForSrc(false)
    setCells([])
    setRootVars({})
  }, [src])

  useEffect(() => {
    if (
      !src ||
      !isImageReady ||
      hasImageError ||
      hasSettledForSrc ||
      typeof window === 'undefined'
    )
      return

    if (!isInView) {
      setIsTileRevealing(false)
      setIsImageEntering(false)
      setIsTileSettling(false)
      setIsAnimationPending(false)
      return
    }

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    if (reducedMotion) {
      setIsAnimationPending(false)
      setHasSettledForSrc(true)
      return
    }

    let isActive = true
    const timers = new Set<number>()

    setIsTileRevealing(false)
    setIsImageEntering(false)
    setIsTileSettling(false)
    setIsAnimationPending(true)

    const queue = (delayMs: number, callback: () => void): void => {
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        if (!isActive) return
        callback()
      }, Math.max(0, delayMs))
      timers.add(timer)
    }

    queue(startDelayMs, () => {
      if (!isActive) return

      const reveal = buildTileReveal(preset)
      setRootVars(reveal.rootVars)
      setCells(reveal.cells)
      setIsAnimationPending(false)
      setIsTileRevealing(true)

      queue(reveal.totalMs + 80, () => {
        if (!isActive) return
        setIsTileRevealing(false)
        setIsImageEntering(true)

        queue(IMAGE_ENTER_MS, () => {
          if (!isActive) return
          setIsImageEntering(false)
          setIsTileSettling(true)

          queue(TILE_SETTLE_MS, () => {
            if (!isActive) return
            setIsTileSettling(false)
            setHasSettledForSrc(true)
          })
        })
      })
    })

    return () => {
      isActive = false
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [
    hasImageError,
    hasSettledForSrc,
    isImageReady,
    isInView,
    preset,
    src,
    startDelayMs,
    variant,
  ])

  return (
    <span
      className={cx(
        'pcGlitchImage',
        `pcGlitchImage--${variant}`,
        !hasImageError &&
          !isImageReady &&
          !hasSettledForSrc &&
          isInView &&
          (Boolean(src) || forceLoading) &&
          'isImageLoading',
        isImageReady &&
          isAnimationPending &&
          !hasSettledForSrc &&
          isInView &&
          'isAnimationPending',
        isImageReady &&
          isTileRevealing &&
          !hasSettledForSrc &&
          isInView &&
          'isTileRevealing',
        isImageReady &&
          isImageEntering &&
          !hasSettledForSrc &&
          isInView &&
          'isImageEntering',
        isImageReady &&
          isTileSettling &&
          !hasSettledForSrc &&
          isInView &&
          'isTileSettling',
        wrapperClassName,
      )}
      style={styleVars}
      data-start-delay-ms={startDelayMs > 0 ? startDelayMs : undefined}
    >
      <span className="pcGlitchImageClip">
        {isPendingActive || isTileRevealing ? (
          <span className="pcTilePendingLayer" aria-hidden="true">
            {pendingCells.map((cell) => (
              <span
                key={cell.id}
                className="pcTilePendingCell"
                style={buildPendingTileVars(cell)}
              />
            ))}
          </span>
        ) : null}
        <img
          {...imgProps}
          ref={imgElementRef}
          src={src}
          alt={alt}
          className={cx('pcGlitchImageImg', className)}
          onLoad={(event) => {
            setHasImageError(false)
            setIsImageReady(true)
            if (!isInView) {
              setHasSettledForSrc(true)
            }
            onLoad?.(event)
          }}
          onError={(event) => {
            setHasImageError(true)
            setIsImageReady(false)
            setIsTileRevealing(false)
            setIsImageEntering(false)
            setIsTileSettling(false)
            setIsAnimationPending(false)
            setCells([])
            setRootVars({})
            onError?.(event)
          }}
        />
        {isImageReady &&
        isInView &&
        (isTileRevealing || isImageEntering || isTileSettling) ? (
          <span className="pcTileRevealLayer" aria-hidden="true">
            {cells.map((cell) => (
              <span
                key={cell.id}
                className="pcTileRevealCell"
                style={buildTileCellVars(cell, src ?? '')}
              />
            ))}
          </span>
        ) : null}
      </span>
    </span>
  )
})
