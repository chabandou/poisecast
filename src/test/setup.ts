import '@testing-library/jest-dom/vitest'

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

if (!globalThis.ResizeObserver) {
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  })
}

if (!navigator.mediaSession) {
  const mediaSessionMock: MediaSession = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: () => {},
    setPositionState: () => {},
  } as unknown as MediaSession

  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: mediaSessionMock,
  })
}

if (!globalThis.MediaMetadata) {
  class MediaMetadataMock {
    title?: string
    artist?: string
    album?: string
    artwork?: MediaImage[]

    constructor(init?: MediaMetadataInit) {
      this.title = init?.title
      this.artist = init?.artist
      this.album = init?.album
      this.artwork = init?.artwork
    }
  }

  Object.defineProperty(globalThis, 'MediaMetadata', {
    writable: true,
    configurable: true,
    value: MediaMetadataMock,
  })
}
