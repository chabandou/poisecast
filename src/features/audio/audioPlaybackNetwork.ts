type RequestProbeOptions = {
  signal?: AbortSignal
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw new DOMException('Aborted', 'AbortError')
}

function cancelBody(res: Response): void {
  if (!res.body) return
  void res.body.cancel().catch(() => {})
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
    // Any resolved CORS-mode response proves CORS is allowed, regardless of status code.
    await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      cache: 'no-store',
      signal: options.signal,
    })
    return true
  } catch {
    throwIfAborted(options.signal)
    // Intentionally ignored; hosts often block HEAD probes.
  }

  try {
    const ranged = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
      signal: options.signal,
    })
    cancelBody(ranged)
    return true
  } catch {
    throwIfAborted(options.signal)
  }

  try {
    const full = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: options.signal,
    })
    cancelBody(full)
    return true
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
    const ranged = await fetch(proxyUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
      signal: ctrl.signal,
    })
    cancelBody(ranged)
    if (ranged.ok || ranged.status === 416) {
      return true
    }

    // Some upstreams reject/ignore ranged probes; fall back to a tiny HEAD check.
    const head = await fetch(proxyUrl, {
      method: 'HEAD',
      cache: 'no-store',
      signal: ctrl.signal,
    })
    if (head.ok) {
      return true
    }

    // Final fallback: plain GET without Range in case Range-specific handling is broken upstream.
    const full = await fetch(proxyUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    })
    cancelBody(full)
    return full.ok
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
