import { describe, expect, it } from 'vitest'
import {
  createArtworkThemeTokens,
  extractDominantColorFromPixels,
  toPastelNeonColor,
} from '../../src/features/system/artworkTheme'

describe('artworkTheme', () => {
  it('extracts dominant color from sampled pixels', () => {
    const dominantRedPixels = new Uint8ClampedArray([
      250,
      28,
      42,
      255,
      245,
      35,
      55,
      255,
      240,
      22,
      36,
      255,
      247,
      38,
      48,
      255,
      238,
      40,
      52,
      255,
      24,
      48,
      220,
      255,
      20,
      44,
      210,
      255,
    ])

    const dominant = extractDominantColorFromPixels(dominantRedPixels)

    expect(dominant).not.toBeNull()
    expect((dominant?.r ?? 0) > 200).toBe(true)
    expect((dominant?.b ?? 255) < 120).toBe(true)
  })

  it('ignores transparent and near-neutral pixels', () => {
    const pixels = new Uint8ClampedArray([
      255,
      0,
      0,
      20,
      250,
      250,
      250,
      255,
      10,
      20,
      240,
      255,
      18,
      30,
      230,
      255,
      16,
      28,
      220,
      255,
    ])

    const dominant = extractDominantColorFromPixels(pixels)

    expect(dominant).not.toBeNull()
    expect((dominant?.b ?? 0) > 150).toBe(true)
    expect((dominant?.r ?? 255) < 80).toBe(true)
  })

  it('converts colors into a brighter pastel-neon range', () => {
    const source = { r: 18, g: 36, b: 132 }
    const converted = toPastelNeonColor(source)

    const sourceAvg = (source.r + source.g + source.b) / 3
    const convertedAvg = (converted.r + converted.g + converted.b) / 3

    expect(convertedAvg > sourceAvg).toBe(true)
    expect(converted.b > converted.r).toBe(true)
    expect(converted.b > converted.g).toBe(true)
  })

  it('creates css theme tokens from a source color', () => {
    const tokens = createArtworkThemeTokens({ r: 16, g: 112, b: 210 })

    expect(tokens.primary.startsWith('#')).toBe(true)
    expect(tokens.accent.startsWith('#')).toBe(true)
    expect(tokens.primaryDim.startsWith('rgba(')).toBe(true)
    expect(tokens.glow.startsWith('rgba(')).toBe(true)
    expect(tokens.glowSm.startsWith('rgba(')).toBe(true)
  })
})
