import type { InferenceBackend, MainToWorkletMsg, WorkletFrameMsg, WorkerReply } from './types'

export type EngineStatus =
  | { state: 'idle' }
  | { state: 'loading-model' }
  | { state: 'ready'; backend: InferenceBackend; frameSize: number }
  | { state: 'error'; message: string }

export class DenoiseEngine {
  private worker: Worker | null = null
  private ctx: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private worklet: AudioWorkletNode | null = null

  private _status: EngineStatus = { state: 'idle' }
  get status(): EngineStatus {
    return this._status
  }

  private frameSize: number | null = null

  async init(opts: { modelUrl: string; sampleRateHz: number }) {
    this._status = { state: 'loading-model' }

    const worker = new Worker(new URL('./worker/denoise.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker

    const readyPromise = new Promise<Extract<WorkerReply, { type: 'ready' }>>((resolve, reject) => {
      const onMsg = (evt: MessageEvent<WorkerReply>) => {
        const msg = evt.data
        if (msg.type === 'ready') {
          cleanup()
          resolve(msg)
          return
        }
        if (msg.type === 'error') {
          cleanup()
          reject(new Error(msg.message))
        }
      }
      const onErr = () => {
        cleanup()
        reject(new Error('Worker error'))
      }
      const cleanup = () => {
        worker.removeEventListener('message', onMsg)
        worker.removeEventListener('error', onErr)
      }
      worker.addEventListener('message', onMsg)
      worker.addEventListener('error', onErr)
    })

    worker.postMessage({
      type: 'init',
      modelUrl: opts.modelUrl,
      preferredBackends: ['webgpu', 'webgl', 'wasm'],
    })

    const ready = await readyPromise

    this._status = { state: 'ready', backend: ready.backend, frameSize: ready.frameSize }
    this.frameSize = ready.frameSize

    // Prepare audio graph lazily; AudioContext creation can be blocked until user gesture in some browsers.
    this.ctx = new AudioContext({ sampleRate: opts.sampleRateHz })
    await this.ctx.audioWorklet.addModule(new URL('./worklet/denoise-processor.ts', import.meta.url))

    this.worklet = new AudioWorkletNode(this.ctx, 'poisecast-denoise', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { frameSize: this.frameSize, maxInFlight: 4 },
    })

    // Route inference frames to the worker and return results back to worklet.
    this.worklet.port.onmessage = (evt: MessageEvent<WorkletFrameMsg>) => {
      const msg = evt.data
      if (msg.type !== 'frame') return
      this.worker?.postMessage({ type: 'process', id: msg.id, audio: msg.audio }, [msg.audio])
    }

    this.worker.addEventListener('message', (evt: MessageEvent<WorkerReply>) => {
      const msg = evt.data
      if (msg.type === 'result') {
        const toWorklet: MainToWorkletMsg = msg
        this.worklet?.port.postMessage(toWorklet, [msg.audio])
      } else if (msg.type === 'error') {
        this._status = { state: 'error', message: msg.message }
      }
    })
  }

  async attach(audioEl: HTMLAudioElement) {
    if (!this.ctx || !this.worklet) throw new Error('Engine not initialized')

    // Ensure running; on iOS/Chrome this typically requires a user gesture.
    if (this.ctx.state !== 'running') {
      await this.ctx.resume()
    }

    // MediaElementAudioSourceNode can only be created once per element per context.
    if (!this.source) {
      this.source = this.ctx.createMediaElementSource(audioEl)
      this.source.connect(this.worklet)
      this.worklet.connect(this.ctx.destination)
    }
  }

  setEnabled(enabled: boolean) {
    const msg: MainToWorkletMsg = { type: 'setEnabled', enabled }
    this.worklet?.port.postMessage(msg)
  }

  setWarmupMs(warmupMs: number) {
    const msg: MainToWorkletMsg = { type: 'setWarmupMs', warmupMs }
    this.worklet?.port.postMessage(msg)
  }

  async dispose() {
    try {
      this.setEnabled(false)
    } catch {}

    this.worklet?.disconnect()
    this.source?.disconnect()

    this.worklet = null
    this.source = null

    if (this.ctx) {
      try {
        await this.ctx.close()
      } catch {}
      this.ctx = null
    }

    this.worker?.terminate()
    this.worker = null
    this._status = { state: 'idle' }
  }
}
