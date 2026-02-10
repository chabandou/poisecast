import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
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
  const meta = await fetchFeedLookupMeta(rssUrl)
  return meta?.artworkUrl ?? null
}

type FeedLookupMeta = {
  artworkUrl: string | null
  genres: string[]
}

function normalizeLookupGenre(value?: string): string | null {
  const v = value?.replace(/\s+/g, ' ').trim()
  if (!v) return null
  if (/^(podcast|podcasts|rss|feed)$/i.test(v)) return null
  return v
}

function dedupeGenres(values: Array<string | undefined | null>, max = 6): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const genre = normalizeLookupGenre(value ?? undefined)
    if (!genre) continue
    const key = genre.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(genre)
    if (out.length >= max) break
  }
  return out
}

const fetchFeedLookupMeta = async (rssUrl: string): Promise<FeedLookupMeta | null> => {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?entity=podcast&feedUrl=${encodeURIComponent(rssUrl)}`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      results?: Array<{
        artworkUrl600?: string
        artworkUrl512?: string
        artworkUrl100?: string
        primaryGenreName?: string
        genres?: string[]
      }>
    }
    const item = data?.results?.[0]
    const artworkUrl = item?.artworkUrl600 || item?.artworkUrl512 || item?.artworkUrl100 || null
    const genres = dedupeGenres([item?.primaryGenreName, ...(item?.genres ?? [])])
    return { artworkUrl, genres }
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
  onSelect,
}: SourceListProps) {
  return (
    <div className="pcSourceList">
      {feeds.map((f) => {
        const isLoading = !!loadingFeedUrl && f.rssUrl === loadingFeedUrl
        return (
          <button
            key={f.rssUrl}
            className={`pcSourceItem ${activeUrl === f.rssUrl ? 'active' : ''} ${isLoading ? 'isLoading' : ''}`}
            disabled={rssLoading || isLoading}
            onClick={() => onSelect(f)}
          >
            <div className="pcSourceItemTitle">{f.title}</div>
            <div className="pcSourceItemMeta">
              <span className="pcSourceUrl">{f.rssUrl}</span>
              {activeUrl === f.rssUrl ? <span className="pcActiveIndicator"></span> : null}
            </div>
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
      <table>
        <tbody>
          {items}
        </tbody>
      </table>
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

function useOverflowPanText<T extends HTMLElement>(
  text: string,
): { ref: React.MutableRefObject<T | null>; overflow: boolean; distance: number; style: CSSProperties } {
  const ref = useRef<T | null>(null)
  const [state, setState] = useState({ overflow: false, distance: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const container = el.parentElement
    if (!container) return

    const measure = () => {
      const overflowPx = Math.ceil(el.scrollWidth - container.clientWidth)
      if (overflowPx > 4) {
        setState((prev) => {
          if (prev.overflow && prev.distance === overflowPx) return prev
          return { overflow: true, distance: overflowPx }
        })
        return
      }
      setState((prev) => (prev.overflow || prev.distance !== 0 ? { overflow: false, distance: 0 } : prev))
    }

    measure()

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
      ro.observe(container)
    }
    window.addEventListener('resize', measure)

    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [text])

  const style = {
    ['--pc-pan-distance' as const]: `${state.distance}px`,
  } as CSSProperties

  return { ref, overflow: state.overflow, distance: state.distance, style }
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

function normalizeFeedDescription(value?: string, maxLen = 420): string | null {
  if (!value) return null
  const plain = new DOMParser().parseFromString(value, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  if (!plain) return null
  return plain.length > maxLen ? `${plain.slice(0, maxLen - 1)}…` : plain
}

function feedHostFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toUpperCase()
  } catch {
    return 'UNKNOWN_HOST'
  }
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
  const [sidebarTab, setSidebarTab] = useState<'sources' | 'search'>('sources')
  const [sidebarError, setSidebarError] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const proxyBypassRef = useRef<Set<string>>(new Set())
  const proxyVerifiedRef = useRef<Set<string>>(new Set())
  const lastInferenceAtRef = useRef(0)

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
  const [episodeReverse, setEpisodeReverse] = useState(false)
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
  const [volume, setVolume] = useState(0.66)
  const [lastNonZeroVolume, setLastNonZeroVolume] = useState(0.66)
  const [isInferenceActive, setIsInferenceActive] = useState(false)

  const episodesAll = podcast?.episodes ?? []
  const episodes = useMemo(() => {
    const q = deferredEpisodeQuery.trim().toLowerCase()
    const filtered = !q ? episodesAll : episodesAll.filter((e) => e.title.toLowerCase().includes(q))
    return episodeReverse ? [...filtered].reverse() : filtered
  }, [deferredEpisodeQuery, episodeReverse, episodesAll])

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
    if (!denoiseEnabled || !isPlaying || engineState !== 'ready') {
      setIsInferenceActive(false)
      return
    }

    const thresholdMs = 700
    const intervalMs = 180
    const updateInferenceState = () => {
      const isActive = performance.now() - lastInferenceAtRef.current <= thresholdMs
      setIsInferenceActive((prev) => (prev === isActive ? prev : isActive))
    }

    updateInferenceState()
    const timer = window.setInterval(updateInferenceState, intervalMs)
    return () => window.clearInterval(timer)
  }, [denoiseEnabled, isPlaying, engineState])

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
      engineRef.current?.setInferenceActivityHandler(null)
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
    setIsInferenceActive(false)
    lastInferenceAtRef.current = 0
    setEpisodeQuery('')
    engineRef.current?.setEnabled(false)

    try {
      const cached = feedCacheRef.current.get(url)
      let parsed = cached ?? (await fetchAndParseRss(url))
      let cacheDirty = !cached

      let lookup: FeedLookupMeta | null = null
      if (!parsed.feed?.imageUrl || !parsed.feed?.genres?.length) {
        lookup = await fetchFeedLookupMeta(url)
      }

      if ((!parsed.feed?.genres || parsed.feed.genres.length === 0) && lookup?.genres?.length) {
        parsed = {
          ...parsed,
          feed: {
            ...parsed.feed,
            genres: lookup.genres,
          },
        }
        cacheDirty = true
      }

      if (cacheDirty) {
        feedCacheRef.current.set(url, parsed)
        if (feedCacheRef.current.size > maxFeedCache) {
          const firstKey = feedCacheRef.current.keys().next().value as string | undefined
          if (firstKey) feedCacheRef.current.delete(firstKey)
        }
        try {
          localStorage.setItem(feedCacheKey, JSON.stringify({ entries: Array.from(feedCacheRef.current.entries()) }))
        } catch {}
      }

      const bestImage = parsed.feed?.imageUrl || lookup?.artworkUrl || null
      if (bestImage) {
        setFeedImages((prev) => {
          if (prev[url] === bestImage) return prev
          const next = { ...prev, [url]: bestImage }
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
    engineRef.current.setInferenceActivityHandler(() => {
      lastInferenceAtRef.current = performance.now()
    })

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
    setIsInferenceActive(false)
    lastInferenceAtRef.current = 0
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
    setIsInferenceActive(false)
    lastInferenceAtRef.current = 0
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
      setIsInferenceActive(false)
      lastInferenceAtRef.current = 0
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
      setIsInferenceActive(false)
      lastInferenceAtRef.current = 0
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

  const setVolumeClamped = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next))
    setVolume(clamped)
    if (clamped > 0) setLastNonZeroVolume(clamped)
  }, [])

  const setVolumeFromClientX = useCallback((clientX: number, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    const pct = rect.width > 0 ? x / rect.width : 0
    setVolumeClamped(pct)
  }, [setVolumeClamped])

  function onVolumePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const target = e.currentTarget
    const pointerId = e.pointerId
    setVolumeFromClientX(e.clientX, target)
    target.setPointerCapture(pointerId)

    const onMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return
      setVolumeFromClientX(event.clientX, target)
    }
    const onStop = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onStop)
      target.removeEventListener('pointercancel', onStop)
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onStop)
    target.addEventListener('pointercancel', onStop)
  }

  function onVolumeKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = 0.05
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      setVolumeClamped(volume + step)
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      setVolumeClamped(volume - step)
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setVolumeClamped(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      setVolumeClamped(1)
    }
  }

  function onVolumeWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault()
    if (e.deltaY === 0) return
    const direction = e.deltaY < 0 ? 1 : -1
    const step = e.shiftKey ? 0.1 : 0.04
    setVolumeClamped(volume + direction * step)
  }

  const toggleMute = useCallback(() => {
    if (volume === 0) {
      setVolumeClamped(lastNonZeroVolume > 0 ? lastNonZeroVolume : 0.66)
      return
    }
    setVolumeClamped(0)
  }, [lastNonZeroVolume, setVolumeClamped, volume])

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
  const isDiscoverView = isMobile ? mobileTab === 'search' : sidebarTab === 'search'
  const searchQuery = searchTerm.trim()
  const hasSearchQuery = searchQuery.length > 0
  const footerProgressPct = Math.round(progressPct * 1000) / 10
  const footerVolumePct = Math.round(volume * 100)
  const footerVolumeIcon = volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'
  const footerEpisodeTitle = episode?.title ?? 'Select an episode'
  const footerEpisodeShow = sourceKind === 'local' ? 'LOCAL FILE' : podcast?.feed.title ?? 'NO SOURCE SELECTED'
  const footerTitlePan = useOverflowPanText<HTMLSpanElement>(footerEpisodeTitle)
  const footerShowPan = useOverflowPanText<HTMLSpanElement>(footerEpisodeShow)
  const footerPanActive = footerTitlePan.overflow || footerShowPan.overflow
  const footerPanDistanceMax = Math.max(footerTitlePan.distance, footerShowPan.distance)
  const footerPanDuration = Math.max(8, 8 + footerPanDistanceMax / 18)
  const footerPanSharedStyle = {
    ['--pc-pan-duration' as const]: `${footerPanDuration}s`,
    ['--pc-pan-delay' as const]: '0.8s',
  } as CSSProperties
  const activeSource = useMemo(() => DEFAULT_FEEDS.find((f) => f.rssUrl === rssUrl), [rssUrl])
  const showHost = useMemo(() => feedHostFromUrl(rssUrl), [rssUrl])
  const showTitleRaw = podcast?.feed.title || activeSource?.title || 'SELECT A SOURCE'
  const showTitleParts = useMemo(() => splitTitle(showTitleRaw), [showTitleRaw])
  const showArtwork = podcast?.feed.imageUrl || feedImages[rssUrl] || null
  const showDescription = useMemo(() => {
    if (rssLoading) return 'Loading selected feed…'
    const parsed = normalizeFeedDescription(podcast?.feed.description)
    if (parsed) return parsed
    if (activeSource) return `Feed URL: ${activeSource.rssUrl}`
    return 'Select a source from the sidebar to load show details.'
  }, [activeSource, podcast?.feed.description, rssLoading])
  const showGenres = useMemo(() => {
    if (sourceKind === 'local') return ['LOCAL FILE']
    const parsed = (podcast?.feed.genres ?? []).filter((g) => typeof g === 'string' && g.trim().length > 0)
    if (parsed.length) return parsed.slice(0, 3)
    if (activeSource?.category?.trim()) return [activeSource.category.trim()]
    return ['Podcast']
  }, [activeSource?.category, podcast?.feed.genres, sourceKind])
  const footerCurrent = formatClock(currentTime)
  const footerDuration = formatClock(duration)
  const footerRemaining = timeLeft !== null ? `-${formatClock(timeLeft)}` : '--:--'
  const canDownloadCurrent = sourceKind === 'remote' && !!episode
  const isDownloadingCurrent = !!episode && downloadingEpisodeId === episode.guid

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = volume
    el.muted = volume === 0
  }, [volume])

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
      <tr
        key={ep.guid}
        className={`pcEpisodeItem ${episode?.guid === ep.guid ? 'active' : ''}`}
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
        <td>
          <div className="pcEpisodeIcon">
            <span className="material-symbols-outlined">{episode?.guid === ep.guid ? 'graphic_eq' : 'play_circle'}</span>
          </div>
        </td>
        <td>
          <div className="pcEpisodeBody">
            <div className="pcEpisodeTitle">Ep. {episodes.indexOf(ep) + 1}: {ep.title}</div>
            <div className="pcEpisodeMeta">
              {ep.dateStamp ? <span>{ep.dateStamp}</span> : null}
              {ep.dateStamp && ep.duration ? <span className="pcMetaSeparator">|</span> : null}
              {ep.duration ? <span>{ep.duration}</span> : null}
              {loadingEpisodeId === ep.guid ? <span className="pcLoadingTag">LOADED</span> : null}
            </div>
          </div>
        </td>
        <td style={{ textAlign: 'right' }}>
          <span className="pcEpisodeSize">128kbps / FLAC</span>
        </td>
      </tr>
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
              PoiseCast <span className="pcBrandVer">v0.1-BETA</span>
            </div>
          </div>
        </div>

        <div className="pcHeaderStatus">
          <div className={`pcStatusIndicator ${isInferenceActive ? 'active' : ''}`}>
            <span className="pcStatusDot"></span>
            <span className="pcStatusText">Processing: {isInferenceActive ? 'Active' : 'Idle'}</span>
          </div>
        </div>

        <div className="pcHeaderRight">
          <button
            className="pcAddSourceBtn"
            onClick={() => void triggerInstall()}
            disabled={!canInstall || installing}
          >
            {!canInstall ? 'Installed' : installing ? 'Installing…' : 'Install App'}
          </button>
          <div className="pcDspMode">
            <div className="pcDspLabel">Isolation Mode</div>
            <div className="pcDspValue">
              <span>Vocal Isolation</span>
              <span className="material-symbols-outlined">expand_more</span>
            </div>
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
          <div className="pcSidebarBody">
            <>
                <div className="pcSourceList">
		                  <button
                    type="button"
                    className={`pcNavigationItem ${(isMobile ? mobileTab === 'sources' : sidebarTab === 'sources') ? 'active' : ''}`}
                    onClick={() => {
                      if (isMobile) setMobileTab('sources')
                      else setSidebarTab('sources')
                    }}
                  >
                    <div className="pcNavigationContent">
                      <div className="pcNavigationTitle">Library</div>
                      <div className="pcNavigationMeta">
                        <span className="pcNavigationUrl">Personal Archive</span>
                      </div>
                    </div>
                    <div className="pcNavigationIcon">
                      <span className="material-symbols-outlined">library_books</span>
                    </div>
                  </button>
	                  <button
                    type="button"
                    className={`pcNavigationItem ${(isMobile ? mobileTab === 'search' : sidebarTab === 'search') ? 'active' : ''}`}
                    onClick={() => {
                      if (isMobile) setMobileTab('search')
                      else setSidebarTab('search')
                    }}
                  >
                    <div className="pcNavigationContent">
                      <div className="pcNavigationTitle">Discover</div>
                      <div className="pcNavigationMeta">
                        <span className="pcNavigationUrl">Global Network</span>
                      </div>
                    </div>
                    <div className="pcNavigationIcon">
                      <span className="material-symbols-outlined">explore</span>
                    </div>
                  </button>
	                </div>
                
                <div className="pcSidebarHead" style={{paddingTop: '24px', paddingBottom: '8px'}}>
                  <div className="pcSidebarTitle" style={{fontSize: '9px', letterSpacing: '0.2em', opacity: 0.4}}>
                    <span className="material-symbols-outlined" style={{fontSize: '12px'}}>rss_feed</span>
                    Recent Feeds
                  </div>
                </div>
                
                <SourceList
                  feeds={DEFAULT_FEEDS}
                  activeUrl={rssUrl}
                  rssLoading={rssLoading}
                  loadingFeedUrl={loadingFeedUrl}
                  imageByUrl={feedImages}
                  showThumbs={isMobile && mobileTab === 'sources'}
                  onSelect={handleSourceSelect}
                />
                {sidebarError ? (
                  <div className="pcSidebarFoot">
                    <h4 className="pcFeedMetaTitle" style={{fontSize: '10px', marginBottom: '8px'}}>Host System</h4>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-surface-hover border border-border-active flex items-center justify-center overflow-hidden">
                        <span className="material-symbols-outlined text-sm text-primary">account_circle</span>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-white uppercase font-mono">DR. VINCENZO</p>
                        <p className="text-[9px] text-muted uppercase font-mono">ADMIN_AUTH_01</p>
                      </div>
                    </div>
                  </div>
                ) : null}
            </>
          </div> 
        </aside>

        <main className="pcMain">
          {isDiscoverView ? (
            <div className="pcDiscoverScreen">
              <div className="pcDiscoverSearch">
                <div className="pcDiscoverSearchInner">
                  <span className="material-symbols-outlined pcDiscoverSearchIcon">search</span>
                  <input 
                    className="pcDiscoverSearchInput" 
                    placeholder="SEARCH ARCHIVE..." 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {hasSearchQuery ? (
                <div className="pcDiscoverContent">
                  {searchLoading ? <div className="pcItemStatus pcLoadingText">SEARCHING PODCASTS…</div> : null}
                  {searchError ? <div className="pcInlineError">{searchError}</div> : null}
                  {!searchError ? (
                    <SearchResults
                      results={searchResults}
                      rssLoading={rssLoading}
                      loadingFeedUrl={loadingFeedUrl}
                      onSelect={handleSearchSelect}
                    />
                  ) : null}
                  {!searchLoading && !searchError && searchResults.length === 0 ? (
                    <div className="pcEmpty">No shows found for "{searchQuery}".</div>
                  ) : null}
                </div>
              ) : null}
              
              <div className="pcDiscoverHero">
                <img className="pcDiscoverHeroImage" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDzeTSV-6dtbtX3Z3gEnqx1ny2MdjhrnEdQ5DYGWbbUdO6M8oL3FeItZiyC8XbRKZ_aPzrp3qK4gpNljWbCEG9OLc-A6L7RpIJeI8hKnow1_8Dbe3EeREKpy-VObVYI47YVsun6ApHvX173U3CrqNlbZCBU3lFzXEanuVr5oF9grbWVZGb9fHnVXHG7ArOFqAAdbtvlE1c1I7TObE5Z12oOp07yoFFBMCvhSfQuObLStUBRxUzQm4q2iXMLPVrsgKj6N8fGmWdHICc" alt="Hero Banner" />
                <div className="pcDiscoverHeroOverlay">
                  <div className="pcDiscoverHeroContent">
                    <div className="pcDiscoverHeroHeader">
                      <span className="pcDiscoverHeroBadge">Featured Intel</span>
                      <span className="pcDiscoverHeroPriority">/// PRIORITY_STREAM: 098</span>
                    </div>
                    <h2 className="pcDiscoverHeroTitle">NEURAL <span className="pcDiscoverHeroTitleAccent">OVERRIDE</span></h2>
                    <p className="pcDiscoverHeroDesc">Exploring the ethics of cognitive enhancement and the impending singularity. A deep dive into the industrial-scale deployment of wetware interfaces.</p>
                    <div className="pcDiscoverHeroActions">
                      <button className="pcDiscoverHeroBtn">
                        <span className="material-symbols-outlined FILL-1">play_arrow</span>
                        <span>LISTEN NOW</span>
                      </button>
                      <button className="pcDiscoverHeroBtnSecondary">
                        <span className="material-symbols-outlined">add</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pcDiscoverContent">
                <div className="pcDiscoverSection">
                  <div className="pcDiscoverSectionHeader">
                    <div className="pcDiscoverSectionTitle">
                      <span>Trending Data</span>
                      <span className="pcDiscoverSectionLive">LIVE_TRAFFIC</span>
                    </div>
                    <button className="pcDiscoverSectionBtn">View All ///</button>
                  </div>
                  <div className="pcDiscoverGrid">
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img className="pcDiscoverCardImage" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDtzK1iqz5noL89la9IeFHfnFxxvlD3O4zDlwXFTNGS4XpFPJJBCIdNHocLSVUjijuVwPhxZi3W3g1n9ASgnnBvlKwVDN4QixR7DOE07PIOMjQFAJB6RO29gdjOh6TQb9OwepomkGTRyM58I65RzbFWCjs5-NcgaRz8EBt3N8bwPPndkPuaWZjQRZLtZyIQ0Bj1qenBwIj0fHdAbp1iDlLCWARd0ZfXjAePcIVhIZ9AFA-Hj-9IEnt4NBhRjuIjFbTBThKDV1zfmO8" alt="Cover" />
                        <div className="pcDiscoverCardOverlay">
                          <span className="material-symbols-outlined">play_circle</span>
                        </div>
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Silicon Shadows</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// SECURE_FEED_01</span>
                          <span className="pcDiscoverCardStats">
                            <span className="pcDiscoverCardStat">8.4k Listeners</span>
                            <span className="pcDiscoverCardSeparator">|</span>
                            <span className="pcDiscoverCardTime">42m</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img className="pcDiscoverCardImage" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD9MmU9rF06s7UoRz6GYPQg8sB6osarAIGvhGB_kKiHKS6w7SYWpW6D43cK7s7RWyCTJJvGWc696VYkXoqnIOpc9LCOGEfYXnP1n93KcwMOAGzFi0UymL80UJKBbyWYJrUDyYtfME2ACMGyNHa0S3cyt0XIQtOXuMDUeRxQeQTF7QsmyqoAE6JDoSxOfk3BXmUKuq7RaqYTdyBIq7y_qV4b_4DXPrSHQhd1HEbPt1_2hQvO497scg2_tgOjUvgmEm9P9-9n1PXisT0" alt="Cover" />
                        <div className="pcDiscoverCardOverlay">
                          <span className="material-symbols-outlined">play_circle</span>
                        </div>
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Signal Loss</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// BAND_77-ALPHA</span>
                          <span className="pcDiscoverCardStats">
                            <span className="pcDiscoverCardStat">3.2k Listeners</span>
                            <span className="pcDiscoverCardSeparator">|</span>
                            <span className="pcDiscoverCardTime">1h 05m</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img className="pcDiscoverCardImage" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCsZvyo4Znm9_Zf6sBmSL-JM5q8iNgKeiBGmd2JIrRdVVm8YnNm3TE2A40SHbp4tXarOZkawNiJDDxvCPDs8VXk1sCpSdxXv8AmOJMGUiz1ToyKV0BpPJD1cHsRyzwd-agPUQiyxTWNHW5bwVFhpS19_aYYE2-wGlW3aqMgiDe-YNCxPwWLzuUOqWLfYemSLpmUTaehRBg3NEgmn1UCVBDcVW1W-58nS-karXJzefpt7eZK_pyUTJ9kBIQphPQiKfc1XKT9ajvqaWg" alt="Cover" />
                        <div className="pcDiscoverCardOverlay">
                          <span className="material-symbols-outlined">play_circle</span>
                        </div>
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Cybernetic Echo</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// RECURSIVE_DYNAMICS</span>
                          <span className="pcDiscoverCardStats">
                            <span className="pcDiscoverCardStat">12k Listeners</span>
                            <span className="pcDiscoverCardSeparator">|</span>
                            <span className="pcDiscoverCardTime">38m</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img className="pcDiscoverCardImage" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzDIVsR1QW9UcG-2LSKPS05pNQ9KDbhy06hjgLOnDz-tRsInoh4OvHaWoRpgvb4axqbIzHx0Jurrx9T8XT66FAAzE2BNBBN41Fd49WgPitMLcWiW61H7oKy9QyEeAZkJKVfNOdS_JvlyFP0yfFTAu0JuqbuNE5ee4xEC-UPq3qvfxj-XL7-2FWMQcNR_bcmUBBZ9WWdIlTG6t2EBKeYjRO8k-VDlmbe_R3rva4RP_AWsjA-nsDjS_7bGKJLQ1a6zzD_CoKW-FXVVo" alt="Cover" />
                        <div className="pcDiscoverCardOverlay">
                          <span className="material-symbols-outlined">play_circle</span>
                        </div>
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Black Box Logic</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// OPAQUE_ANALYSIS</span>
                          <span className="pcDiscoverCardStats">
                            <span className="pcDiscoverCardStat">1.1k Listeners</span>
                            <span className="pcDiscoverCardSeparator">|</span>
                            <span className="pcDiscoverCardTime">55m</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img className="pcDiscoverCardImage" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAixwBoGqTYegjsHEcErjMm2FwUPiygGKcp2xDRqtRLmdqkbbee9X1RAougWqdI4f7OZsWzXuNqhl_TlgcvVH1qSQcJd_exGMLeWDrCnUT57aL5J-oLdKfxWWyd_12IGh_62FtLz1SUgVhIL2XMCI9z8jFNqrGLHrXrLthAH86eDJ_rU97uMHTzCLU4oNb56tA-gsuZm1ZKFNmyDGFhxdxt-PVXgPY2-WLB9NsNkAtRF5QDf-IRNnHB5Pevu45z0XO2iNIpK8xMV-0" alt="Cover" />
                        <div className="pcDiscoverCardOverlay">
                          <span className="material-symbols-outlined">play_circle</span>
                        </div>
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">The Void State</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// NULL_POINTER</span>
                          <span className="pcDiscoverCardStats">
                            <span className="pcDiscoverCardStat">6.7k Listeners</span>
                            <span className="pcDiscoverCardSeparator">|</span>
                            <span className="pcDiscoverCardTime">29m</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="pcDiscoverSection">
                  <div className="pcDiscoverSectionHeader">
                    <div className="pcDiscoverSectionTitle">
                      <span>New Signals</span>
                      <span className="pcDiscoverSectionTag">RECENT_UPLINK</span>
                    </div>
                    <button className="pcDiscoverSectionBtn">Incoming ///</button>
                  </div>
                  <div className="pcDiscoverGrid">
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img className="pcDiscoverCardImage" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBQ3sDWhcCWQGb0eVMWJlmK9ijOLa2MdeshHnMRTZv9DVVGhTfsL_NhxeOvBEkfa7GJddmc_94NPrT0ZuTw4CUj2ghtMGsNbfjiKd5VEU972MpUZvjZlokGEqvO_SvRr1h9SJiXOZmljs6nO26TOapswvXFHsp67DkzqFHm61JBJGOILhjRlO4THW3rEiTEC1N7Cn9vHvnpWSGQzWuyH9gbxM1OKq5E9Yftq0Eo9xoK4iOXZvO5F-Df7VQfcvOF0bWQOO4byL6l9yM" alt="Cover" />
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Proxy War</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// NODE_LATENCY_24</span>
                          <span className="pcDiscoverCardStat">New Today</span>
                        </div>
                      </div>
                    </div>
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img className="pcDiscoverCardImage" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDa4iugeL8djUHWo-wL-yd0IDgeTkC7ZsKP3-N_OrOGQojYCCDGK1MifY6dLEZwJePbpbGCpnC7rzo4ikiZzpOZEwTVho0u2Hq4Q7-qVY6VrpQ_bf53GDsVyy54ZU4o6GN7yOrKeDkEjadyoEGjGYkSeTVZhZ4yMSu6EjlrpISgPudbZMFHsNHkdEjH9Ap3I2xpzJqleDYo1nRJUWec9WnQSdGS6bHB1CWP3n3LKtrAvdTuA6zV4XCqrHy5Ongr4ka39SZi4qSk-r4" alt="Cover" />
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Gridlock Theory</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// TRAFFIC_REDACTED</span>
                          <span className="pcDiscoverCardStat">New Today</span>
                        </div>
                      </div>
                    </div>
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img className="pcDiscoverCardImage" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAdR42crqA2ZUK0rzvsRKIeGKdU4eOdVt9UltmZaQsz0UfqzMrqIeaDbUyNX2CvQ09mKD-dtcraA3I7lt6oLerJOGTSw8dlRkzTK9OpncSfStF_dQGK8e61BiVnKQDDOXOmmmnnU2h7aZ-j0zg78Fjz_2SECFeKreRvtM5N3XPtABYG7CvxPO3ni_6FOXbFoII6sOs2K7laHf9toEMQfwomMmnzR-YDLth8m-aQQvnhoiLoEjRElqaU7IsHaJAnPLrb13vf5uwTts4" alt="Cover" />
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Mainframe Memoirs</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// COBOL_HERITAGE</span>
                          <span className="pcDiscoverCardStat">2h ago</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <section className="pcShowDetails">
                <div className="pcShowDetailsInner">
                  <div className="pcShowArtwork">
                    <div className="pcShowArtworkCard">
                      {showArtwork ? (
                        <img
                          className="pcShowArtworkCover"
                          src={showArtwork}
                          alt={`${showTitleRaw} cover art`}
                          loading="lazy"
                        />
                      ) : (
                        <span className="material-symbols-outlined pcShowArtworkIcon">history_edu</span>
                      )}
                    </div>
                  </div>
                  <div className="pcShowInfo">
                    <div className="pcShowMeta">
                      <div className="pcShowGenres">
                        {showGenres.map((genre, idx) => (
                          <span key={`${genre}-${idx}`} className={`pcGenreBox ${idx === 0 ? 'pcGenrePrimary' : ''}`}>
                            {genre}
                          </span>
                        ))}
                      </div>
                      <span className="pcShowNetwork">/// Source: {showHost} · {episodesAll.length} entries</span>
                    </div>
                    <h2 className="pcShowTitle">
                      {showTitleParts.head}
                      {showTitleParts.accent ? (
                        <>
                          {' '}
                          <span className="pcShowTitleAccent">{showTitleParts.accent}</span>
                        </>
                      ) : null}
                    </h2>
                    <div className="pcShowDescription">
                      <p>{showDescription}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="pcEpisodes pcChamfer">
                <div className="pcSectionHead">
                  <div className="pcSectionTitle">
                    Archive Records
                    <span className="pcSectionTag">/// {episodes.length} ENTRIES</span>
                  </div>
                  <div className="pcSectionTools">
                    <div className="pcFilter">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pcFilterIcon">
                        <circle cx="11" cy="11" r="6"></circle>
                        <path d="M20 20l-3.2-3.2"></path>
                      </svg>
                      <input
                        className="pcFilterInput"
                        value={episodeQuery}
                        placeholder="FILTER ARCHIVE..."
                        onChange={(e) => setEpisodeQuery(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className={`pcSortBtn ${episodeReverse ? 'active' : ''}`}
                      onClick={() => setEpisodeReverse((prev) => !prev)}
                      aria-pressed={episodeReverse}
                      title="Reverse episode order"
                    >
                      {episodeReverse ? 'ORDER: REVERSED' : 'ORDER: DEFAULT'}
                    </button>
                  </div>
                </div>

                <EpisodeList items={episodeItems} hasEpisodes={episodes.length > 0} />
                {rssError ? <div className="pcError">{rssError}</div> : null}
              </section>
            </>
          )}

      <footer className="pcFooter">
        <div className="pcFooterProgress">
          <div className="pcFooterProgressTrack" onClick={episode ? onProgressPointer : undefined}>
            <div className="pcFooterProgressFill" style={{ width: `${footerProgressPct}%` }}></div>
            <div
              className="pcFooterProgressHandle"
              style={{ left: `calc(${footerProgressPct}% - 6px)`, right: 'auto' }}
            ></div>
          </div>
        </div>
        <div className="pcFooterControls">
          <div className="pcFooterLeft">
            <div className="pcFooterEpisodeInfo">
              <div className="pcFooterEpisodeArtwork">
                <span className="material-symbols-outlined">history_edu</span>
              </div>
              <div className="pcFooterEpisodeDetails">
                <h4 className={`pcFooterEpisodeTitle ${footerPanActive ? 'isPanning' : ''}`}>
                  <span
                    ref={footerTitlePan.ref}
                    className={`pcFooterMarquee ${footerPanActive ? 'isPanning' : ''}`}
                    style={{ ...footerPanSharedStyle, ...footerTitlePan.style }}
                  >
                    {footerEpisodeTitle}
                  </span>
                </h4>
                <p className={`pcFooterEpisodeShow ${footerPanActive ? 'isPanning' : ''}`}>
                  <span
                    ref={footerShowPan.ref}
                    className={`pcFooterMarquee ${footerPanActive ? 'isPanning' : ''}`}
                    style={{ ...footerPanSharedStyle, ...footerShowPan.style }}
                  >
                    {footerEpisodeShow}
                  </span>
                </p>
              </div>
            </div>
          </div>
          <div className="pcFooterCenter">
            <div className="pcFooterPlayerControls">
              <button type="button" className="pcFooterControlBtn" disabled={!canPrev} onClick={playPrev} title="Previous">
                <IconPrev size={20} />
              </button>
              <button
                type="button"
                className="pcFooterPlayBtn"
                disabled={!episode || isEpisodeLoading}
                onClick={() => void togglePlayPause()}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <IconPause size={24} /> : <IconPlay size={24} />}
              </button>
              <button type="button" className="pcFooterControlBtn" disabled={!canNext} onClick={playNext} title="Next">
                <IconNext size={20} />
              </button>
            </div>
            <div className="pcFooterTimeControls">
              <span className="pcFooterTimeCurrent">{footerCurrent}</span>
              <div className="pcFooterTimeTrack">
                <div className="pcFooterTimeFill" style={{ width: `${footerProgressPct}%` }}></div>
              </div>
              <span className="pcFooterTimeTotal">{footerDuration !== '--:--' ? footerRemaining : footerDuration}</span>
            </div>
          </div>
          <div className="pcFooterRight">
            <button
              type="button"
              className="pcFooterControlBtn"
              disabled={!canDownloadCurrent || isDownloadingCurrent}
              title={canDownloadCurrent ? 'Download episode audio' : 'Select a remote episode to download'}
              onClick={() => {
                if (!episode || sourceKind !== 'remote') return
                void handleEpisodeDownload(episode)
              }}
            >
              <IconUpload size={18} />
            </button>
            <div className="pcFooterVolume" onWheel={onVolumeWheel}>
              <button type="button" className="pcFooterControlBtn" onClick={toggleMute} title={volume === 0 ? 'Unmute' : 'Mute'}>
                <span className="material-symbols-outlined">{footerVolumeIcon}</span>
              </button>
              <div
                className="pcFooterVolumeTrack"
                role="slider"
                tabIndex={0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={footerVolumePct}
                aria-label="Volume"
                onPointerDown={onVolumePointerDown}
                onKeyDown={onVolumeKeyDown}
              >
                <div className="pcFooterVolumeFill" style={{ width: `${footerVolumePct}%` }}></div>
                <div className="pcFooterVolumeHandle" style={{ left: `calc(${footerVolumePct}% - 5px)` }}></div>
              </div>
            </div>
          </div>
        </div>
      </footer>
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

      <audio ref={audioRef} className="pcAudio" preload="metadata" />

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
