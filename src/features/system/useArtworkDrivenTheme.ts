import { useEffect, type RefObject } from 'react'
import {
  deriveArtworkThemeFromImageUrl,
  type ArtworkThemeTokens,
} from './artworkTheme'

type UseArtworkDrivenThemeOptions = {
  artworkUrl: string | null
  isEnabled: boolean
  targetRef: RefObject<HTMLElement | null>
}

const themeCache = new Map<string, ArtworkThemeTokens | null>()

const THEME_VARIABLE_KEYS = [
  '--pc-primary',
  '--pc-accent',
  '--pc-primary-dim',
  '--pc-glow',
  '--pc-glow-sm',
] as const

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function clearThemeVariables(target: HTMLElement): void {
  for (const key of THEME_VARIABLE_KEYS) {
    target.style.removeProperty(key)
  }
}

function applyThemeVariables(target: HTMLElement, theme: ArtworkThemeTokens): void {
  target.style.setProperty('--pc-primary', theme.primary)
  target.style.setProperty('--pc-accent', theme.accent)
  target.style.setProperty('--pc-primary-dim', theme.primaryDim)
  target.style.setProperty('--pc-glow', theme.glow)
  target.style.setProperty('--pc-glow-sm', theme.glowSm)
}

export function clearArtworkThemeCacheForTests(): void {
  themeCache.clear()
}

export function useArtworkDrivenTheme({
  artworkUrl,
  isEnabled,
  targetRef,
}: UseArtworkDrivenThemeOptions): void {
  useEffect(() => {
    const target = targetRef.current
    if (!target) return

    if (!isEnabled || !artworkUrl) {
      clearThemeVariables(target)
      return
    }

    const cachedTheme = themeCache.get(artworkUrl)
    if (cachedTheme !== undefined) {
      if (cachedTheme) applyThemeVariables(target, cachedTheme)
      else clearThemeVariables(target)
      return
    }

    clearThemeVariables(target)

    const controller = new AbortController()
    let active = true

    void deriveArtworkThemeFromImageUrl(artworkUrl, {
      signal: controller.signal,
    })
      .then((resolvedTheme) => {
        if (!active) return
        themeCache.set(artworkUrl, resolvedTheme)

        const currentTarget = targetRef.current
        if (!currentTarget) return

        if (resolvedTheme) applyThemeVariables(currentTarget, resolvedTheme)
        else clearThemeVariables(currentTarget)
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return
        themeCache.set(artworkUrl, null)

        const currentTarget = targetRef.current
        if (!currentTarget) return
        clearThemeVariables(currentTarget)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [artworkUrl, isEnabled, targetRef])
}
