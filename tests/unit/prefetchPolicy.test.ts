import { describe, expect, it } from 'vitest'
import {
  resolveOrtPrefetchStrategy,
  shouldPrefetchOrtCore,
} from '../../src/features/system/prefetchPolicy'

describe('prefetchPolicy', () => {
  it('resolves strategy flag values', () => {
    expect(resolveOrtPrefetchStrategy(undefined)).toBe('adaptive')
    expect(resolveOrtPrefetchStrategy('')).toBe('adaptive')
    expect(resolveOrtPrefetchStrategy('unexpected')).toBe('adaptive')
    expect(resolveOrtPrefetchStrategy('eager')).toBe('eager')
    expect(resolveOrtPrefetchStrategy('off')).toBe('off')
    expect(resolveOrtPrefetchStrategy(' EAGER ')).toBe('eager')
    expect(resolveOrtPrefetchStrategy('OFF')).toBe('off')
  })

  it('applies strategy behavior with connection heuristics', () => {
    expect(shouldPrefetchOrtCore('eager', { effectiveType: '2g', saveData: true })).toBe(true)
    expect(shouldPrefetchOrtCore('off', { effectiveType: '4g', saveData: false })).toBe(false)

    expect(shouldPrefetchOrtCore('adaptive', null)).toBe(true)
    expect(shouldPrefetchOrtCore('adaptive', { effectiveType: '4g', saveData: false })).toBe(true)
    expect(shouldPrefetchOrtCore('adaptive', { effectiveType: '3g', saveData: false })).toBe(false)
    expect(shouldPrefetchOrtCore('adaptive', { effectiveType: '4g', saveData: true })).toBe(false)
  })
})
