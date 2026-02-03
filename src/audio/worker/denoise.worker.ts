/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web'
import type {
  InferenceBackend,
  WorkerInitMsg,
  WorkerProcessMsg,
  WorkerReadyMsg,
  WorkerReply,
} from '../types'

type InputMeta = { dimensions?: Array<number | string | null>; type?: string }

type IoSpec = {
  audioInName: string
  stateInName?: string
  attenInName?: string
  audioOutName: string
  stateOutName?: string
  frameSize: number
  stateSize?: number
}

let session: ort.InferenceSession | null = null
let backend: InferenceBackend | null = null
let ioSpec: IoSpec | null = null
let state: Float32Array | null = null

function post(msg: WorkerReply, transfer?: Transferable[]) {
  // eslint-disable-next-line no-restricted-globals
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? [])
}

function configureOrtWasm() {
  // Avoid cross-origin isolation requirements in v1; stay single-threaded.
  ort.env.wasm.numThreads = 1
  // Vite blocks importing .wasm from package exports in some builds.
  // We ship the needed runtime WASM files in `public/ort/`.
  ort.env.wasm.wasmPaths = '/ort/' as any
}

function pickIoSpec(sess: ort.InferenceSession): IoSpec {
  const inputMetadata = (sess as any).inputMetadata as Record<string, InputMeta> | undefined
  const outputMetadata = (sess as any).outputMetadata as Record<string, InputMeta> | undefined

  const inputNames = (sess as any).inputNames as string[] | undefined
  const outputNames = (sess as any).outputNames as string[] | undefined

  if (!inputNames?.length || !outputNames?.length || !inputMetadata || !outputMetadata) {
    // Minimal fallback for known time-domain model signature.
    return {
      audioInName: 'input_frame',
      stateInName: 'states',
      attenInName: 'atten_lim_db',
      audioOutName: outputNames?.[0] ?? 'enhanced_audio_frame',
      stateOutName: outputNames?.[1],
      frameSize: 480,
      stateSize: 45_304,
    }
  }

  // Identify 1D float input with a small fixed-ish dimension as audio.
  const candidates = inputNames
    .map((name) => [name, inputMetadata[name]] as const)
    .filter(([, meta]) => meta?.type?.includes('float') || meta?.type === 'tensor(float)')

  const audioIn = candidates.find(([, meta]) => {
    const d = meta.dimensions ?? []
    return d.length === 1 && typeof d[0] === 'number' && d[0] > 32 && d[0] < 4096
  })
  const stateIn = candidates.find(([, meta]) => {
    const d = meta.dimensions ?? []
    return d.length === 1 && typeof d[0] === 'number' && d[0] >= 4096
  })
  const attenIn = candidates.find(([, meta]) => {
    const d = meta.dimensions ?? []
    return d.length === 0 || (d.length === 1 && (d[0] === 1 || d[0] === null || d[0] === '1'))
  })

  const audioInName = audioIn?.[0] ?? inputNames[0]
  const frameSize =
    (typeof audioIn?.[1]?.dimensions?.[0] === 'number' ? (audioIn?.[1]?.dimensions?.[0] as number) : 480)

  const stateInName = stateIn?.[0]
  const stateSize =
    typeof stateIn?.[1]?.dimensions?.[0] === 'number' ? (stateIn?.[1]?.dimensions?.[0] as number) : undefined

  // Outputs: pick the 1D float output with dimension ~= frameSize as audio.
  const outCandidates = outputNames
    .map((name) => [name, outputMetadata[name]] as const)
    .filter(([, meta]) => meta?.type?.includes('float') || meta?.type === 'tensor(float)')

  const audioOut =
    outCandidates.find(([, meta]) => {
      const d = meta.dimensions ?? []
      return d.length === 1 && typeof d[0] === 'number' && d[0] === frameSize
    }) ?? outCandidates[0]

  const stateOut =
    outCandidates.find(([, meta]) => {
      const d = meta.dimensions ?? []
      return d.length === 1 && typeof d[0] === 'number' && stateSize && d[0] === stateSize
    }) ?? outCandidates[1]

  return {
    audioInName,
    stateInName,
    attenInName: attenIn?.[0],
    audioOutName: audioOut?.[0] ?? outputNames[0],
    stateOutName: stateOut?.[0],
    frameSize,
    stateSize,
  }
}

