// AudioWorkletProcessor runs on the audio rendering thread.
// Keep it minimal: buffer input into model-sized frames, hand off inference to the main thread,
// and output processed samples when available.

// TS doesn't type-check AudioWorkletProcessor globals when compiling under the default DOM lib.
// Declare the minimal subset we use.
declare const sampleRate: number
declare function registerProcessor(name: string, ctor: any): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
}

type FrameMsg = { type: 'frame'; id: number; audio: ArrayBuffer }
type ResultMsg = { type: 'result'; id: number; audio: ArrayBuffer }
type SetEnabledMsg = { type: 'setEnabled'; enabled: boolean }
type SetWarmupMsg = { type: 'setWarmupMs'; warmupMs: number }
type MainMsg = ResultMsg | SetEnabledMsg | SetWarmupMsg

class FloatRingBuffer {
  private buf: Float32Array
  private r = 0
  private w = 0
  private len = 0

  constructor(capacity: number) {
    this.buf = new Float32Array(capacity)
  }

  get size() {
    return this.len
  }

  clear() {
    this.r = 0
    this.w = 0
    this.len = 0
  }

  push(src: Float32Array) {
    if (src.length > this.buf.length - this.len) {
      // Drop oldest data to make room (better than exploding memory).
      const drop = src.length - (this.buf.length - this.len)
      this.consume(drop)
    }

    for (let i = 0; i < src.length; i++) {
      this.buf[this.w] = src[i]
      this.w = (this.w + 1) % this.buf.length
    }
    this.len += src.length
  }

  read(out: Float32Array) {
    const n = Math.min(out.length, this.len)
    for (let i = 0; i < n; i++) {
      out[i] = this.buf[this.r]
      this.r = (this.r + 1) % this.buf.length
    }
    this.len -= n
    // If we couldn't fill, zero the tail.
    for (let i = n; i < out.length; i++) out[i] = 0
  }

  consume(n: number) {
    const k = Math.min(n, this.len)
    this.r = (this.r + k) % this.buf.length
    this.len -= k
  }
}

type ProcessorOptions = {
  frameSize: number
  maxInFlight?: number
}

class DenoiseProcessor extends AudioWorkletProcessor {
  private enabled = false
  private frameSize: number
  private warmupMs: number
  private warmupSamplesRemaining = 0

  private inRing = new FloatRingBuffer(48000) // ~1s @ 48k
  private outRing = new FloatRingBuffer(48000) // ~1s @ 48k

  private nextId = 1
  private maxInFlight: number
  private inFlight = 0

  constructor(options: AudioWorkletNodeOptions) {
    super()
    const opts = (options.processorOptions ?? {}) as Partial<ProcessorOptions>
    this.frameSize = Math.max(32, Math.floor(opts.frameSize ?? 480))
    this.maxInFlight = Math.max(1, Math.floor(opts.maxInFlight ?? 4))
    this.warmupMs = 250

    this.port.onmessage = (evt: MessageEvent<MainMsg>) => {
      const msg = evt.data as MainMsg
      if (msg.type === 'setEnabled') {
        this.enabled = msg.enabled
        if (this.enabled) {
          this.inRing.clear()
          this.outRing.clear()
          this.inFlight = 0
          this.warmupSamplesRemaining = Math.floor((this.warmupMs / 1000) * sampleRate)
        }
        return
      }
      if (msg.type === 'setWarmupMs') {
        this.warmupMs = Math.max(0, msg.warmupMs | 0)
        return
      }
      if (msg.type === 'result') {
        if (this.inFlight > 0) this.inFlight--
        const out = new Float32Array(msg.audio)
        this.outRing.push(out)
        return
      }
    }
  }

  private sendFramesIfPossible() {
    // Keep the pipeline small and bounded. If we can't keep up, it will degrade (warmup + drop policy).
    while (this.enabled && this.inRing.size >= this.frameSize && this.inFlight < this.maxInFlight) {
      const frame = new Float32Array(this.frameSize)
      this.inRing.read(frame)
      const msg: FrameMsg = { type: 'frame', id: this.nextId++, audio: frame.buffer }
      this.inFlight++
      this.port.postMessage(msg, [frame.buffer])
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const output = outputs[0]
    const outL = output?.[0]
    const outR = output?.[1] ?? output?.[0]

    if (!outL || !outR) return true

    const inL = input?.[0]
    const inR = input?.[1]
    const n = outL.length

    if (this.enabled) {
      // Downmix to mono and buffer for inference.
      const mono = new Float32Array(n)
      if (inL && inR) {
        for (let i = 0; i < n; i++) mono[i] = 0.5 * (inL[i] + inR[i])
      } else if (inL) {
        mono.set(inL)
      } else {
        mono.fill(0)
      }

      this.inRing.push(mono)
      this.sendFramesIfPossible()

      // During warmup, output silence to avoid time misalignment between dry and processed audio.
      if (this.warmupSamplesRemaining > 0) {
        const k = Math.min(n, this.warmupSamplesRemaining)
        this.warmupSamplesRemaining -= k
        outL.fill(0)
        outR.fill(0)
        return true
      }

      // Output processed audio (mono duplicated).
      const outBlock = new Float32Array(n)
      if (this.outRing.size >= n) {
        this.outRing.read(outBlock)
        outL.set(outBlock)
        outR.set(outBlock)
      } else {
        // Not enough processed audio yet; hold silence (keeps continuity without desync).
        outL.fill(0)
        outR.fill(0)
      }
      return true
    }

    // Bypass: preserve stereo if available.
    if (inL && inR) {
      outL.set(inL)
      outR.set(inR)
    } else if (inL) {
      outL.set(inL)
      outR.set(inL)
    } else {
      outL.fill(0)
      outR.fill(0)
    }
    return true
  }
}

// eslint-disable-next-line no-restricted-globals
registerProcessor('poisecast-denoise', DenoiseProcessor)
