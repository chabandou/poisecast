type RequestProbeOptions = {
  signal?: AbortSignal
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw new DOMException('Aborted', 'AbortError')
}

export async function corsProbe(url: string, options: RequestProbeOptions = {}): Promise<boolean> {
  throwIfAborted(options.signal)
  try {
    const parsed = new URL(url, window.location.href)
    if (parsed.origin === window.location.origin) return true
  } catch {
    return false
  }

  try {
    const head = await fetch(url, { method: 'HEAD', mode: 'cors', signal: options.signal })
    if (head.ok) return true
  } catch {
    throwIfAborted(options.signal)
    // Intentionally ignored; hosts often block HEAD probes.
  }

  try {
    const get = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
      signal: options.signal,
    })
    return get.ok
  } catch {
    throwIfAborted(options.signal)
    return false
  }
}

export function buildStreamProxyUrl(sourceUrl: string): string {
  return `/api/stream?url=${encodeURIComponent(sourceUrl)}`
}

export async function probeStreamProxy(
  proxyUrl: string,
  options: RequestProbeOptions & { timeoutMs?: number } = {},
): Promise<boolean> {
  const ctrl = new AbortController()
  const onExternalAbort = () => ctrl.abort()
  if (options.signal) options.signal.addEventListener('abort', onExternalAbort, { once: true })
  if (options.signal?.aborted) ctrl.abort()

  const timer = window.setTimeout(() => ctrl.abort(), options.timeoutMs ?? 7000)
  try {
    const res = await fetch(proxyUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
      signal: ctrl.signal,
    })
    if (res.body) {
      void res.body.cancel().catch(() => {})
    }
    return res.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
    if (options.signal) options.signal.removeEventListener('abort', onExternalAbort)
  }
}

export async function waitForAudioMetadata(
  audioEl: HTMLAudioElement,
  timeoutMs = 12_000,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  if (audioEl.readyState >= 1) return

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let timer = 0

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      audioEl.removeEventListener('loadedmetadata', onLoaded)
      audioEl.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      if (timer) window.clearTimeout(timer)
      fn()
    }

    const onLoaded = () => finish(resolve)
    const onError = () => {
      const code = audioEl.error?.code
      finish(() =>
        reject(
          new Error(
            `Audio metadata load failed${code ? ` (media error ${code})` : ''}`,
          ),
        ),
      )
    }
    const onAbort = () => {
      finish(() => reject(new DOMException('Aborted', 'AbortError')))
    }

    audioEl.addEventListener('loadedmetadata', onLoaded, { once: true })
    audioEl.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = window.setTimeout(() => {
      finish(() => reject(new Error('Timed out waiting for episode metadata')))
    }, timeoutMs)
  })
}