async function init(msg: WorkerInitMsg) {
  try {
    configureOrtWasm()

    const tryProviders: Array<{ backend: InferenceBackend; providers: string[] }> = []
    for (const b of msg.preferredBackends) {
      if (b === 'webgpu') tryProviders.push({ backend: 'webgpu', providers: ['webgpu'] })
      if (b === 'webgl') tryProviders.push({ backend: 'webgl', providers: ['webgl'] })
      if (b === 'wasm') tryProviders.push({ backend: 'wasm', providers: ['wasm'] })
    }
    if (!tryProviders.length) tryProviders.push({ backend: 'wasm', providers: ['wasm'] })

    const errs: Array<{ backend: InferenceBackend; message: string }> = []
    for (const option of tryProviders) {
      try {
        const s = await ort.InferenceSession.create(msg.modelUrl, {
          executionProviders: option.providers as any,
          graphOptimizationLevel: 'all',
        } as any)
        session = s
        backend = option.backend
        break
      } catch (e) {
        errs.push({
          backend: option.backend,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }

    if (!session || !backend) {
      const detail =
        errs.length > 0
          ? errs.map((e) => `- ${e.backend}: ${e.message}`).join('\n')
          : '(no details)'
      throw new Error(`No available backend found.\n${detail}`)
    }

    ioSpec = pickIoSpec(session)

    // Time-domain models in this repo maintain a state vector. If not present, run stateless.
    if (ioSpec.stateInName && ioSpec.stateSize) {
      state = new Float32Array(ioSpec.stateSize)
    } else {
      state = null
    }

    const ready: WorkerReadyMsg = {
      type: 'ready',
      backend,
      frameSize: ioSpec.frameSize,
      hasState: Boolean(state),
    }
    post(ready)
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

async function processFrame(msg: WorkerProcessMsg) {
  if (!session || !ioSpec) return

  try {
    const frame = new Float32Array(msg.audio)
    if (frame.length !== ioSpec.frameSize) {
      // Keep things moving even if sizing is off.
      post({ type: 'result', id: msg.id, audio: msg.audio } as WorkerReply, [msg.audio])
      return
    }

    const feeds: Record<string, ort.Tensor> = {
      [ioSpec.audioInName]: new ort.Tensor('float32', frame, [ioSpec.frameSize]),
    }

    if (ioSpec.stateInName && state && ioSpec.stateSize) {
      feeds[ioSpec.stateInName] = new ort.Tensor('float32', state, [ioSpec.stateSize])
    }

    if (ioSpec.attenInName) {
      // Matches the desktop app's atten_lim_db default.
      const atten = new Float32Array([-60.0])
      feeds[ioSpec.attenInName] = new ort.Tensor('float32', atten, [1])
    }

    const outputs = await session.run(feeds)

    const outAny = outputs[ioSpec.audioOutName] ?? outputs[(session as any).outputNames?.[0]]
    const out = outAny?.data as Float32Array | undefined
    if (!out) {
      post({ type: 'result', id: msg.id, audio: msg.audio } as WorkerReply, [msg.audio])
      return
    }

    // Update state, if present.
    if (ioSpec.stateOutName && state) {
      const stateAny = outputs[ioSpec.stateOutName]
      const nextState = stateAny?.data as Float32Array | undefined
      if (nextState && nextState.length === state.length) {
        state.set(nextState)
      }
    }

    // Clamp to [-1, 1] to avoid blasting output on unexpected models.
    const outCopy = new Float32Array(ioSpec.frameSize)
    for (let i = 0; i < outCopy.length; i++) {
      const v = out[i] ?? 0
      outCopy[i] = v > 1 ? 1 : v < -1 ? -1 : v
    }

    post({ type: 'result', id: msg.id, audio: outCopy.buffer }, [outCopy.buffer])
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) })
    // Fall back to passthrough to avoid stalling the audio thread.
    post({ type: 'result', id: msg.id, audio: msg.audio } as WorkerReply, [msg.audio])
  }
}

// eslint-disable-next-line no-restricted-globals
self.onmessage = (evt: MessageEvent<WorkerInitMsg | WorkerProcessMsg>) => {
  const msg = evt.data
  if (msg.type === 'init') {
    void init(msg)
    return
  }
  if (msg.type === 'process') {
    void processFrame(msg)
  }
}
