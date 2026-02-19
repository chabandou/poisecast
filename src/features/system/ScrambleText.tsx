import { memo, useEffect, useRef, useState } from 'react'

type ScrambleTextProps = {
  text: string
  durationMs?: number
  delayMs?: number
  typeInDurationMs?: number
  loop?: boolean
  loopDelayMs?: number
}

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&'

function useScrambleText(
  text: string,
  durationMs = 700,
  delayMs = 0,
  typeInDurationMs = 0,
  loop = false,
  loopDelayMs = 120,
): string {
  const [display, setDisplay] = useState(text)
  const rafRef = useRef<number | null>(null)
  const delayRef = useRef<number | null>(null)
  const loopRef = useRef<number | null>(null)
  const scrambleRef = useRef<number[]>([])

  useEffect(() => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (delayRef.current) {
      window.clearTimeout(delayRef.current)
      delayRef.current = null
    }
    if (loopRef.current) {
      window.clearTimeout(loopRef.current)
      loopRef.current = null
    }

    if (!text) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(text)
      return
    }

    const chars = text.split('')
    let isUnmounted = false
    const randomizeCharacter = (ch: string) =>
      /[A-Za-z0-9]/.test(ch)
        ? CHARSET[Math.floor(Math.random() * CHARSET.length)]
        : ch

    const startCycle = () => {
      if (isUnmounted) return
      scrambleRef.current = chars.map((ch, i) => {
        if (!/[A-Za-z0-9]/.test(ch)) return 0
        const base = i / Math.max(1, chars.length - 1)
        return Math.min(1, base * 0.65 + Math.random() * 0.35)
      })
      setDisplay('')
      const typeDuration = Math.max(0, typeInDurationMs)
      const start = performance.now()

      const tick = (now: number) => {
        if (isUnmounted) return
        const elapsed = now - start

        if (typeDuration > 0 && elapsed < typeDuration) {
          const typedProgress = Math.min(1, elapsed / typeDuration)
          const typedCount = Math.floor(typedProgress * chars.length)
          const typed = chars
            .slice(0, typedCount)
            .map((ch) => randomizeCharacter(ch))
            .join('')
          setDisplay(typed)
          rafRef.current = window.requestAnimationFrame(tick)
          return
        }

        const scrambleElapsed = Math.max(0, elapsed - typeDuration)
        const progress = Math.min(1, scrambleElapsed / Math.max(1, durationMs))
        const next = chars
          .map((ch, i) => {
            if (!/[A-Za-z0-9]/.test(ch)) return ch
            if (progress >= (scrambleRef.current[i] ?? 0)) return ch
            return randomizeCharacter(ch)
          })
          .join('')
        setDisplay(next)
        if (progress < 1) {
          rafRef.current = window.requestAnimationFrame(tick)
          return
        }

        setDisplay(text)
        rafRef.current = null
        if (!loop) return

        loopRef.current = window.setTimeout(() => {
          loopRef.current = null
          startCycle()
        }, Math.max(0, loopDelayMs))
      }

      rafRef.current = window.requestAnimationFrame(tick)
    }

    const begin = () => {
      startCycle()
    }

    if (delayMs > 0) {
      delayRef.current = window.setTimeout(() => {
        delayRef.current = null
        begin()
      }, delayMs)
    } else {
      begin()
    }

    return () => {
      isUnmounted = true
      if (delayRef.current) {
        window.clearTimeout(delayRef.current)
        delayRef.current = null
      }
      if (loopRef.current) {
        window.clearTimeout(loopRef.current)
        loopRef.current = null
      }
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [text, durationMs, delayMs, typeInDurationMs, loop, loopDelayMs])

  return text ? display : text
}

export const ScrambleText = memo(function ScrambleText({
  text,
  durationMs = 700,
  delayMs = 0,
  typeInDurationMs = 0,
  loop = false,
  loopDelayMs = 120,
}: ScrambleTextProps) {
  const display = useScrambleText(
    text,
    durationMs,
    delayMs,
    typeInDurationMs,
    loop,
    loopDelayMs,
  )
  return <>{display}</>
})
