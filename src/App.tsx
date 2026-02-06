import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'

import { DEFAULT_FEEDS, type DefaultFeed } from './podcasts/defaultFeeds'
import { searchApplePodcasts, type ApplePodcastResult } from './podcasts/appleSearch'
import { fetchAndParseRss } from './podcasts/rss'
import type { ParsedPodcast, PodcastEpisode } from './podcasts/types'

import { MODELS } from './models/models'
import { DenoiseEngine } from './audio/engine'

import {
  IconList,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRss,
  IconSearch,
  IconUpload,
  IconWave,
} from './ui/icons'
import { useLottie } from './ui/useLottie'
import playLoadingAnim from './assets/lottie/play-loading.json'
import controlHoverAnim from './assets/lottie/control-hover.json'

type MobileTab = 'search' | 'sources' | 'playing' | 'episodes'
type SidebarTab = 'sources' | 'search'
type NowState = 'idle' | 'active' | 'paused'

type SearchResultsProps = {
  results: ApplePodcastResult[]
  rssLoading: boolean
  loadingFeedUrl: string | null
  onSelect: (result: ApplePodcastResult) => void
}

type BeforeInstallPromptEvent = Event & {
  platforms: string[]
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

const fetchFeedArtwork = async (rssUrl: string): Promise<string | null> => {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?entity=podcast&feedUrl=${encodeURIComponent(rssUrl)}`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as { results?: Array<{ artworkUrl600?: string; artworkUrl512?: string; artworkUrl100?: string }> }
    const item = data?.results?.[0]
    return item?.artworkUrl600 || item?.artworkUrl512 || item?.artworkUrl100 || null
  } catch {
    return null
  }
}

const SearchResults = memo(function SearchResults({ results, rssLoading, loadingFeedUrl, onSelect }: SearchResultsProps) {
  if (!results.length) return null
  return (
    <div className="pcSearchResults">
      {results.map((r) => {
        const isLoading = !!loadingFeedUrl && r.feedUrl === loadingFeedUrl
        return (
          <button
            key={r.collectionId}
            className={`pcSearchItem pcChamfer ${isLoading ? 'isLoading' : ''}`}
            disabled={!r.feedUrl || rssLoading || isLoading}
            title={r.feedUrl ? r.feedUrl : 'No RSS URL provided by Apple for this result'}
            onClick={() => {
              if (!r.feedUrl) return
              onSelect(r)
            }}
          >
            <div className="pcSearchItemTitle">{r.collectionName}</div>
            <div className="pcSearchItemMeta">
              {r.artistName ? <span className="pcPill">{r.artistName}</span> : null}
              {r.primaryGenreName ? <span className="pcPill">{r.primaryGenreName}</span> : null}
              {r.collectionViewUrl ? (
                <a
                  className="pcLink"
                  href={r.collectionViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open in Apple
                </a>
              ) : null}
            </div>
            {r.feedUrl ? <div className="pcMonoUrl">{r.feedUrl}</div> : null}
            {isLoading ? <div className="pcItemStatus">LOADING…</div> : null}
          </button>
        )
      })}
    </div>
  )
})

type SourceListProps = {
  feeds: DefaultFeed[]
  activeUrl: string
  rssLoading: boolean
  loadingFeedUrl: string | null
  imageByUrl?: Record<string, string>
  showThumbs?: boolean
  onSelect: (feed: DefaultFeed) => void
}

const SourceList = memo(function SourceList({
  feeds,
  activeUrl,
  rssLoading,
  loadingFeedUrl,
  imageByUrl,
  showThumbs = false,
  onSelect,
}: SourceListProps) {
  return (
    <div className="pcSourceList">
      {feeds.map((f) => {
        const isLoading = !!loadingFeedUrl && f.rssUrl === loadingFeedUrl
        const thumbUrl = showThumbs ? imageByUrl?.[f.rssUrl] ?? '' : ''
        return (
          <button
            key={f.rssUrl}
            className={`pcSourceItem pcChamfer ${activeUrl === f.rssUrl ? 'active' : ''} ${isLoading ? 'isLoading' : ''}`}
            disabled={rssLoading || isLoading}
            onClick={() => onSelect(f)}
          >
            {showThumbs ? (
              <div className="pcSourceThumb" aria-hidden="true">
                {thumbUrl ? <img src={thumbUrl} alt="" loading="lazy" /> : <IconRss size={20} />}
              </div>
            ) : null}
            <div className="pcSourceItemTitle">{f.title}</div>
            {f.category ? (
              <div className="pcSourceItemMeta">
                <span className="pcPill">{f.category}</span>
              </div>
            ) : null}
            <div className="pcMonoUrl">{f.rssUrl}</div>
            {isLoading ? <div className="pcItemStatus">LOADING…</div> : null}
          </button>
        )
      })}
    </div>
  )
})

type EpisodeListProps = {
  items: ReactNode
  hasEpisodes: boolean
}

const EpisodeList = memo(function EpisodeList({ items, hasEpisodes }: EpisodeListProps) {
  return (
    <div className="pcEpisodeList">
      {items}
      {!hasEpisodes ? <div className="pcEmpty">No episodes. Load a feed.</div> : null}
    </div>
  )
})

function useIsMobile(maxWidthPx = 980): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(`(max-width:${maxWidthPx}px)`).matches)
  useEffect(() => {
    const m = window.matchMedia(`(max-width:${maxWidthPx}px)`)
    const onChange = () => setIsMobile(m.matches)
    onChange()
    m.addEventListener?.('change', onChange)
    return () => m.removeEventListener?.('change', onChange)
  }, [maxWidthPx])
  return isMobile
}

function formatClock(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds as number)) return '--:--'
  const s = Math.max(0, Math.floor(seconds as number))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return h > 0 ? `${h}:${pad2(m)}:${pad2(ss)}` : `${m}:${pad2(ss)}`
}

function splitTitle(title: string): { head: string; accent?: string } {
  const t = title.trim()
  if (!t) return { head: '—' }
  const seps = [': ', ' - ', ' — ']
  for (const sep of seps) {
    const i = t.indexOf(sep)
    if (i > 10 && i < t.length - 8) {
      return { head: t.slice(0, i + sep.length).trimEnd(), accent: t.slice(i + sep.length).trim() }
    }
  }
  return { head: t }
}

function useScrambleText(text: string, durationMs = 700): string {
  const [display, setDisplay] = useState(text)
  const rafRef = useRef<number | null>(null)
  const scrambleRef = useRef<number[]>([])
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&'

  useEffect(() => {
    if (!text) {
      setDisplay(text)
      return
    }

    const chars = text.split('')
    const reveals = chars.map((ch, i) => {
      if (!/[A-Za-z0-9]/.test(ch)) return 0
      const base = i / Math.max(1, chars.length - 1)
      return Math.min(1, base * 0.65 + Math.random() * 0.35)
    })
    scrambleRef.current = reveals

    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      const next = chars
        .map((ch, i) => {
          if (!/[A-Za-z0-9]/.test(ch)) return ch
          if (p >= (scrambleRef.current[i] ?? 0)) return ch
          return charset[Math.floor(Math.random() * charset.length)]
        })
        .join('')
      setDisplay(next)
      if (p < 1) {
        rafRef.current = window.requestAnimationFrame(tick)
      } else {
        setDisplay(text)
      }
    }

    rafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    }
  }, [text, durationMs])

  return display
}

async function corsProbe(url: string): Promise<boolean> {
  // Same-origin is always fine.
  try {
    const u = new URL(url, window.location.href)
    if (u.origin === window.location.origin) return true
  } catch {
    return false
  }

  // Many hosts block CORS; try a cheap probe (HEAD then a 1-byte ranged GET).
  try {
    const head = await fetch(url, { method: 'HEAD', mode: 'cors' })
    if (head.ok) return true
  } catch {}

  try {
    const get = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
    })
    return get.ok
  } catch {
    return false
  }
}

function isStandaloneMode(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function getInstallHelpMessage(): string {
  const ua = window.navigator.userAgent
  const isAndroid = /Android/i.test(ua)
  const isWindows = /Windows/i.test(ua)
  const isIOS = /iPad|iPhone|iPod/i.test(ua)
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua)
  const isFirefox = /Firefox|FxiOS/i.test(ua)

  if (isFirefox && isWindows) {
    return 'Firefox on Windows: click the Web Apps button in the address bar to install this site. If it is missing, update Firefox and use a regular (non-private) window.'
  }
  if (isFirefox && isAndroid) {
    return 'Firefox on Android: open the browser menu, then choose Install or Add to Home screen.'
  }
  if (isIOS && isSafari) {
    return 'Safari on iOS: tap Share, then choose "Add to Home Screen".'
  }
  if (isFirefox) {
    return 'Firefox web-app install is currently available on Windows desktop and Android. On this device, use Chrome or Edge.'
  }
  return 'If no prompt appears, open your browser menu and choose "Install app" or "Add to Home screen".'
}

const MODEL_CACHE_NAME = 'poisecast-assets'
const AUDIO_FILE_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,.webm,.m4b,.mp4'
const MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/webm': '.webm',
}

async function cacheModelOnDemand(modelUrl: string): Promise<void> {
  if (!('caches' in window)) return

  const absoluteUrl = new URL(modelUrl, window.location.href).toString()
  const cache = await caches.open(MODEL_CACHE_NAME)
  const hit = await cache.match(absoluteUrl, { ignoreSearch: true })
  if (hit) return

  const res = await fetch(absoluteUrl, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Model download failed (${res.status})`)
  }
  await cache.put(absoluteUrl, res.clone())
}

function isLikelyAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true
  return /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|webm|m4b|mp4)$/i.test(file.name)
}

function sanitizeFileName(value: string): string {
  const clean = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clean || 'episode'
}

function inferAudioExtension(url: string, mimeType?: string): string {
  if (mimeType) {
    const normalized = mimeType.toLowerCase().split(';', 1)[0]
    const mapped = MIME_TO_EXT[normalized]
    if (mapped) return mapped
  }

  try {
    const pathname = new URL(url, window.location.href).pathname
    const match = pathname.match(/\.([A-Za-z0-9]{2,8})$/)
    if (match) return `.${match[1].toLowerCase()}`
  } catch {
    // Ignore parse failures and fall back to mp3.
  }

  return '.mp3'
}

function buildStreamProxyUrl(sourceUrl: string): string {
  return `/api/stream?url=${encodeURIComponent(sourceUrl)}`
}

function isSameOriginUrl(value: string): boolean {
  try {
    return new URL(value, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

async function probeStreamProxy(proxyUrl: string): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 7000)
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
  }
}

export default function App() {
  const isMobile = useIsMobile(980)
  const [mobileTab, setMobileTab] = useState<MobileTab>('sources')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('sources')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const proxyBypassRef = useRef<Set<string>>(new Set())
  const proxyVerifiedRef = useRef<Set<string>>(new Set())

  const engineRef = useRef<DenoiseEngine | null>(null)
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const searchCacheRef = useRef<Map<string, ApplePodcastResult[]>>(new Map())
  const feedCacheRef = useRef<Map<string, ParsedPodcast>>(new Map())

  const searchCacheKey = 'poisecast.searchCache.v1'
  const feedCacheKey = 'poisecast.feedCache.v1'
  const feedImageCacheKey = 'poisecast.feedImageCache.v1'
  const maxSearchCache = 50
  const maxFeedCache = 20

  const [modelId, setModelId] = useState(MODELS[0]?.id ?? 'denoiser_model')
  const model = useMemo(() => MODELS.find((m) => m.id === modelId) ?? MODELS[0], [modelId])
  const getRemotePlaybackUrl = useCallback((ep: PodcastEpisode): string => {
    if (proxyBypassRef.current.has(ep.guid)) return ep.enclosureUrl
    return buildStreamProxyUrl(ep.enclosureUrl)
  }, [])
  const warmModelCache = useCallback(async (nextModelId: string) => {
    const next = MODELS.find((m) => m.id === nextModelId)
    if (!next) return
    try {
      await cacheModelOnDemand(next.url)
    } catch {
      // Best effort: model can still be fetched normally when denoise is enabled.
    }
  }, [])
  const onModelChange = useCallback((nextModelId: string) => {
    setModelId(nextModelId)
    setEngineDetail('Switching models requires refresh (v1).')
    void warmModelCache(nextModelId)
  }, [warmModelCache])

  const [rssUrl, setRssUrl] = useState(DEFAULT_FEEDS[0]?.rssUrl ?? '')
  const [rssLoading, setRssLoading] = useState(false)
  const [rssError, setRssError] = useState<string | null>(null)
  const [podcast, setPodcast] = useState<ParsedPodcast | null>(null)
  const [episode, setEpisode] = useState<PodcastEpisode | null>(null)
  const [sourceKind, setSourceKind] = useState<'remote' | 'local'>('remote')

  const [searchTerm, setSearchTerm] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<ApplePodcastResult[]>([])
  const [loadingFeedUrl, setLoadingFeedUrl] = useState<string | null>(null)
  const [loadingEpisodeId, setLoadingEpisodeId] = useState<string | null>(null)
  const [downloadingEpisodeId, setDownloadingEpisodeId] = useState<string | null>(null)
  const [feedImages, setFeedImages] = useState<Record<string, string>>({})
  const feedImageFetchRef = useRef<Set<string>>(new Set())

  const [episodeQuery, setEpisodeQuery] = useState('')
  const deferredEpisodeQuery = useDeferredValue(episodeQuery)

  const [engineState, setEngineState] = useState<string>('idle')
  const [engineDetail, setEngineDetail] = useState<string>('')
  const [denoiseEnabled, setDenoiseEnabled] = useState(false)
  const [canDenoise, setCanDenoise] = useState<boolean | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode())

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)

  const episodesAll = podcast?.episodes ?? []
  const episodes = useMemo(() => {
    const q = deferredEpisodeQuery.trim().toLowerCase()
    if (!q) return episodesAll
    return episodesAll.filter((e) => e.title.toLowerCase().includes(q))
  }, [deferredEpisodeQuery, episodesAll])

  // Keep the status in the mobile top bar; desktop has the floating widget.
  const nowTitle = episode?.title ?? 'Select an episode'
  const split = useMemo(() => splitTitle(nowTitle), [nowTitle])
  const nowTitleRef = useRef<HTMLHeadingElement | null>(null)
  const headScramble = useScrambleText(split.head, 1000)
  const accentScramble = useScrambleText(split.accent ?? '', 1000)

  const playBtnRef = useRef<HTMLButtonElement | null>(null)
  const prevBtnRef = useRef<HTMLButtonElement | null>(null)
  const nextBtnRef = useRef<HTMLButtonElement | null>(null)
  const importBtnRef = useRef<HTMLButtonElement | null>(null)
  const denoiseBtnRef = useRef<HTMLButtonElement | null>(null)

  const releaseDate = useMemo(
    () => episode?.dateStamp ?? (sourceKind === 'local' ? 'LOCAL' : null),
    [episode?.dateStamp, sourceKind],
  )
  const releaseLabel = releaseDate ?? '—'
  const releaseScramble = useScrambleText(releaseLabel, 1000)
  const sourceLabel = sourceKind === 'local' ? 'LOCAL_FILE' : podcast?.feed.title ?? 'NO_SOURCE'
  const sourceScramble = useScrambleText(sourceLabel, 1000)
  const nowTagLabel = !episode ? 'READY' : isPlaying ? 'NOW PLAYING' : 'PAUSED'
  const nowTagScramble = useScrambleText(nowTagLabel, 1000)

  const progressPct = duration && duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0
  const timeLeft = duration && duration > 0 ? Math.max(0, duration - currentTime) : null
  const isEpisodeLoading = !!loadingEpisodeId && episode?.guid === loadingEpisodeId
  const isDenoiseLoading = engineState === 'loading-model'

  const playHoverLottie = useLottie({
    animationData: controlHoverAnim,
    loop: false,
    autoplay: false,
    playOnHover: true,
    hoverRef: playBtnRef,
  })
  const playLoadingLottie = useLottie({
    animationData: playLoadingAnim,
    loop: true,
    autoplay: true,
    enabled: isEpisodeLoading,
  })
  const prevHoverLottie = useLottie({
    animationData: controlHoverAnim,
    loop: false,
    autoplay: false,
    playOnHover: true,
    hoverRef: prevBtnRef,
  })
  const nextHoverLottie = useLottie({
    animationData: controlHoverAnim,
    loop: false,
    autoplay: false,
    playOnHover: true,
    hoverRef: nextBtnRef,
  })
  const importHoverLottie = useLottie({
    animationData: controlHoverAnim,
    loop: false,
    autoplay: false,
    playOnHover: true,
    hoverRef: importBtnRef,
  })
  const denoiseHoverLottie = useLottie({
    animationData: controlHoverAnim,
    loop: false,
    autoplay: false,
    playOnHover: true,
    hoverRef: denoiseBtnRef,
  })

  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)')
    const onModeChange = () => setIsInstalled(isStandaloneMode())
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallPrompt(null)
      setIsInstalled(true)
    }

    onModeChange()
    mode.addEventListener?.('change', onModeChange)
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      mode.removeEventListener?.('change', onModeChange)
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const triggerInstall = useCallback(async () => {
    if (installing) return
    if (!installPrompt) {
      window.alert(getInstallHelpMessage())
      return
    }
    setInstalling(true)
    try {
      await installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') setInstallPrompt(null)
    } finally {
      setInstalling(false)
    }
  }, [installPrompt, installing])

  const canInstall = !isInstalled

  useEffect(() => {
    // Default load.
    try {
      const searchRaw = localStorage.getItem(searchCacheKey)
      if (searchRaw) {
        const parsed = JSON.parse(searchRaw) as { entries: [string, ApplePodcastResult[]][] }
        if (Array.isArray(parsed?.entries)) {
          searchCacheRef.current = new Map(parsed.entries.slice(0, maxSearchCache))
        }
      }
      const feedRaw = localStorage.getItem(feedCacheKey)
      if (feedRaw) {
        const parsed = JSON.parse(feedRaw) as { entries: [string, ParsedPodcast][] }
        if (Array.isArray(parsed?.entries)) {
          feedCacheRef.current = new Map(parsed.entries.slice(0, maxFeedCache))
        }
      }
      const imageRaw = localStorage.getItem(feedImageCacheKey)
      if (imageRaw) {
        const parsed = JSON.parse(imageRaw) as Record<string, string>
        if (parsed && typeof parsed === 'object') {
          setFeedImages(parsed)
        }
      }
    } catch {}
    void loadFeed(rssUrl)
    return () => {
      void engineRef.current?.dispose()
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // On desktop we always show everything; on mobile, default to sources until playback starts.
    if (!isMobile) return
    if (episode && mobileTab === 'sources') setMobileTab('playing')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, episode])

  useEffect(() => {
    if (!isMobile || mobileTab !== 'sources') return
    const targets = DEFAULT_FEEDS.map((f) => f.rssUrl).filter((url) => !feedImages[url])
    if (!targets.length) return
    let cancelled = false

    const run = async () => {
      const queue = [...targets]
      const workers = Array.from({ length: 4 }, async () => {
        while (queue.length && !cancelled) {
          const url = queue.shift()
          if (!url || feedImages[url] || feedImageFetchRef.current.has(url)) continue
          feedImageFetchRef.current.add(url)
          const art = await fetchFeedArtwork(url)
          if (art && !cancelled) {
            setFeedImages((prev) => {
              if (prev[url] === art) return prev
              const next = { ...prev, [url]: art }
              try {
                localStorage.setItem(feedImageCacheKey, JSON.stringify(next))
              } catch {}
              return next
            })
          }
          feedImageFetchRef.current.delete(url)
        }
      })
      await Promise.all(workers)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [feedImages, feedImageCacheKey, isMobile, mobileTab])

  useEffect(() => {
    const q = searchTerm.trim()
    setSearchError(null)
    if (!q) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    const cacheKey = `${q.toLowerCase()}|10`
    const cached = searchCacheRef.current.get(cacheKey)
    if (cached) {
      setSearchResults(cached)
      setSearchLoading(false)
      return
    }

    const controller = new AbortController()
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          setSearchLoading(true)
          const results = await searchApplePodcasts(q, 10, controller.signal)
          searchCacheRef.current.set(cacheKey, results)
          if (searchCacheRef.current.size > maxSearchCache) {
            const firstKey = searchCacheRef.current.keys().next().value as string | undefined
            if (firstKey) searchCacheRef.current.delete(firstKey)
          }
          try {
            localStorage.setItem(
              searchCacheKey,
              JSON.stringify({ entries: Array.from(searchCacheRef.current.entries()) }),
            )
          } catch {}
          setSearchResults(results)
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setSearchResults([])
          setSearchError(e instanceof Error ? e.message : String(e))
        } finally {
          setSearchLoading(false)
        }
      })()
    }, 400)

    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [searchTerm])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const onTime = () => setCurrentTime(Number.isFinite(el.currentTime) ? el.currentTime : 0)
    const onDur = () => setDuration(Number.isFinite(el.duration) ? el.duration : null)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => setIsPlaying(false)
    const onReady = () => setLoadingEpisodeId(null)
    const onError = () => setLoadingEpisodeId(null)

    el.addEventListener('timeupdate', onTime)
    el.addEventListener('durationchange', onDur)
    el.addEventListener('loadedmetadata', onDur)
    el.addEventListener('canplay', onReady)
    el.addEventListener('play', onPlay)
    el.addEventListener('playing', onReady)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    el.addEventListener('error', onError)

    // Sync initial values.
    onTime()
    onDur()
    setIsPlaying(!el.paused)

    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('durationchange', onDur)
      el.removeEventListener('loadedmetadata', onDur)
      el.removeEventListener('canplay', onReady)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('playing', onReady)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onError)
    }
  }, [])

  const loadFeed = useCallback(async (url: string) => {
    setLoadingFeedUrl(url)
    setRssLoading(true)
    setRssError(null)
    setPodcast(null)
    setEpisode(null)
    setSourceKind('remote')
    setCanDenoise(null)
    setDenoiseEnabled(false)
    setEpisodeQuery('')
    engineRef.current?.setEnabled(false)

    try {
      const cached = feedCacheRef.current.get(url)
      const parsed = cached ?? (await fetchAndParseRss(url))
      if (!cached) {
        feedCacheRef.current.set(url, parsed)
        if (feedCacheRef.current.size > maxFeedCache) {
          const firstKey = feedCacheRef.current.keys().next().value as string | undefined
          if (firstKey) feedCacheRef.current.delete(firstKey)
        }
        try {
          localStorage.setItem(feedCacheKey, JSON.stringify({ entries: Array.from(feedCacheRef.current.entries()) }))
        } catch {}
      }
      if (parsed.feed?.imageUrl) {
        setFeedImages((prev) => {
          if (prev[url] === parsed.feed!.imageUrl) return prev
          const next = { ...prev, [url]: parsed.feed!.imageUrl! }
          try {
            localStorage.setItem(feedImageCacheKey, JSON.stringify(next))
          } catch {}
          return next
        })
      }
      setPodcast(parsed)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setRssError(
        [
          msg,
          '',
          'If this is a CORS error:',
          '1) Some RSS hosts block browser fetch. Try a different feed, or paste a CORS-friendly mirror.',
          '2) For denoising, the episode audio must allow CORS OR you must import a downloaded file.',
        ].join('\n'),
      )
    } finally {
      setRssLoading(false)
      setLoadingFeedUrl(null)
    }
  }, [])

  async function ensureEngine() {
    if (!model) throw new Error('No model selected')
    if (!model.supported) throw new Error('Selected model is not supported yet')

    if (!engineRef.current) engineRef.current = new DenoiseEngine()

    if (!initPromiseRef.current) {
      setEngineState('loading-model')
      setEngineDetail('Loading ONNX session…')
      initPromiseRef.current = (async () => {
        await cacheModelOnDemand(model.url)
        await engineRef.current!.init({ modelUrl: model.url, sampleRateHz: model.sampleRateHz })
        engineRef.current!.setWarmupMs(250)
      })()
    }

    try {
      await initPromiseRef.current
      const st = engineRef.current!.status
      if (st.state === 'ready') {
        setEngineState('ready')
        setEngineDetail(`Backend: ${st.backend.toUpperCase()} · frame ${st.frameSize}`)
      } else if (st.state === 'error') {
        setEngineState('error')
        setEngineDetail(st.message)
      } else {
        setEngineState(st.state)
        setEngineDetail('')
      }
    } catch (e) {
      setEngineState('error')
      setEngineDetail(e instanceof Error ? e.message : String(e))
      initPromiseRef.current = null
      throw e
    }
  }

  const startEpisode = useCallback(async (ep: PodcastEpisode) => {
    const audioEl = audioRef.current
    if (!audioEl) return

    setLoadingEpisodeId(ep.guid)
    setEpisode(ep)
    setSourceKind('remote')
    setCanDenoise(null)
    setDenoiseEnabled(false)
    engineRef.current?.setEnabled(false)

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    let playbackUrl = getRemotePlaybackUrl(ep)
    if (playbackUrl !== ep.enclosureUrl && !proxyVerifiedRef.current.has(ep.guid)) {
      const proxyOk = await probeStreamProxy(playbackUrl)
      if (!proxyOk) {
        proxyBypassRef.current.add(ep.guid)
        playbackUrl = ep.enclosureUrl
        setEngineDetail('Proxy unavailable for this episode. Using direct stream.')
      } else {
        proxyVerifiedRef.current.add(ep.guid)
      }
    }

    audioEl.removeAttribute('crossorigin')
    audioEl.src = playbackUrl
    audioEl.load()

    try {
      await audioEl.play()
    } catch {
      // User gesture / autoplay restrictions.
    }

    if (isMobile) setMobileTab('playing')
  }, [getRemotePlaybackUrl, isMobile])

  const handleSearchSelect = useCallback(
    (result: ApplePodcastResult) => {
      if (!result.feedUrl) return
      setRssUrl(result.feedUrl)
      void loadFeed(result.feedUrl)
      if (isMobile) setMobileTab('episodes')
    },
    [isMobile, loadFeed],
  )

  const handleSourceSelect = useCallback(
    (feed: DefaultFeed) => {
      setRssUrl(feed.rssUrl)
      void loadFeed(feed.rssUrl)
      if (isMobile) setMobileTab('episodes')
    },
    [isMobile, loadFeed],
  )

  const handleEpisodeDownload = useCallback(
    async (ep: PodcastEpisode) => {
      if (downloadingEpisodeId === ep.guid) return
      setDownloadingEpisodeId(ep.guid)
      setEngineDetail('Preparing download…')

      try {
        const res = await fetch(ep.enclosureUrl, { mode: 'cors' })
        if (!res.ok) {
          throw new Error(`Download failed: ${res.status} ${res.statusText}`)
        }

        const blob = await res.blob()
        const ext = inferAudioExtension(ep.enclosureUrl, blob.type || res.headers.get('content-type') || undefined)
        const fileName = `${sanitizeFileName(ep.title)}${ext}`
        const file = new File([blob], fileName, { type: blob.type || 'audio/mpeg' })

        const canShareWithFiles =
          typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [file] })

        if (isMobile && canShareWithFiles) {
          await navigator.share({ files: [file], title: ep.title })
          setEngineDetail('Download ready. Use Save to Files from the share sheet.')
          return
        }

        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = fileName
        a.rel = 'noopener noreferrer'
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
        setEngineDetail('Download started.')
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setEngineDetail('Download canceled.')
          return
        }
        setEngineDetail('Direct file save blocked by the host. Opening source URL.')
        window.open(ep.enclosureUrl, '_blank', 'noopener,noreferrer')
      } finally {
        setDownloadingEpisodeId(null)
      }
    },
    [downloadingEpisodeId, isMobile],
  )

  async function startLocalFile(file: File) {
    const audioEl = audioRef.current
    if (!audioEl) return
    if (!isLikelyAudioFile(file)) {
      setEngineDetail('File is not recognized as audio. Try MP3, M4A, WAV, FLAC, or OGG.')
      return
    }

    setCanDenoise(null)
    setDenoiseEnabled(false)
    engineRef.current?.setEnabled(false)

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    const url = URL.createObjectURL(file)
    objectUrlRef.current = url

    setSourceKind('local')
    const localEp: PodcastEpisode = {
      guid: `local:${file.name}:${file.size}:${file.lastModified}`,
      title: file.name,
      enclosureUrl: url,
    }
    setLoadingEpisodeId(localEp.guid)
    setEpisode(localEp)
    setCanDenoise(true)

    // Switch source first for immediate playback.
    try {
      audioEl.pause()
    } catch {}
    audioEl.removeAttribute('crossorigin')
    audioEl.src = url
    audioEl.load()
    try {
      await audioEl.play()
    } catch {}

    if (isMobile) setMobileTab('playing')
  }

  async function toggleDenoise(next: boolean) {
    const audioEl = audioRef.current
    if (!audioEl || !episode) return
    const remotePlaybackUrl = sourceKind === 'remote' ? getRemotePlaybackUrl(episode) : episode.enclosureUrl
    const remoteNeedsCors = sourceKind === 'remote' && !isSameOriginUrl(remotePlaybackUrl)

    if (!next) {
      setDenoiseEnabled(false)
      engineRef.current?.setEnabled(false)
      audioEl.removeAttribute('crossorigin')
      return
    }

    setEngineDetail('')
    setEngineState(engineRef.current?.status.state ?? 'idle')

    const ok = sourceKind === 'local' ? true : remoteNeedsCors ? await corsProbe(remotePlaybackUrl) : true
    setCanDenoise(ok)
    if (!ok) {
      setDenoiseEnabled(false)
      setEngineDetail('CORS blocked. Download + import the file to denoise.')
      return
    }

    if (sourceKind === 'remote') {
      // Switch the media element into CORS mode and reload the source, otherwise WebAudio will be blocked
      // even if the host supports CORS (because it was initially loaded without CORS).
      const wasPaused = audioEl.paused
      const t = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0
      if (remoteNeedsCors) audioEl.crossOrigin = 'anonymous'
      else audioEl.removeAttribute('crossorigin')
      audioEl.src = remotePlaybackUrl
      audioEl.load()
      await new Promise<void>((resolve) => {
        const done = () => resolve()
        audioEl.addEventListener('loadedmetadata', done, { once: true })
      })
      try {
        if (t > 0) audioEl.currentTime = t
      } catch {}
      if (!wasPaused) {
        try {
          await audioEl.play()
        } catch {}
      }
    }

    await ensureEngine()
    await engineRef.current!.attach(audioEl)
    engineRef.current!.setEnabled(true)
    setDenoiseEnabled(true)
  }

  async function togglePlayPause() {
    const audioEl = audioRef.current
    if (!audioEl) return
    try {
      if (audioEl.paused) await audioEl.play()
      else audioEl.pause()
    } catch {
      // Autoplay restrictions; ignore.
    }
  }

  function seekToPct(pct: number) {
    const audioEl = audioRef.current
    if (!audioEl || !duration || duration <= 0) return
    const next = Math.max(0, Math.min(duration, pct * duration))
    try {
      audioEl.currentTime = next
    } catch {}
  }

  function onProgressPointer(e: PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = rect.width > 0 ? x / rect.width : 0
    seekToPct(pct)
  }

  function playPrev() {
    if (!episode || sourceKind !== 'remote' || !episodesAll.length) return
    const idx = episodesAll.findIndex((e) => e.guid === episode.guid)
    const prev = idx > 0 ? episodesAll[idx - 1] : null
    if (prev) void startEpisode(prev)
  }

  function playNext() {
    if (!episode || sourceKind !== 'remote' || !episodesAll.length) return
    const idx = episodesAll.findIndex((e) => e.guid === episode.guid)
    const next = idx >= 0 && idx < episodesAll.length - 1 ? episodesAll[idx + 1] : null
    if (next) void startEpisode(next)
  }

  const canPrev = sourceKind === 'remote' && episode ? episodesAll.findIndex((e) => e.guid === episode.guid) > 0 : false
  const canNext =
    sourceKind === 'remote' && episode ? episodesAll.findIndex((e) => e.guid === episode.guid) < episodesAll.length - 1 : false

  const nowState: NowState = !episode ? 'idle' : isPlaying ? 'active' : 'paused'

  useEffect(() => {
    const el = nowTitleRef.current
    if (!el) return

    const update = () => {
      const style = window.getComputedStyle(el)
      const lineHeight = Number.parseFloat(style.lineHeight)
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return
      const lines = Math.round(el.getBoundingClientRect().height / lineHeight)
      el.classList.toggle('isLong', lines > 2)
    }

    const onResize = () => window.requestAnimationFrame(update)
    update()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [nowTitle])

  const topStatus = useMemo(() => {
    return [
      `ENGINE: ${engineState.toUpperCase()}`,
      `DETAIL: ${engineDetail || 'READY'}`,
    ]
      .filter(Boolean)
      .join('   ')
  }, [canDenoise, engineDetail, engineState, sourceKind])

  const episodeItems = useMemo(() => {
    return episodes.map((ep) => (
      <div
        key={ep.guid}
        className={`pcEpisodeItem pcChamfer ${episode?.guid === ep.guid ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => void startEpisode(ep)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            void startEpisode(ep)
          }
        }}
      >
        <div className="pcEpisodeIcon">
          <IconPlay size={18} />
        </div>
        <div className="pcEpisodeBody">
          <div className="pcEpisodeTitle">{ep.title}</div>
          <div className="pcEpisodeMeta">
            {ep.dateStamp ? <span>{ep.dateStamp}</span> : null}
            {ep.duration ? <span>{ep.duration}</span> : null}
            {loadingEpisodeId === ep.guid ? <span className="pcLoadingText">LOADING…</span> : null}
          </div>
        </div>
        <button
          type="button"
          className="pcMiniBtn pcEpisodeDownload pcChamfer"
          onClick={(e) => {
            e.stopPropagation()
            void handleEpisodeDownload(ep)
          }}
          disabled={downloadingEpisodeId === ep.guid}
        >
          {downloadingEpisodeId === ep.guid ? 'SAVING…' : 'DOWNLOAD'}
        </button>
      </div>
    ))
  }, [episodes, episode?.guid, loadingEpisodeId, downloadingEpisodeId, startEpisode, handleEpisodeDownload])

  return (
    <div className={`pcApp ${isMobile ? 'isMobile' : ''}`} data-tab={mobileTab} data-playstate={nowState}>
      <div className="pcBackdrop" aria-hidden="true" />

      <header className="pcHeader">
        <div className="pcBrand">
          <div className="pcMark" aria-hidden="true">
            <span>P</span>
          </div>
          <div className="pcBrandText">
            <div className="pcBrandTitle">
              Poise<span>Cast</span>
              <span className="pcBrandVer">VER. 0.1</span>
            </div>
          </div>
        </div>

        <div className="pcHeaderStatus">{topStatus}</div>

        <div className="pcHeaderRight">
          {canInstall ? (
            <button className="pcMiniBtn pcInstallBtn pcChamfer" onClick={() => void triggerInstall()} disabled={installing}>
              {installing ? 'INSTALLING…' : 'INSTALL APP'}
            </button>
          ) : null}
          <div className="pcSelectWrap pcChamfer">
            <div className="pcSelectMeta">
              <div className="pcSelectMetaLabel">SYSTEM</div>
              <div className="pcSelectMetaValue">MODEL</div>
            </div>
            <select
              className="pcSelect"
              value={modelId}
              onChange={(e) => {
                onModelChange(e.target.value)
              }}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.supported}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="pcMobileStatus">
        <div className="pcMobileStatusText">{topStatus}</div>
        <div className="pcMobileStatusActions">
          {canInstall ? (
            <button className="pcMobileInstall" onClick={() => void triggerInstall()} disabled={installing}>
              {installing ? 'INSTALLING…' : 'INSTALL'}
            </button>
          ) : null}
          <button
            className={`pcMobileDenoise ${denoiseEnabled ? 'on' : ''}`}
            disabled={!episode || !model?.supported}
            onClick={() => void toggleDenoise(!denoiseEnabled)}
          >
            {denoiseEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="pcShell">
        <aside className="pcSidebar pcChamfer">
            <div className="pcSidebarHead">
              <div className="pcSidebarTitle">
                <IconRss size={18} /> INPUT SOURCES
                {rssLoading ? <span className="pcLoadingTag">LOADING…</span> : null}
              </div>
            </div>

          <div className="pcSidebarBody">
            {!isMobile ? (
              <div className="pcSidebarTabs">
                <button
                  className={`pcTabBtn ${sidebarTab === 'sources' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('sources')}
                >
                  SOURCES
                </button>
                <button
                  className={`pcTabBtn ${sidebarTab === 'search' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('search')}
                >
                  SEARCH
                </button>
              </div>
            ) : null}

            {(isMobile ? mobileTab === 'search' : sidebarTab === 'search') ? (
              <div className="pcSearchBox pcChamfer">
                <div className="pcSearchTop">
                  <div className="pcMiniLabel">
                    <IconSearch size={14} /> SEARCH (APPLE)
                  </div>
                  <div className="pcMiniHint">{searchLoading ? 'SEARCHING…' : ' '}</div>
                </div>
                <input
                  className="pcInput"
                  value={searchTerm}
                  placeholder="Search podcasts"
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchError ? <div className="pcInlineError">{searchError}</div> : null}
                <SearchResults
                  results={searchResults}
                  rssLoading={rssLoading}
                  loadingFeedUrl={loadingFeedUrl}
                  onSelect={handleSearchSelect}
                />
              </div>
            ) : null}

            {(isMobile ? mobileTab === 'sources' : sidebarTab === 'sources') ? (
              <SourceList
                feeds={DEFAULT_FEEDS}
                activeUrl={rssUrl}
                rssLoading={rssLoading}
                loadingFeedUrl={loadingFeedUrl}
                imageByUrl={feedImages}
                showThumbs={isMobile && mobileTab === 'sources'}
                onSelect={handleSourceSelect}
              />
            ) : null}
          </div>

          <div className="pcSidebarFoot">
            {isMobile ? (
              <div className="pcFootBlock">
                <div className="pcMiniLabel">MODEL</div>
                <select
                  className="pcInlineSelect"
                  value={modelId}
                  onChange={(e) => {
                    onModelChange(e.target.value)
                  }}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id} disabled={!m.supported}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {rssError ? <pre className="pcError">{rssError}</pre> : null}
            {podcast ? (
              <div className="pcFeedMeta">
                <div className="pcFeedMetaTitle">{podcast.feed.title}</div>
                {podcast.feed.description ? <div className="pcFeedMetaDesc">{podcast.feed.description}</div> : null}
              </div>
            ) : null}
          </div>
        </aside>

        <main className="pcMain">
          <section
            className="pcNow pcChamfer"
            data-state={nowState}
          >
            <div className="pcNowInner">
              <div className="pcNowTop">
                <div className="pcTag">{nowTagScramble}</div>
                <div className="pcNowLine">
                  /// {sourceScramble} /// {releaseScramble}
                </div>
              </div>

              <h2 className="pcNowTitle" ref={nowTitleRef}>
                <span className="pcNowTitleHead">{headScramble}</span>
                {split.accent ? <span className="pcNowTitleAccent">{accentScramble}</span> : null}
              </h2>

              <div className="pcPlayerStack">
                <div className="pcProgress">
                  <div className="pcProgressTrack pcChamfer" onPointerDown={onProgressPointer}>
                    <div className="pcProgressFill" style={{ width: `${progressPct * 100}%` }} />
                    <div className="pcProgressMark" style={{ left: `${progressPct * 100}%` }} />
                  </div>
                  <div className="pcProgressTimes">
                    <span className="pcCyan">{formatClock(currentTime)}</span>
                    <span className="pcMuted">{timeLeft !== null ? `-${formatClock(timeLeft)}` : '--:--'}</span>
                  </div>
                </div>

                <div className="pcControls">
                  <button
                    ref={importBtnRef}
                    className="pcMiniBtn pcControlImport pcControlsSide"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span className="pcLottie pcLottieHover" ref={importHoverLottie.containerRef} />
                    <IconUpload size={14} /> IMPORT
                  </button>

                  <div className="pcControlsRow pcControlsRowPrimary">
                    <button
                      ref={prevBtnRef}
                      className="pcSkip"
                      onClick={playPrev}
                      disabled={!canPrev}
                      title="Previous"
                    >
                      <span className="pcLottie pcLottieHover" ref={prevHoverLottie.containerRef} />
                      <IconPrev size={26} />
                    </button>
                    <button
                      ref={playBtnRef}
                      className={`pcPlay ${isPlaying ? 'on' : ''} ${isEpisodeLoading ? 'isLoading' : ''}`}
                      onClick={() => void togglePlayPause()}
                      title={isEpisodeLoading ? 'Loading…' : 'Play / Pause'}
                      disabled={!episode || isEpisodeLoading}
                    >
                      <span className="pcLottie pcLottieHover pcLottiePlay" ref={playHoverLottie.containerRef} />
                      {isEpisodeLoading ? (
                        <span className="pcLottie pcLottieLoading pcLottiePlay" ref={playLoadingLottie.containerRef} />
                      ) : null}
                      {isPlaying ? <IconPause size={44} /> : <IconPlay size={44} />}
                    </button>
                    <button
                      ref={nextBtnRef}
                      className="pcSkip"
                      onClick={playNext}
                      disabled={!canNext}
                      title="Next"
                    >
                      <span className="pcLottie pcLottieHover" ref={nextHoverLottie.containerRef} />
                      <IconNext size={26} />
                    </button>
                  </div>

                  <button
                    ref={denoiseBtnRef}
                    className={`pcDenoiseControl pcControlsSide ${denoiseEnabled ? 'on' : ''}`}
                    disabled={!episode || !model?.supported || isDenoiseLoading}
                    onClick={() => void toggleDenoise(!denoiseEnabled)}
                    title={isDenoiseLoading ? 'Loading…' : `Denoise ${denoiseEnabled ? 'On' : 'Off'}`}
                  >
                    <span className="pcLottie pcLottieHover" ref={denoiseHoverLottie.containerRef} />
                    <div className="pcMiniLabel">DENOISE</div>
                    <div className={`pcProcState ${denoiseEnabled ? 'on' : ''}`}>{denoiseEnabled ? 'ON' : 'OFF'}</div>
                    {isDenoiseLoading ? <span className="pcSpinner pcSpinnerSm" aria-hidden="true" /> : null}
                  </button>
                </div>
              </div>

              <audio ref={audioRef} className="pcAudio" preload="none" />
            </div>
          </section>

          <section className="pcEpisodes pcChamfer">
            <div className="pcSectionHead">
              <div className="pcSectionTitle">
                EPISODES <span className="pcSectionTag">/// DATA STORAGE</span>
              </div>
              <div className="pcSectionTools">
                <div className="pcFilter">
                  <IconSearch size={14} />
                  <input
                    className="pcFilterInput"
                    value={episodeQuery}
                    placeholder="Filter…"
                    onChange={(e) => setEpisodeQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <EpisodeList items={episodeItems} hasEpisodes={episodes.length > 0} />
          </section>
        </main>
      </div>

      <nav className="pcMobileNav">
        <button className={`pcNavItem ${mobileTab === 'search' ? 'active' : ''}`} onClick={() => setMobileTab('search')}>
          <IconSearch size={18} />
          <span>SEARCH</span>
        </button>
        <button className={`pcNavItem ${mobileTab === 'sources' ? 'active' : ''}`} onClick={() => setMobileTab('sources')}>
          <IconRss size={18} />
          <span>SOURCES</span>
        </button>
        <button className={`pcNavItem ${mobileTab === 'episodes' ? 'active' : ''}`} onClick={() => setMobileTab('episodes')}>
          <IconList size={18} />
          <span>EPISODES</span>
        </button>
        <button className={`pcNavItem ${mobileTab === 'playing' ? 'active' : ''}`} onClick={() => setMobileTab('playing')}>
          <IconWave size={18} />
          <span>PLAYING</span>
        </button>
      </nav>

      <input
        ref={fileInputRef}
        type="file"
        accept={AUDIO_FILE_ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void startLocalFile(file)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}
