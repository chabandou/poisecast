import { memo, useEffect, useRef, useState } from 'react'

type ScrambleTextProps = {
  text: string
  durationMs?: number
  delayMs?: number
}

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&'

function useScrambleText(text: string, durationMs = 700, delayMs = 0): string {
  const [display, setDisplay] = useState(text)
  const rafRef = useRef<number | null>(null)
  const delayRef = useRef<number | null>(null)
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

    if (!text) return

    const chars = text.split('')
    const reveals = chars.map((ch, i) => {
      if (!/[A-Za-z0-9]/.test(ch)) return 0
      const base = i / Math.max(1, chars.length - 1)
      return Math.min(1, base * 0.65 + Math.random() * 0.35)
    })
    scrambleRef.current = reveals

    const begin = () => {
      const start = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs)
        const next = chars
          .map((ch, i) => {
            if (!/[A-Za-z0-9]/.test(ch)) return ch
            if (progress >= (scrambleRef.current[i] ?? 0)) return ch
            return CHARSET[Math.floor(Math.random() * CHARSET.length)]
          })
          .join('')
        setDisplay(next)
        if (progress < 1) {
          rafRef.current = window.requestAnimationFrame(tick)
        } else {
          setDisplay(text)
          rafRef.current = null
        }
      }
      rafRef.current = window.requestAnimationFrame(tick)
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
      if (delayRef.current) {
        window.clearTimeout(delayRef.current)
        delayRef.current = null
      }
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [text, durationMs, delayMs])

  return text ? display : text
}

export const ScrambleText = memo(function ScrambleText({
  text,
  durationMs = 700,
  delayMs = 0,
}: ScrambleTextProps) {
  const display = useScrambleText(text, durationMs, delayMs)
  return <>{display}</>
})
