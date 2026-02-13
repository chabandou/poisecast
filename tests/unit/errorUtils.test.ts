import { describe, expect, it } from 'vitest'
import {
  coerceErrorMessage,
  normalizeIssueCardDetail,
  normalizeIssueDetail,
} from '../../src/features/system/errors'

describe('error utils', () => {
  it('coerces unknown values into messages', () => {
    expect(coerceErrorMessage(new Error('boom'))).toBe('boom')
    expect(coerceErrorMessage('text')).toBe('text')
    expect(coerceErrorMessage(null)).toBe('Unknown error')
  })

  it('normalizes detail lines for cards and inline views', () => {
    expect(normalizeIssueCardDetail('  line 1\nline 2  ')).toBe('line 1\nline 2')
    expect(normalizeIssueDetail(' line 1\nline 2 ', 6)).toBe('line 1')
  })
})
