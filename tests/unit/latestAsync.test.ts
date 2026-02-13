import { describe, expect, it } from 'vitest'
import {
  cancelLatestAsyncRun,
  createLatestAsyncState,
  finishLatestAsyncRun,
  isLatestAsyncRunActive,
  startLatestAsyncRun,
} from '../../src/features/system/latestAsync'

describe('latestAsync', () => {
  it('invalidates older runs when a new run starts', () => {
    const state = createLatestAsyncState()
    const first = startLatestAsyncRun(state)
    expect(isLatestAsyncRunActive(state, first)).toBe(true)

    const second = startLatestAsyncRun(state)
    expect(first.signal.aborted).toBe(true)
    expect(isLatestAsyncRunActive(state, first)).toBe(false)
    expect(isLatestAsyncRunActive(state, second)).toBe(true)
  })

  it('clears active controller when the run finishes', () => {
    const state = createLatestAsyncState()
    const run = startLatestAsyncRun(state)
    expect(state.controller).toBe(run.controller)

    finishLatestAsyncRun(state, run)
    expect(state.controller).toBeNull()
  })

  it('cancels and invalidates the current run', () => {
    const state = createLatestAsyncState()
    const run = startLatestAsyncRun(state)
    cancelLatestAsyncRun(state)

    expect(run.signal.aborted).toBe(true)
    expect(isLatestAsyncRunActive(state, run)).toBe(false)
    expect(state.controller).toBeNull()
  })
})
