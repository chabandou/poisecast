import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStreamProxyCoreFromEnv } from '../../api/shared/streamProxyCore'

describe('stream proxy core', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('blocks local/private targets and allows public http/https', () => {
    const core = createStreamProxyCoreFromEnv({} as NodeJS.ProcessEnv)

    expect(core.parseTarget('https://example.com/audio.mp3')).not.toBeNull()
    expect(core.parseTarget('http://127.0.0.1/audio.mp3')).toBeNull()
    expect(core.parseTarget('https://localhost/audio.mp3')).toBeNull()
    expect(core.parseTarget('file:///tmp/audio.mp3')).toBeNull()
  })

  it('enforces rate limit windows', () => {
    const core = createStreamProxyCoreFromEnv({
      STREAM_PROXY_RATE_MAX_REQUESTS: '1',
      STREAM_PROXY_RATE_WINDOW_MS: '60000',
      STREAM_PROXY_RATE_BLOCK_MS: '60000',
    } as NodeJS.ProcessEnv)

    expect(core.tryAcquireRateSlot('1.1.1.1').ok).toBe(true)
    const second = core.tryAcquireRateSlot('1.1.1.1')
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.retryAfterSeconds).toBeGreaterThan(0)
    }
  })

  it('enforces redirect host policy on each hop', async () => {
    const core = createStreamProxyCoreFromEnv({
      STREAM_PROXY_ALLOWLIST: '*.allowed.example',
    } as NodeJS.ProcessEnv)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://blocked.example/audio.mp3' },
      }),
    )

    await expect(
      core.fetchWithSafeRedirects(new URL('https://pod.allowed.example/start.mp3'), {
        method: 'GET',
      }),
    ).rejects.toThrow(/Blocked redirect target/)
  })

  it('allows redirects that remain within policy', async () => {
    const core = createStreamProxyCoreFromEnv({
      STREAM_PROXY_ALLOWLIST: '*.allowed.example',
    } as NodeJS.ProcessEnv)

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const requestUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (requestUrl.includes('/start.mp3')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://media.allowed.example/final.mp3' },
        })
      }
      return new Response(new Uint8Array([1]), { status: 200 })
    })

    const response = await core.fetchWithSafeRedirects(new URL('https://pod.allowed.example/start.mp3'), {
      method: 'GET',
    })

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('blocks redirects to private targets', async () => {
    const core = createStreamProxyCoreFromEnv({} as NodeJS.ProcessEnv)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/audio.mp3' },
      }),
    )

    await expect(
      core.fetchWithSafeRedirects(new URL('https://example.com/start.mp3'), {
        method: 'GET',
      }),
    ).rejects.toThrow(/Blocked redirect target/)
  })
})
