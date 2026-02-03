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

type MobileTab = 'search' | 'sources' | 'playing' | 'episodes'
type SidebarTab = 'sources' | 'search'
type NowState = 'idle' | 'active' | 'paused'

const NOW_STATE_LABELS: Record<NowState, string> = {
  idle: 'IDLE',
  active: 'ACTIVE',
  paused: 'PAUSED',
}

const NOW_STATE_CLASS: Record<NowState, string> = {
  idle: 'pcNowStateIdle',
  active: 'pcNowStateActive',
  paused: 'pcNowStatePaused',
}

type SearchResultsProps = {
  results: ApplePodcastResult[]
  rssLoading: boolean
  loadingFeedUrl: string | null
  onSelect: (result: ApplePodcastResult) => void
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

export default function App() {
  const isMobile = useIsMobile(980)
  const [mobileTab, setMobileTab] = useState<MobileTab>('sources')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('sources')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

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
  const [feedImages, setFeedImages] = useState<Record<string, string>>({})
  const feedImageFetchRef = useRef<Set<string>>(new Set())

  const [episodeQuery, setEpisodeQuery] = useState('')
  const deferredEpisodeQuery = useDeferredValue(episodeQuery)

  const [engineState, setEngineState] = useState<string>('idle')
  const [engineDetail, setEngineDetail] = useState<string>('')
  const [denoiseEnabled, setDenoiseEnabled] = useState(false)
  const [canDenoise, setCanDenoise] = useState<boolean | null>(null)

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

  const releaseDate = useMemo(
    () => episode?.dateStamp ?? (sourceKind === 'local' ? 'LOCAL' : null),
    [episode?.dateStamp, sourceKind],
  )

  const progressPct = duration && duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0
  const timeLeft = duration && duration > 0 ? Math.max(0, duration - currentTime) : null
  const isEpisodeLoading = !!loadingEpisodeId && episode?.guid === loadingEpisodeId
  const isDenoiseLoading = engineState === 'loading-model'

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

    // Cautious default: do NOT set `crossOrigin` for normal playback.
    // Many podcast hosts don't allow CORS; forcing `crossOrigin="anonymous"`
    // can cause the media request to fail entirely.
    audioEl.removeAttribute('crossorigin')
    audioEl.src = ep.enclosureUrl
    audioEl.load()

    try {
      await audioEl.play()
    } catch {
      // User gesture / autoplay restrictions.
    }

    if (isMobile) setMobileTab('playing')
  }, [isMobile])

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

  async function startLocalFile(file: File) {
    const audioEl = audioRef.current
    if (!audioEl) return

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

    if (!next) {
      setDenoiseEnabled(false)
      engineRef.current?.setEnabled(false)
      audioEl.removeAttribute('crossorigin')
      return
    }

    setEngineDetail('')
    setEngineState(engineRef.current?.status.state ?? 'idle')

    const ok = sourceKind === 'local' ? true : await corsProbe(episode.enclosureUrl)
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
      audioEl.crossOrigin = 'anonymous'
      audioEl.src = episode.enclosureUrl
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

  const currentNowState: NowState = !episode ? 'idle' : isPlaying ? 'active' : 'paused'
  const [nowState, setNowState] = useState<NowState>(currentNowState)
  const [prevNowState, setPrevNowState] = useState<NowState | null>(null)

  useEffect(() => {
    if (currentNowState === nowState) return
    setPrevNowState(nowState)
    setNowState(currentNowState)
    const timeout = window.setTimeout(() => setPrevNowState(null), 240)
    return () => window.clearTimeout(timeout)
  }, [currentNowState, nowState])

  const topStatus = useMemo(() => {
    return [
      `ENGINE: ${engineState.toUpperCase()}`,
      `DETAIL: ${engineDetail || 'READY'}`,
      `SOURCE: ${sourceKind.toUpperCase()}`,
      `CORS: ${sourceKind === 'local' ? 'N/A' : canDenoise === false ? 'BLOCKED' : 'UNKNOWN'}`,
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
        <a
          className="pcMiniBtn pcEpisodeDownload pcChamfer"
          href={ep.enclosureUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          DOWNLOAD
        </a>
      </div>
    ))
  }, [episodes, episode?.guid, startEpisode])

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
            <div className="pcBrandSub">/// HIGH-RES AUDIO ● ZEN MODE</div>
          </div>
        </div>

        <div className="pcHeaderStatus">{topStatus}</div>

        <div className="pcHeaderRight">
          <div className="pcSelectWrap pcChamfer">
            <div className="pcSelectMeta">
              <div className="pcSelectMetaLabel">SYSTEM</div>
              <div className="pcSelectMetaValue">MODEL</div>
            </div>
            <select
              className="pcSelect"
              value={modelId}
              onChange={(e) => {
                setModelId(e.target.value)
                setEngineDetail('Switching models requires refresh (v1).')
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
        <button
          className={`pcMobileDenoise ${denoiseEnabled ? 'on' : ''}`}
          disabled={!episode || !model?.supported}
          onClick={() => void toggleDenoise(!denoiseEnabled)}
        >
          {denoiseEnabled ? 'ON' : 'OFF'}
        </button>
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
                    setModelId(e.target.value)
                    setEngineDetail('Switching models requires refresh (v1).')
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
            <div className="pcNowState" aria-hidden="true">
              {prevNowState ? (
                <span
                  key={`out-${prevNowState}`}
                  className={`pcNowStateText pcNowStateOut ${NOW_STATE_CLASS[prevNowState]}`}
                >
                  {NOW_STATE_LABELS[prevNowState]}
                </span>
              ) : null}
              <span key={`in-${nowState}`} className={`pcNowStateText pcNowStateIn ${NOW_STATE_CLASS[nowState]}`}>
                {NOW_STATE_LABELS[nowState]}
              </span>
            </div>
            <div className="pcNowInner">
              <div className="pcNowTop">
                <div className="pcTag">NOW PLAYING</div>
                <div className="pcNowLine">
                  /// {sourceKind === 'local' ? 'LOCAL_FILE' : podcast?.feed.title ?? 'NO_SOURCE'} ///{' '}
                  {model ? model.id.toUpperCase() : 'MODEL'} /// {releaseDate ?? '—'}
                </div>
              </div>

              <h2 className="pcNowTitle">
                <span className="pcNowTitleHead">{split.head}</span>
                {split.accent ? <span className="pcNowTitleAccent">{split.accent}</span> : null}
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
                  <div className="pcControlsRow pcControlsRowPrimary">
                    <button className="pcSkip" onClick={playPrev} disabled={!canPrev} title="Previous">
                      <IconPrev size={26} />
                    </button>
                    <button
                      className={`pcPlay ${isPlaying ? 'on' : ''} ${isEpisodeLoading ? 'isLoading' : ''}`}
                      onClick={() => void togglePlayPause()}
                      title={isEpisodeLoading ? 'Loading…' : 'Play / Pause'}
                      disabled={!episode || isEpisodeLoading}
                    >
                      {isPlaying ? <IconPause size={44} /> : <IconPlay size={44} />}
                      {isEpisodeLoading ? <span className="pcSpinner pcPlaySpinner" aria-hidden="true" /> : null}
                    </button>
                    <button className="pcSkip" onClick={playNext} disabled={!canNext} title="Next">
                      <IconNext size={26} />
                    </button>
                  </div>

                  <div className="pcControlsRow pcControlsRowSecondary">
                    <button className="pcMiniBtn pcControlImport" onClick={() => fileInputRef.current?.click()}>
                      <IconUpload size={14} /> IMPORT
                    </button>
                    <div className="pcDenoiseControl">
                      <div className="pcMiniLabel">DENOISE</div>
                      <button
                        className={`pcSwitch pcDenoiseSwitch ${denoiseEnabled ? 'on' : ''}`}
                        disabled={!episode || !model?.supported || isDenoiseLoading}
                        onClick={() => void toggleDenoise(!denoiseEnabled)}
                        title={isDenoiseLoading ? 'Loading…' : `Denoise ${denoiseEnabled ? 'On' : 'Off'}`}
                      >
                        <span className="pcSwitchThumb" />
                      </button>
                      <div className={`pcProcState ${denoiseEnabled ? 'on' : ''}`}>{denoiseEnabled ? 'ON' : 'OFF'}</div>
                      {isDenoiseLoading ? <span className="pcSpinner pcSpinnerSm" aria-hidden="true" /> : null}
                    </div>
                  </div>
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
        accept="audio/*"
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
