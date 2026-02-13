export type LatestAsyncState = {
  seq: number
  controller: AbortController | null
}

export type LatestAsyncRun = {
  seq: number
  controller: AbortController
  signal: AbortSignal
}

export function createLatestAsyncState(): LatestAsyncState {
  return {
    seq: 0,
    controller: null,
  }
}

export function startLatestAsyncRun(state: LatestAsyncState): LatestAsyncRun {
  state.seq += 1
  state.controller?.abort()
  const controller = new AbortController()
  state.controller = controller
  return {
    seq: state.seq,
    controller,
    signal: controller.signal,
  }
}

export function isLatestAsyncRunActive(state: LatestAsyncState, run: LatestAsyncRun): boolean {
  return state.seq === run.seq && state.controller === run.controller && !run.signal.aborted
}

export function finishLatestAsyncRun(state: LatestAsyncState, run: LatestAsyncRun): void {
  if (state.seq === run.seq && state.controller === run.controller) {
    state.controller = null
  }
}

export function cancelLatestAsyncRun(state: LatestAsyncState): void {
  state.seq += 1
  state.controller?.abort()
  state.controller = null
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
