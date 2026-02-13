import { describe, expect, it } from 'vitest'
import { clamp01, clampRange, formatClock, seekTargetFromPct } from '../../src/features/player/playbackMath'

describe('playback math', () => {
  it('formats clock values', () => {
    expect(formatClock(undefined)).toBe('--:--')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(3665)).toBe('1:01:05')
  })

  it('clamps values and computes seek target', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clampRange(11, 0, 10)).toBe(10)
    expect(seekTargetFromPct(120, 0.25)).toBe(30)
    expect(seekTargetFromPct(null, 0.25)).toBeNull()
  })
})
