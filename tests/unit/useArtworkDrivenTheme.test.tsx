import { render, screen, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearArtworkThemeCacheForTests,
  useArtworkDrivenTheme,
} from '../../src/features/system/useArtworkDrivenTheme'
import * as artworkThemeModule from '../../src/features/system/artworkTheme'

vi.mock('../../src/features/system/artworkTheme', async () => {
  const actual = await vi.importActual<typeof import('../../src/features/system/artworkTheme')>(
    '../../src/features/system/artworkTheme',
  )

  return {
    ...actual,
    deriveArtworkThemeFromImageUrl: vi.fn(),
  }
})

const deriveArtworkThemeFromImageUrlMock = vi.mocked(
  artworkThemeModule.deriveArtworkThemeFromImageUrl,
)

type ThemeProbeProps = {
  artworkUrl: string | null
  isEnabled: boolean
}

function ThemeProbe({ artworkUrl, isEnabled }: ThemeProbeProps) {
  const probeRef = useRef<HTMLDivElement | null>(null)
  useArtworkDrivenTheme({ artworkUrl, isEnabled, targetRef: probeRef })
  return <div data-testid="theme-probe" ref={probeRef} />
}

afterEach(() => {
  vi.clearAllMocks()
  clearArtworkThemeCacheForTests()
})

describe('useArtworkDrivenTheme', () => {
  it('applies css variables from derived artwork theme when enabled', async () => {
    deriveArtworkThemeFromImageUrlMock.mockResolvedValue({
      primary: '#66d8ff',
      accent: '#29a9ea',
      primaryDim: 'rgba(102, 216, 255, 0.12)',
      glow: 'rgba(102, 216, 255, 0.45)',
      glowSm: 'rgba(102, 216, 255, 0.34)',
    })

    render(<ThemeProbe artworkUrl="https://cdn.example.com/artwork.png" isEnabled />)

    await waitFor(() => {
      expect(deriveArtworkThemeFromImageUrlMock).toHaveBeenCalledTimes(1)
    })

    const probe = screen.getByTestId('theme-probe')
    expect(probe.style.getPropertyValue('--pc-primary')).toBe('#66d8ff')
    expect(probe.style.getPropertyValue('--pc-accent')).toBe('#29a9ea')
  })

  it('clears css variables when disabled', async () => {
    deriveArtworkThemeFromImageUrlMock.mockResolvedValue({
      primary: '#66d8ff',
      accent: '#29a9ea',
      primaryDim: 'rgba(102, 216, 255, 0.12)',
      glow: 'rgba(102, 216, 255, 0.45)',
      glowSm: 'rgba(102, 216, 255, 0.34)',
    })

    const { rerender } = render(
      <ThemeProbe artworkUrl="https://cdn.example.com/artwork.png" isEnabled />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('theme-probe').style.getPropertyValue('--pc-primary')).toBe(
        '#66d8ff',
      )
    })

    rerender(
      <ThemeProbe artworkUrl="https://cdn.example.com/artwork.png" isEnabled={false} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('theme-probe').style.getPropertyValue('--pc-primary')).toBe('')
    })
  })

  it('reuses cached theme for the same artwork url', async () => {
    deriveArtworkThemeFromImageUrlMock.mockResolvedValue({
      primary: '#7fe0ff',
      accent: '#2ba2d9',
      primaryDim: 'rgba(127, 224, 255, 0.12)',
      glow: 'rgba(127, 224, 255, 0.45)',
      glowSm: 'rgba(127, 224, 255, 0.34)',
    })

    const { rerender } = render(
      <ThemeProbe artworkUrl="https://cdn.example.com/artwork.png" isEnabled />,
    )

    await waitFor(() => {
      expect(deriveArtworkThemeFromImageUrlMock).toHaveBeenCalledTimes(1)
    })

    rerender(
      <ThemeProbe artworkUrl="https://cdn.example.com/artwork.png" isEnabled={false} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('theme-probe').style.getPropertyValue('--pc-primary')).toBe('')
    })

    rerender(
      <ThemeProbe artworkUrl="https://cdn.example.com/artwork.png" isEnabled />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('theme-probe').style.getPropertyValue('--pc-primary')).toBe(
        '#7fe0ff',
      )
    })

    expect(deriveArtworkThemeFromImageUrlMock).toHaveBeenCalledTimes(1)
  })
})
