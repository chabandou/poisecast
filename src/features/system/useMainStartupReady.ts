import { useEffect, useState } from 'react'

const DESKTOP_MAIN_STARTUP_TOTAL_MS = 1460
const MOBILE_MAIN_STARTUP_TOTAL_MS = 740

function isReducedMotionPreferred(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function resolveMainStartupTotalMs(): number {
  const appRoot = document.querySelector('.pcApp')
  const isMobile = appRoot?.classList.contains('isMobile') ?? false
  return isMobile ? MOBILE_MAIN_STARTUP_TOTAL_MS : DESKTOP_MAIN_STARTUP_TOTAL_MS
}

function readBootCompleteAt(): number | null {
  const value = (window as Window & { __pcBootCompleteAt?: unknown })
    .__pcBootCompleteAt
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isStartupReadyNow(): boolean {
  if (typeof window === 'undefined') return true

  const root = document.documentElement
  if (isReducedMotionPreferred()) {
    return !root.classList.contains('pcBooting')
  }

  if (!root.classList.contains('pcBootComplete')) return false

  const bootCompleteAt = readBootCompleteAt()
  if (bootCompleteAt === null) return true

  const remainingMs =
    resolveMainStartupTotalMs() - (performance.now() - bootCompleteAt)
  return remainingMs <= 0
}

export function useMainStartupReady(): boolean {
  const [isReady, setIsReady] = useState<boolean>(() => isStartupReadyNow())

  useEffect(() => {
    if (isReady) return

    let timer: number | null = null
    let observer: MutationObserver | null = null

    const clearTimer = (): void => {
      if (timer === null) return
      window.clearTimeout(timer)
      timer = null
    }

    const markReady = (): void => {
      clearTimer()
      setIsReady(true)
    }

    const scheduleFromBootComplete = (bootCompleteAtMs: number): void => {
      if (isReducedMotionPreferred()) {
        markReady()
        return
      }
      const remainingMs =
        resolveMainStartupTotalMs() - (performance.now() - bootCompleteAtMs)
      if (remainingMs <= 0) {
        markReady()
        return
      }
      clearTimer()
      timer = window.setTimeout(markReady, remainingMs)
    }

    const tryScheduleFromDomState = (): boolean => {
      const root = document.documentElement
      if (!root.classList.contains('pcBootComplete')) return false
      const bootCompleteAt = readBootCompleteAt() ?? performance.now()
      scheduleFromBootComplete(bootCompleteAt)
      return true
    }

    if (tryScheduleFromDomState()) {
      return () => {
        clearTimer()
      }
    }

    const handleBootComplete = (event: Event): void => {
      const detail = (event as CustomEvent<{ completedAt?: number }>).detail
      const detailTimestamp = detail?.completedAt
      const bootCompleteAt =
        typeof detailTimestamp === 'number' && Number.isFinite(detailTimestamp)
          ? detailTimestamp
          : (readBootCompleteAt() ?? performance.now())
      scheduleFromBootComplete(bootCompleteAt)
    }

    window.addEventListener('pc:boot-complete', handleBootComplete)

    observer = new MutationObserver(() => {
      if (!tryScheduleFromDomState()) return
      observer?.disconnect()
      observer = null
      window.removeEventListener('pc:boot-complete', handleBootComplete)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      clearTimer()
      observer?.disconnect()
      window.removeEventListener('pc:boot-complete', handleBootComplete)
    }
  }, [isReady])

  return isReady
}
