import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Feed</title>
    <description>Feed for tests</description>
    <image><url>https://example.com/art.png</url></image>
    <category>Technology</category>
    <item>
      <guid>ep-1</guid>
      <title>Episode One</title>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" />
      <pubDate>Fri, 01 Jan 2025 00:00:00 GMT</pubDate>
      <itunes:duration>00:10:00</itunes:duration>
      <description>Episode description</description>
    </item>
  </channel>
</rss>`

describe('App smoke', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => undefined)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = typeof input === 'string' ? new Request(input, init) : input instanceof URL ? new Request(input, init) : input
      const url = request.url
      const method = (request.method || 'GET').toUpperCase()

      if (url.includes('/api/itunes') || url.includes('itunes.apple.com')) {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.endsWith('.wasm') || url.includes('/ort/')) {
        return new Response(method === 'HEAD' ? null : new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'application/wasm', 'content-length': '1' },
        })
      }

      return new Response(RSS_XML, {
        status: 200,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      })
    })
  })

  afterEach(() => {
    delete (
      window as Window & {
        __POISECAST_TEST_HOOKS__?: { onAppRender?: () => void }
      }
    ).__POISECAST_TEST_HOOKS__
    vi.restoreAllMocks()
  })

  it('renders app shell and loads initial feed', async () => {
    render(<App />)

    expect(screen.getByText(/Poisecast/i)).toBeInTheDocument()
    expect(screen.getAllByText('Library').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
  })

  it('does not re-render App on audio timeline updates', async () => {
    const onAppRender = vi.fn()
    ;(
      window as Window & {
        __POISECAST_TEST_HOOKS__?: { onAppRender?: () => void }
      }
    ).__POISECAST_TEST_HOOKS__ = { onAppRender }

    const { container } = render(<App />)

    await waitFor(() => {
      expect(container.querySelector('.pcSourceItem')).not.toBeNull()
    })
    fireEvent.click(container.querySelector('.pcSourceItem') as HTMLElement)

    const episodeTitle = await screen.findByText(/Episode One/i)
    fireEvent.click(episodeTitle)

    const audio = container.querySelector('audio')
    expect(audio).not.toBeNull()
    const audioElement = audio as HTMLAudioElement

    await waitFor(() => {
      expect(onAppRender).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(audioElement.getAttribute('src')).toBeTruthy()
    })

    const renderCountBefore = onAppRender.mock.calls.length
    Object.defineProperty(audioElement, 'duration', {
      configurable: true,
      value: 600,
    })
    for (const currentTime of [42, 48, 55, 61, 70]) {
      Object.defineProperty(audioElement, 'currentTime', {
        configurable: true,
        value: currentTime,
      })
      await act(async () => {
        audioElement.dispatchEvent(new Event('timeupdate'))
      })
    }

    const renderCountAfter = onAppRender.mock.calls.length
    expect(renderCountAfter - renderCountBefore).toBeLessThanOrEqual(1)
  })
})
