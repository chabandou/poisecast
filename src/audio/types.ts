export type InferenceBackend = 'webgpu' | 'webgl' | 'wasm'

export type WorkerInitMsg = {
  type: 'init'
  modelUrl: string
  preferredBackends: InferenceBackend[]
}

export type WorkerReadyMsg = {
  type: 'ready'
  backend: InferenceBackend
  frameSize: number
  hasState: boolean
}

export type WorkerProcessMsg = {
  type: 'process'
  id: number
  audio: ArrayBuffer // Float32Array buffer, frameSize samples
}

export type WorkerResultMsg = {
  type: 'result'
  id: number
  audio: ArrayBuffer // Float32Array buffer, frameSize samples
}

export type WorkerErrorMsg = {
  type: 'error'
  message: string
}

export type WorkerMsg = WorkerInitMsg | WorkerProcessMsg
export type WorkerReply = WorkerReadyMsg | WorkerResultMsg | WorkerErrorMsg

export type WorkletFrameMsg = {
  type: 'frame'
  id: number
  audio: ArrayBuffer // Float32Array buffer
}

export type WorkletSetEnabledMsg = { type: 'setEnabled'; enabled: boolean }
export type WorkletSetWarmupMsg = { type: 'setWarmupMs'; warmupMs: number }

export type MainToWorkletMsg = WorkletSetEnabledMsg | WorkletSetWarmupMsg | WorkerResultMsg
