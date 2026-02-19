import { afterEach, describe, expect, it, vi } from 'vitest'
import { corsProbe, probeStreamProxy } from '../../src/features/audio/audioPlaybackNetwork'

describe('audioPlaybackNetwork probes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('treats cross-origin non-2xx HEAD responses as CORS-capable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 403 }),
    )

    await expect(corsProbe('https://audio.example.com/episode.mp3')).resolves.toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to plain GET when HEAD and ranged GET fail for corsProbe', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('HEAD blocked'))
      .mockRejectedValueOnce(new TypeError('Range blocked'))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }))

    await expect(corsProbe('https://audio.example.com/episode.mp3')).resolves.toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('returns false for corsProbe when all probe requests fail', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('HEAD blocked'))
      .mockRejectedValueOnce(new TypeError('Range blocked'))
      .mockRejectedValueOnce(new TypeError('GET blocked'))

    await expect(corsProbe('https://audio.example.com/episode.mp3')).resolves.toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('accepts 416 ranged proxy probe as available', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 416 }),
    )

    await expect(probeStreamProxy('/api/stream?url=https%3A%2F%2Faudio.example.com%2Fepisode.mp3'))
      .resolves.toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to plain GET when ranged and HEAD proxy probes are not ok', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }))

    await expect(probeStreamProxy('/api/stream?url=https%3A%2F%2Faudio.example.com%2Fepisode.mp3'))
      .resolves.toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })
})
