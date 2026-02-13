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
} from "react";

import { DEFAULT_FEEDS, type DefaultFeed } from "./podcasts/defaultFeeds";
import {
  searchApplePodcasts,
  type ApplePodcastResult,
} from "./podcasts/appleSearch";
import { buildAppleLookupUrl } from "./podcasts/appleApi";
import { fetchAndParseRss } from "./podcasts/rss";
import type { ParsedPodcast, PodcastEpisode } from "./podcasts/types";

import { MODELS, getModelCandidateUrls, type ModelSpec } from "./models/models";
import { DenoiseEngine } from "./audio/engine";

import {
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
} from "./ui/icons";

type MobileView = "library" | "discover" | "showDetails";
type MobileDiscoverMode = "browse" | "search";
type DesktopView = "library" | "discover" | "showDetails";
type LibrarySortMode = "updated" | "alpha" | "count";
type LibraryFeedStats = { episodeCount: number; latestPubMs: number | null };

type SearchResultsProps = {
  results: ApplePodcastResult[];
  rssLoading: boolean;
  loadingFeedUrl: string | null;
  onSelect: (result: ApplePodcastResult) => void;
};

type BeforeInstallPromptEvent = Event & {
  platforms: string[];
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
};

type SidebarIssueSource =
  | "rss"
  | "search"
  | "audio"
  | "download"
  | "processing"
  | "runtime"
  | "system";

type SidebarIssue = {
  id: string;
  source: SidebarIssueSource;
  summary: string;
  detail: string;
  createdAt: number;
};

type AssetDownloadUiState = {
  assetLabel: string;
  sourceUrl: string;
  sourceLabel: string;
  attempt: number;
  totalAttempts: number;
  fileIndex?: number;
  totalFiles?: number;
  loadedBytes: number;
  totalBytes: number | null;
  phase: "downloading" | "retrying";
  errorDetail: string | null;
};

type CacheAssetHooks = {
  onDownloadStart?: (info: { absoluteUrl: string }) => void;
  onProgress?: (info: {
    absoluteUrl: string;
    loadedBytes: number;
    totalBytes: number | null;
  }) => void;
};

type ResolveModelHooks = {
  onDownloadStart?: (info: {
    url: string;
    attempt: number;
    totalAttempts: number;
  }) => void;
  onProgress?: (info: {
    url: string;
    attempt: number;
    totalAttempts: number;
    loadedBytes: number;
    totalBytes: number | null;
  }) => void;
  onSourceFailed?: (info: {
    url: string;
    attempt: number;
    totalAttempts: number;
    message: string;
  }) => void;
};

type ResolveOrtHooks = {
  onDownloadStart?: (info: {
    url: string;
    fileName: string;
    fileIndex: number;
    totalFiles: number;
    attempt: number;
    totalAttempts: number;
  }) => void;
  onProgress?: (info: {
    url: string;
    fileName: string;
    fileIndex: number;
    totalFiles: number;
    attempt: number;
    totalAttempts: number;
    loadedBytes: number;
    totalBytes: number | null;
  }) => void;
  onRetry?: (info: {
    url: string;
    fileName: string;
    fileIndex: number;
    totalFiles: number;
    attempt: number;
    totalAttempts: number;
    message: string;
  }) => void;
};

const LIBRARY_FEEDS_STORAGE_KEY = "poisecast.libraryFeeds.v1";

function formatIssueSource(source: SidebarIssueSource): string {
  switch (source) {
    case "rss":
      return "RSS";
    case "search":
      return "Search";
    case "audio":
      return "Audio";
    case "download":
      return "Download";
    case "processing":
      return "Processing";
    case "runtime":
      return "Runtime";
    default:
      return "System";
  }
}

function coerceErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value instanceof DOMException) return value.message;
  if (value === null || value === undefined) return "Unknown error";
  return String(value);
}

function normalizeIssueDetail(raw: string, maxLen = 260): string {
  const compact = raw.replace(/\r\n/g, "\n").trim();
  const firstLine =
    compact
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "Unknown error";
  return firstLine.length > maxLen
    ? `${firstLine.slice(0, maxLen - 1)}…`
    : firstLine;
}

function normalizeIssueCardDetail(raw: string): string {
  const compact = raw.replace(/\r\n/g, "\n").trim();
  return compact || "Unknown error";
}

function ignoreError(): void {
  // Deliberate no-op for best-effort operations.
}

function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.href).toString();
  } catch {
    return url;
  }
}

function parseContentLength(headers: Headers): number | null {
  const raw = headers.get("content-length");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function describeModelSource(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.hostname === "raw.githubusercontent.com") return "GitHub Raw";
    if (parsed.origin === window.location.origin) return "Local /models";
    return parsed.hostname;
  } catch {
    return "Unknown source";
  }
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(label)), ms);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `${label} timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

const fetchFeedArtwork = async (rssUrl: string): Promise<string | null> => {
  try {
    const parsed = await fetchAndParseRss(rssUrl);
    const feedImage = parsed.feed.imageUrl?.trim();
    if (feedImage) return feedImage;
  } catch {
    // Fall through to lookup fallback below.
  }
  const meta = await fetchFeedLookupMeta(rssUrl);
  return meta?.artworkUrl ?? null;
};

type FeedLookupMeta = {
  artworkUrl: string | null;
  genres: string[];
};

function normalizeLookupGenre(value?: string): string | null {
  const v = value?.replace(/\s+/g, " ").trim();
  if (!v) return null;
  if (/^(podcast|podcasts|rss|feed)$/i.test(v)) return null;
  return v;
}

function dedupeGenres(
  values: Array<string | undefined | null>,
  max = 6,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const genre = normalizeLookupGenre(value ?? undefined);
    if (!genre) continue;
    const key = genre.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(genre);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeFeedEntry(value: unknown): DefaultFeed | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    title?: unknown;
    rssUrl?: unknown;
    category?: unknown;
  };

  if (typeof candidate.rssUrl !== "string") return null;
  const rssUrl = candidate.rssUrl.trim();
  if (!rssUrl) return null;

  const title =
    typeof candidate.title === "string" && candidate.title.trim().length > 0
      ? candidate.title.trim()
      : rssUrl;
  const category =
    typeof candidate.category === "string" && candidate.category.trim().length > 0
      ? candidate.category.trim()
      : undefined;

  return {
    title,
    rssUrl,
    ...(category ? { category } : {}),
  };
}

function normalizeFeedUrlKey(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function dedupeFeedsByUrl(feeds: DefaultFeed[]): DefaultFeed[] {
  const seen = new Set<string>();
  const out: DefaultFeed[] = [];
  for (const feed of feeds) {
    const key = normalizeFeedUrlKey(feed.rssUrl);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(feed);
  }
  return out;
}

function loadPersistedLibraryFeeds(): DefaultFeed[] {
  try {
    const raw = localStorage.getItem(LIBRARY_FEEDS_STORAGE_KEY);
    if (!raw) return dedupeFeedsByUrl(DEFAULT_FEEDS);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return dedupeFeedsByUrl(DEFAULT_FEEDS);
    const normalized = dedupeFeedsByUrl(
      parsed
        .map((item) => normalizeFeedEntry(item))
        .filter((item): item is DefaultFeed => item !== null),
    );
    return normalized.length > 0 ? normalized : dedupeFeedsByUrl(DEFAULT_FEEDS);
  } catch {
    return dedupeFeedsByUrl(DEFAULT_FEEDS);
  }
}

const fetchFeedLookupMeta = async (
  rssUrl: string,
): Promise<FeedLookupMeta | null> => {
  try {
    const res = await fetch(buildAppleLookupUrl(rssUrl));
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        artworkUrl600?: string;
        artworkUrl512?: string;
        artworkUrl100?: string;
        primaryGenreName?: string;
        genres?: string[];
      }>;
    };
    const item = data?.results?.[0];
    const artworkUrl =
      item?.artworkUrl600 || item?.artworkUrl512 || item?.artworkUrl100 || null;
    const genres = dedupeGenres([
      item?.primaryGenreName,
      ...(item?.genres ?? []),
    ]);
    return { artworkUrl, genres };
  } catch {
    return null;
  }
};

const SearchResults = memo(function SearchResults({
  results,
  rssLoading,
  loadingFeedUrl,
  onSelect,
}: SearchResultsProps) {
  if (!results.length) return null;
  return (
    <div className="pcSearchResults">
      {results.map((r) => {
        const isLoading = !!loadingFeedUrl && r.feedUrl === loadingFeedUrl;
        return (
          <button
            key={r.collectionId}
            className={`pcSearchItem pcChamfer ${isLoading ? "isLoading" : ""}`}
            disabled={!r.feedUrl || rssLoading || isLoading}
            title={
              r.feedUrl
                ? r.feedUrl
                : "No RSS URL provided by Apple for this result"
            }
            onClick={() => {
              if (!r.feedUrl) return;
              onSelect(r);
            }}
          >
            <div className="pcSearchItemTitle">{r.collectionName}</div>
            <div className="pcSearchItemMeta">
              {r.artistName ? (
                <span className="pcPill">{r.artistName}</span>
              ) : null}
              {r.primaryGenreName ? (
                <span className="pcPill">{r.primaryGenreName}</span>
              ) : null}
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
        );
      })}
    </div>
  );
});

type SourceListProps = {
  feeds: DefaultFeed[];
  activeUrl: string;
  rssLoading: boolean;
  loadingFeedUrl: string | null;
  imageByUrl?: Record<string, string>;
  showThumbs?: boolean;
  onSelect: (feed: DefaultFeed) => void;
};

const SourceList = memo(function SourceList({
  feeds,
  activeUrl,
  rssLoading,
  loadingFeedUrl,
  onSelect,
}: SourceListProps) {
  return (
    <div className="pcSourceList pcListStack">
      {feeds.map((f) => {
        const isActive =
          normalizeFeedUrlKey(activeUrl) === normalizeFeedUrlKey(f.rssUrl);
        const isLoading =
          !!loadingFeedUrl &&
          normalizeFeedUrlKey(f.rssUrl) === normalizeFeedUrlKey(loadingFeedUrl);
        return (
          <button
            key={f.rssUrl}
            className={`pcSourceItem ${isActive ? "active" : ""} ${isLoading ? "isLoading" : ""}`}
            disabled={rssLoading || isLoading}
            onClick={() => onSelect(f)}
          >
            <div className="pcSourceItemTitle">{f.title}</div>
            <div className="pcSourceItemMeta">
              <span className="pcSourceUrl">{f.rssUrl}</span>
              {isActive ? (
                <span className="pcActiveIndicator"></span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
});

type EpisodeListProps = {
  items: ReactNode;
  hasEpisodes: boolean;
};

const EpisodeList = memo(function EpisodeList({
  items,
  hasEpisodes,
}: EpisodeListProps) {
  return (
    <div className="pcEpisodeList">
      <table>
        <tbody>{items}</tbody>
      </table>
      {!hasEpisodes ? (
        <div className="pcEmpty">No episodes. Load a feed.</div>
      ) : null}
    </div>
  );
});

function useIsMobile(maxWidthPx = 980): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(`(max-width:${maxWidthPx}px)`).matches,
  );
  useEffect(() => {
    const m = window.matchMedia(`(max-width:${maxWidthPx}px)`);
    const onChange = () => setIsMobile(m.matches);
    onChange();
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, [maxWidthPx]);
  return isMobile;
}

function useOverflowPanText<T extends HTMLElement>(
  text: string,
): {
  ref: React.MutableRefObject<T | null>;
  overflow: boolean;
  distance: number;
  style: CSSProperties;
} {
  const ref = useRef<T | null>(null);
  const [state, setState] = useState({ overflow: false, distance: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const container = el.parentElement;
    if (!container) return;

    const measure = () => {
      const overflowPx = Math.ceil(el.scrollWidth - container.clientWidth);
      if (overflowPx > 4) {
        setState((prev) => {
          if (prev.overflow && prev.distance === overflowPx) return prev;
          return { overflow: true, distance: overflowPx };
        });
        return;
      }
      setState((prev) =>
        prev.overflow || prev.distance !== 0
          ? { overflow: false, distance: 0 }
          : prev,
      );
    };

    measure();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      ro.observe(container);
    }
    window.addEventListener("resize", measure);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text]);

  const style = {
    ["--pc-pan-distance" as const]: `${state.distance}px`,
  } as CSSProperties;

  return { ref, overflow: state.overflow, distance: state.distance, style };
}

function formatClock(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds as number)) return "--:--";
  const s = Math.max(0, Math.floor(seconds as number));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(ss)}` : `${m}:${pad2(ss)}`;
}

function getLatestEpisodePubMs(episodes: PodcastEpisode[]): number | null {
  let latest: number | null = null;
  for (const episode of episodes) {
    if (!episode.pubDate) continue;
    const parsed = new Date(episode.pubDate).getTime();
    if (Number.isNaN(parsed)) continue;
    if (latest === null || parsed > latest) latest = parsed;
  }
  return latest;
}

function summarizeFeedStats(parsedPodcast: ParsedPodcast): LibraryFeedStats {
  return {
    episodeCount: parsedPodcast.episodes.length,
    latestPubMs: getLatestEpisodePubMs(parsedPodcast.episodes),
  };
}

function normalizeFeedDescription(value?: string, maxLen = 420): string | null {
  if (!value) return null;
  const plain =
    new DOMParser()
      .parseFromString(value, "text/html")
      .body.textContent?.replace(/\s+/g, " ")
      .trim() ?? "";
  if (!plain) return null;
  return plain.length > maxLen ? `${plain.slice(0, maxLen - 1)}…` : plain;
}

function feedHostFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toUpperCase();
  } catch {
    return "UNKNOWN_HOST";
  }
}

function splitTitle(title: string): { head: string; accent?: string } {
  const t = title.trim();
  if (!t) return { head: "—" };
  const seps = [": ", " - ", " — "];
  for (const sep of seps) {
    const i = t.indexOf(sep);
    if (i > 10 && i < t.length - 8) {
      return {
        head: t.slice(0, i + sep.length).trimEnd(),
        accent: t.slice(i + sep.length).trim(),
      };
    }
  }
  return { head: t };
}

function useScrambleText(text: string, durationMs = 700, delayMs = 0): string {
  const [display, setDisplay] = useState(text);
  const rafRef = useRef<number | null>(null);
  const delayRef = useRef<number | null>(null);
  const scrambleRef = useRef<number[]>([]);
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&";

  useEffect(() => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (delayRef.current) {
      window.clearTimeout(delayRef.current);
      delayRef.current = null;
    }

    if (!text) return;

    const chars = text.split("");
    const reveals = chars.map((ch, i) => {
      if (!/[A-Za-z0-9]/.test(ch)) return 0;
      const base = i / Math.max(1, chars.length - 1);
      return Math.min(1, base * 0.65 + Math.random() * 0.35);
    });
    scrambleRef.current = reveals;

    const begin = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / durationMs);
        const next = chars
          .map((ch, i) => {
            if (!/[A-Za-z0-9]/.test(ch)) return ch;
            if (p >= (scrambleRef.current[i] ?? 0)) return ch;
            return charset[Math.floor(Math.random() * charset.length)];
          })
          .join("");
        setDisplay(next);
        if (p < 1) {
          rafRef.current = window.requestAnimationFrame(tick);
        } else {
          setDisplay(text);
          rafRef.current = null;
        }
      };
      rafRef.current = window.requestAnimationFrame(tick);
    };

    if (delayMs > 0) {
      delayRef.current = window.setTimeout(() => {
        delayRef.current = null;
        begin();
      }, delayMs);
    } else {
      begin();
    }

    return () => {
      if (delayRef.current) {
        window.clearTimeout(delayRef.current);
        delayRef.current = null;
      }
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [text, durationMs, delayMs]);

  return text ? display : text;
}

async function corsProbe(url: string): Promise<boolean> {
  // Same-origin is always fine.
  try {
    const u = new URL(url, window.location.href);
    if (u.origin === window.location.origin) return true;
  } catch {
    return false;
  }

  // Many hosts block CORS; try a cheap probe (HEAD then a 1-byte ranged GET).
  try {
    const head = await fetch(url, { method: "HEAD", mode: "cors" });
    if (head.ok) return true;
  } catch {
    ignoreError();
  }

  try {
    const get = await fetch(url, {
      method: "GET",
      mode: "cors",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
    return get.ok;
  } catch {
    return false;
  }
}

function isStandaloneMode(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

function getInstallHelpMessage(): string {
  const ua = window.navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const isSafari =
    /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua);
  const isFirefox = /Firefox|FxiOS/i.test(ua);

  if (isFirefox && isWindows) {
    return "Firefox on Windows: click the Web Apps button in the address bar to install this site. If it is missing, update Firefox and use a regular (non-private) window.";
  }
  if (isFirefox && isAndroid) {
    return "Firefox on Android: open the browser menu, then choose Install or Add to Home screen.";
  }
  if (isIOS && isSafari) {
    return 'Safari on iOS: tap Share, then choose "Add to Home Screen".';
  }
  if (isFirefox) {
    return "Firefox web-app install is currently available on Windows desktop and Android. On this device, use Chrome or Edge.";
  }
  return 'If no prompt appears, open your browser menu and choose "Install app" or "Add to Home screen".';
}

const MODEL_CACHE_NAME = "poisecast-assets";
const ORT_DOWNLOAD_RETRY_MAX = 3;
const DEFAULT_GITHUB_ORT_BASE_URL =
  "https://raw.githubusercontent.com/chabandou/poisecast/master/ort";
const ORT_WASM_CORE_FILES = [
  "ort-wasm.wasm",
  "ort-wasm-simd.wasm",
  "ort-wasm-simd.jsep.wasm",
] as const;
const ORT_WASM_EXTENDED_FILES = [
  "ort-wasm-threaded.wasm",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.asyncify.wasm",
] as const;

const AUDIO_FILE_ACCEPT =
  "audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,.webm,.m4b,.mp4";
const FOOTER_SLIDE_MS = 500;
const FOOTER_EXPAND_REVEAL_MS = 600;
const ASSET_FETCH_TIMEOUT_MS = 120_000;
const ENGINE_INIT_TIMEOUT_MS = 90_000;
const MEDIA_SESSION_ACTIONS: MediaSessionAction[] = [
  "play",
  "pause",
  "stop",
  "seekbackward",
  "seekforward",
  "seekto",
  "previoustrack",
  "nexttrack",
];
const MEDIA_SESSION_ARTWORK_SIZES = [
  "96x96",
  "128x128",
  "192x192",
  "256x256",
  "384x384",
  "512x512",
] as const;

function clearMediaSessionActionHandlers(session: MediaSession): void {
  for (const action of MEDIA_SESSION_ACTIONS) {
    try {
      session.setActionHandler(action, null);
    } catch {
      ignoreError();
    }
  }
}

function inferArtworkMimeType(src: string): string | undefined {
  try {
    const path = new URL(src, window.location.href).pathname.toLowerCase();
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".webp")) return "image/webp";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  } catch {
    ignoreError();
  }
  return undefined;
}

function buildMediaSessionArtwork(src: string): MediaImage[] {
  const absoluteSrc = toAbsoluteUrl(src);
  const mimeType = inferArtworkMimeType(absoluteSrc);
  return MEDIA_SESSION_ARTWORK_SIZES.map((sizes) => {
    const image: MediaImage = { src: absoluteSrc, sizes };
    if (mimeType) image.type = mimeType;
    return image;
  });
}

async function probeAssetDownload(assetUrl: string): Promise<void> {
  try {
    const head = await fetchWithTimeout(
      assetUrl,
      { method: "HEAD", cache: "no-store" },
      ASSET_FETCH_TIMEOUT_MS,
      `Asset probe failed for ${assetUrl}`,
    );
    if (head.ok) return;
  } catch {
    ignoreError();
  }

  const res = await fetchWithTimeout(
    assetUrl,
    {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    },
    ASSET_FETCH_TIMEOUT_MS,
    `Asset probe failed for ${assetUrl}`,
  );
  if (res.body) {
    void res.body.cancel().catch(() => {});
  }
  if (!res.ok) {
    throw new Error(`Asset download failed (${res.status})`);
  }
}

async function cacheAssetOnDemand(
  assetUrl: string,
  hooks: CacheAssetHooks = {},
): Promise<{ fromCache: boolean; absoluteUrl: string }> {
  const absoluteUrl = toAbsoluteUrl(assetUrl);
  if (!("caches" in window)) {
    hooks.onDownloadStart?.({ absoluteUrl });
    await probeAssetDownload(absoluteUrl);
    return { fromCache: false, absoluteUrl };
  }

  const cache = await caches.open(MODEL_CACHE_NAME);
  const hit = await cache.match(absoluteUrl, { ignoreSearch: true });
  if (hit) return { fromCache: true, absoluteUrl };

  hooks.onDownloadStart?.({ absoluteUrl });
  const res = await fetchWithTimeout(
    absoluteUrl,
    { cache: "no-store" },
    ASSET_FETCH_TIMEOUT_MS,
    `Asset download failed for ${absoluteUrl}`,
  );
  if (!res.ok) {
    throw new Error(`Asset download failed (${res.status})`);
  }

  const totalBytes = parseContentLength(res.headers);
  const onProgress = hooks.onProgress;
  if (res.body && onProgress) {
    const [cacheStream, progressStream] = res.body.tee();
    const cachePutPromise = cache.put(
      absoluteUrl,
      new Response(cacheStream, {
        status: res.status,
        statusText: res.statusText,
        headers: new Headers(res.headers),
      }),
    );

    const progressPromise = (async () => {
      let loadedBytes = 0;
      onProgress({ absoluteUrl, loadedBytes, totalBytes });
      const reader = progressStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          loadedBytes += value?.byteLength ?? 0;
          onProgress({ absoluteUrl, loadedBytes, totalBytes });
        }
      } finally {
        reader.releaseLock();
      }
    })();

    await Promise.all([cachePutPromise, progressPromise]);
  } else {
    await cache.put(absoluteUrl, res.clone());
  }

  return { fromCache: false, absoluteUrl };
}

async function resolveModelInitUrl(
  model: ModelSpec,
  hooks: ResolveModelHooks = {},
): Promise<string> {
  const attempts: string[] = [];
  const candidateUrls = getModelCandidateUrls(model);
  for (let index = 0; index < candidateUrls.length; index += 1) {
    const url = candidateUrls[index];
    const attempt = index + 1;
    const totalAttempts = candidateUrls.length;
    const absoluteAttemptUrl = toAbsoluteUrl(url);

    try {
      const result = await cacheAssetOnDemand(url, {
        onDownloadStart: ({ absoluteUrl }) => {
          hooks.onDownloadStart?.({ url: absoluteUrl, attempt, totalAttempts });
        },
        onProgress: ({ absoluteUrl, loadedBytes, totalBytes }) => {
          hooks.onProgress?.({
            url: absoluteUrl,
            attempt,
            totalAttempts,
            loadedBytes,
            totalBytes,
          });
        },
      });
      return result.absoluteUrl;
    } catch (e) {
      const detail = normalizeIssueDetail(coerceErrorMessage(e), 140);
      hooks.onSourceFailed?.({
        url: absoluteAttemptUrl,
        attempt,
        totalAttempts,
        message: detail,
      });
      attempts.push(`${absoluteAttemptUrl} (${detail})`);
    }
  }

  const summary = attempts.join(" | ");
  throw new Error(
    `Model download failed from all configured sources: ${summary || "unknown error"}`,
  );
}

async function resolveOrtAssetsReady(
  baseUrl: string,
  files: readonly string[],
  hooks: ResolveOrtHooks = {},
): Promise<string> {
  const normalizedBaseUrl = normalizeBaseUrl(
    baseUrl,
    DEFAULT_GITHUB_ORT_BASE_URL,
  );
  const totalFiles = files.length;
  const fileLoaded = new Map<string, number>();
  const fileTotals = new Map<string, number | null>();

  const emitProgress = (
    fileName: string,
    info: {
      url: string;
      fileIndex: number;
      attempt: number;
      totalAttempts: number;
      loadedBytes: number;
      totalBytes: number | null;
    },
  ) => {
    fileLoaded.set(fileName, info.loadedBytes);
    fileTotals.set(fileName, info.totalBytes);
    hooks.onProgress?.({
      ...info,
      fileName,
      totalFiles,
      loadedBytes: Array.from(fileLoaded.values()).reduce(
        (sum, next) => sum + next,
        0,
      ),
      totalBytes: Array.from(fileTotals.values()).every(
        (v) => typeof v === "number" && v > 0,
      )
        ? (Array.from(fileTotals.values()) as number[]).reduce(
            (sum, next) => sum + next,
            0,
          )
        : null,
    });
  };

  for (let i = 0; i < totalFiles; i += 1) {
    const fileName = files[i];
    const fileIndex = i + 1;
    const url = `${normalizedBaseUrl}/${fileName}`;

    let completed = false;
    for (let attempt = 1; attempt <= ORT_DOWNLOAD_RETRY_MAX; attempt += 1) {
      hooks.onDownloadStart?.({
        url,
        fileName,
        fileIndex,
        totalFiles,
        attempt,
        totalAttempts: ORT_DOWNLOAD_RETRY_MAX,
      });

      try {
        const result = await cacheAssetOnDemand(url, {
          onDownloadStart: ({ absoluteUrl }) => {
            emitProgress(fileName, {
              url: absoluteUrl,
              fileIndex,
              attempt,
              totalAttempts: ORT_DOWNLOAD_RETRY_MAX,
              loadedBytes: fileLoaded.get(fileName) ?? 0,
              totalBytes: fileTotals.get(fileName) ?? null,
            });
          },
          onProgress: ({ absoluteUrl, loadedBytes, totalBytes }) => {
            emitProgress(fileName, {
              url: absoluteUrl,
              fileIndex,
              attempt,
              totalAttempts: ORT_DOWNLOAD_RETRY_MAX,
              loadedBytes,
              totalBytes,
            });
          },
        });

        if (result.fromCache) {
          emitProgress(fileName, {
            url: result.absoluteUrl,
            fileIndex,
            attempt,
            totalAttempts: ORT_DOWNLOAD_RETRY_MAX,
            loadedBytes: fileLoaded.get(fileName) ?? 0,
            totalBytes: fileTotals.get(fileName) ?? null,
          });
        }

        completed = true;
        break;
      } catch (e) {
        const message = normalizeIssueDetail(coerceErrorMessage(e), 180);
        hooks.onRetry?.({
          url,
          fileName,
          fileIndex,
          totalFiles,
          attempt,
          totalAttempts: ORT_DOWNLOAD_RETRY_MAX,
          message,
        });
        if (attempt < ORT_DOWNLOAD_RETRY_MAX) {
          await sleep(300 * attempt);
        }
      }
    }

    if (!completed) {
      throw new Error(
        `ORT runtime download failed for ${fileName} after ${ORT_DOWNLOAD_RETRY_MAX} attempts`,
      );
    }
  }

  return normalizedBaseUrl;
}

function isLikelyAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  return /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|webm|m4b|mp4)$/i.test(file.name);
}

function buildStreamProxyUrl(sourceUrl: string): string {
  return `/api/stream?url=${encodeURIComponent(sourceUrl)}`;
}

function isSameOriginUrl(value: string): boolean {
  try {
    return (
      new URL(value, window.location.href).origin === window.location.origin
    );
  } catch {
    return false;
  }
}

async function probeStreamProxy(proxyUrl: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(proxyUrl, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (res.body) {
      void res.body.cancel().catch(() => {});
    }
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function waitForAudioMetadata(
  audioEl: HTMLAudioElement,
  timeoutMs = 12_000,
): Promise<void> {
  if (audioEl.readyState >= 1) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer = 0;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      audioEl.removeEventListener("loadedmetadata", onLoaded);
      audioEl.removeEventListener("error", onError);
      if (timer) window.clearTimeout(timer);
      fn();
    };

    const onLoaded = () => finish(resolve);
    const onError = () => {
      const code = audioEl.error?.code;
      finish(() =>
        reject(
          new Error(
            `Audio metadata load failed${code ? ` (media error ${code})` : ""}`,
          ),
        ),
      );
    };

    audioEl.addEventListener("loadedmetadata", onLoaded, { once: true });
    audioEl.addEventListener("error", onError, { once: true });
    timer = window.setTimeout(() => {
      finish(() => reject(new Error("Timed out waiting for episode metadata")));
    }, timeoutMs);
  });
}

export default function App() {
  const isMobile = useIsMobile(980);
  const initialLibraryFeeds = useMemo(() => loadPersistedLibraryFeeds(), []);
  const initialRssUrl =
    initialLibraryFeeds[0]?.rssUrl ?? DEFAULT_FEEDS[0]?.rssUrl ?? "";
  const [mobileView, setMobileView] = useState<MobileView>("library");
  const [mobileDiscoverMode, setMobileDiscoverMode] =
    useState<MobileDiscoverMode>("browse");
  const [discoverFocusToken, setDiscoverFocusToken] = useState(0);
  const [desktopView, setDesktopView] = useState<DesktopView>("library");
  const [sidebarIssues, setSidebarIssues] = useState<SidebarIssue[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const proxyBypassRef = useRef<Set<string>>(new Set());
  const proxyVerifiedRef = useRef<Set<string>>(new Set());
  const lastInferenceAtRef = useRef(0);
  const footerCloseTimerRef = useRef<number | null>(null);
  const footerExpandTimerRef = useRef<number | null>(null);

  const engineRef = useRef<DenoiseEngine | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const searchCacheRef = useRef<Map<string, ApplePodcastResult[]>>(new Map());
  const feedCacheRef = useRef<Map<string, ParsedPodcast>>(new Map());

  const searchCacheKey = "poisecast.searchCache.v1";
  const feedCacheKey = "poisecast.feedCache.v1";
  const feedImageCacheKey = "poisecast.feedImageCache.v1";
  const maxSearchCache = 50;
  const maxFeedCache = 20;

  const [modelId] = useState(MODELS[0]?.id ?? "denoiser_model");
  const model = useMemo(
    () => MODELS.find((m) => m.id === modelId) ?? MODELS[0],
    [modelId],
  );
  const getRemotePlaybackUrl = useCallback((ep: PodcastEpisode): string => {
    if (proxyBypassRef.current.has(ep.guid)) return ep.enclosureUrl;
    return buildStreamProxyUrl(ep.enclosureUrl);
  }, []);

  const [libraryFeeds, setLibraryFeeds] = useState<DefaultFeed[]>(
    initialLibraryFeeds,
  );
  const [rssUrl, setRssUrl] = useState(initialRssUrl);
  const [isCurrentShowFollowed, setIsCurrentShowFollowed] = useState(
    () =>
      !!initialRssUrl &&
      initialLibraryFeeds.some(
        (feed) =>
          normalizeFeedUrlKey(feed.rssUrl) === normalizeFeedUrlKey(initialRssUrl),
      ),
  );
  const [isFollowCheckPending, setIsFollowCheckPending] = useState(false);
  const [rssLoading, setRssLoading] = useState(false);
  const [rssError, setRssError] = useState<string | null>(null);
  const [podcast, setPodcast] = useState<ParsedPodcast | null>(null);
  const [episode, setEpisode] = useState<PodcastEpisode | null>(null);
  const [nowPlayingArtworkUrl, setNowPlayingArtworkUrl] = useState<
    string | null
  >(null);
  const [sourceKind, setSourceKind] = useState<"remote" | "local">("remote");

  const [searchTerm, setSearchTerm] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ApplePodcastResult[]>([]);
  const [loadingFeedUrl, setLoadingFeedUrl] = useState<string | null>(null);
  const [loadingEpisodeId, setLoadingEpisodeId] = useState<string | null>(null);
  const [feedImages, setFeedImages] = useState<Record<string, string>>({});
  const [libraryQuery, setLibraryQuery] = useState("");
  const [librarySortMode, setLibrarySortMode] =
    useState<LibrarySortMode>("updated");
  const [libraryStatsByUrl, setLibraryStatsByUrl] = useState<
    Record<string, LibraryFeedStats>
  >({});
  const feedImageFetchRef = useRef<Set<string>>(new Set());

  const [episodeQuery, setEpisodeQuery] = useState("");
  const [episodeReverse, setEpisodeReverse] = useState(false);
  const [mobileEpisodeLimit, setMobileEpisodeLimit] = useState(3);
  const deferredEpisodeQuery = useDeferredValue(episodeQuery);

  const [engineState, setEngineState] = useState<string>("idle");
  const [engineDetail, setEngineDetail] = useState<string>("");
  const [denoiseEnabled, setDenoiseEnabled] = useState(false);
  const [, setCanDenoise] = useState<boolean | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode());

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.66);
  const [lastNonZeroVolume, setLastNonZeroVolume] = useState(0.66);
  const [isInferenceActive, setIsInferenceActive] = useState(false);
  const [isProcessingStarting, setIsProcessingStarting] = useState(false);
  const [isFooterClosing, setIsFooterClosing] = useState(false);
  const [isFooterCollapsing, setIsFooterCollapsing] = useState(false);
  const [isFooterExpanding, setIsFooterExpanding] = useState(false);
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [isFooterDescriptionExpanded, setIsFooterDescriptionExpanded] =
    useState(false);
  const [isFooterDescriptionOverflowing, setIsFooterDescriptionOverflowing] =
    useState(false);
  const [
    footerDescriptionExpandedMaxHeight,
    setFooterDescriptionExpandedMaxHeight,
  ] = useState(0);
  const [modelDownloadUi, setModelDownloadUi] =
    useState<AssetDownloadUiState | null>(null);
  const [ortDownloadUi, setOrtDownloadUi] =
    useState<AssetDownloadUiState | null>(null);
  const [downloadModalKind, setDownloadModalKind] = useState<
    "ort" | "model" | null
  >(null);

  const ortBaseUrl = useMemo(
    () =>
      normalizeBaseUrl(
        import.meta.env.VITE_GITHUB_ORT_BASE_URL,
        DEFAULT_GITHUB_ORT_BASE_URL,
      ),
    [],
  );
  const ortCoreReadyRef = useRef(false);
  const ortExtendedReadyRef = useRef(false);
  const ortCoreInitPromiseRef = useRef<Promise<string> | null>(null);
  const ortExtendedInitPromiseRef = useRef<Promise<string> | null>(null);

  const episodesAll = useMemo(
    () => podcast?.episodes ?? [],
    [podcast?.episodes],
  );
  const episodes = useMemo(() => {
    const q = deferredEpisodeQuery.trim().toLowerCase();
    const filtered = !q
      ? episodesAll
      : episodesAll.filter((e) => e.title.toLowerCase().includes(q));
    return episodeReverse ? [...filtered].reverse() : filtered;
  }, [deferredEpisodeQuery, episodeReverse, episodesAll]);

  // Keep the status in the mobile top bar; desktop has the floating widget.
  const nowTitle = episode?.title ?? "Select an episode";
  const nowTitleRef = useRef<HTMLHeadingElement | null>(null);
  const footerDescriptionRef = useRef<HTMLDivElement | null>(null);
  const discoverSearchInputRef = useRef<HTMLInputElement | null>(null);
  const libraryGridRef = useRef<HTMLDivElement | null>(null);

  const progressPct =
    duration && duration > 0
      ? Math.max(0, Math.min(1, currentTime / duration))
      : 0;
  const isEpisodeLoading =
    !!loadingEpisodeId && episode?.guid === loadingEpisodeId;

  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const onModeChange = () => setIsInstalled(isStandaloneMode());
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    onModeChange();
    mode.addEventListener?.("change", onModeChange);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      mode.removeEventListener?.("change", onModeChange);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (installing) return;
    if (!installPrompt) {
      window.alert(getInstallHelpMessage());
      return;
    }
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstallPrompt(null);
    } finally {
      setInstalling(false);
    }
  }, [installPrompt, installing]);

  const canInstall = !isInstalled;

  const reportIssue = useCallback(
    (source: SidebarIssueSource, summary: string, detail: unknown) => {
      const normalizedSummary = summary.trim() || "System error";
      const normalizedDetail = normalizeIssueCardDetail(
        coerceErrorMessage(detail),
      );
      setSidebarIssues((prev) => {
        const latest = prev[0];
        if (
          latest &&
          latest.source === source &&
          latest.summary === normalizedSummary &&
          latest.detail === normalizedDetail
        ) {
          return prev;
        }
        const issue: SidebarIssue = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          source,
          summary: normalizedSummary,
          detail: normalizedDetail,
          createdAt: Date.now(),
        };
        return [issue, ...prev].slice(0, 8);
      });
    },
    [],
  );

  const clearSidebarIssues = useCallback(() => {
    setSidebarIssues([]);
  }, []);

  const ensureOrtAssetsReady = useCallback(
    async (opts: { showModal: boolean; mode: "core" | "extended" }) => {
      const isExtended = opts.mode === "extended";
      if (isExtended ? ortExtendedReadyRef.current : ortCoreReadyRef.current)
        return ortBaseUrl;

      if (opts.showModal) {
        setDownloadModalKind("ort");
        setOrtDownloadUi((prev) => {
          if (prev) return prev;
          return {
            assetLabel: isExtended
              ? "ONNX Runtime WASM Extended"
              : "ONNX Runtime WASM Core",
            sourceUrl: ortBaseUrl,
            sourceLabel: describeModelSource(ortBaseUrl),
            attempt: 1,
            totalAttempts: ORT_DOWNLOAD_RETRY_MAX,
            loadedBytes: 0,
            totalBytes: null,
            phase: "downloading",
            errorDetail: null,
          };
        });
      }

      const files = isExtended ? ORT_WASM_EXTENDED_FILES : ORT_WASM_CORE_FILES;
      const labelPrefix = isExtended
        ? "ONNX Runtime WASM Extended"
        : "ONNX Runtime WASM Core";
      const targetPromiseRef = isExtended
        ? ortExtendedInitPromiseRef
        : ortCoreInitPromiseRef;

      if (!targetPromiseRef.current) {
        targetPromiseRef.current = resolveOrtAssetsReady(ortBaseUrl, files, {
          onDownloadStart: ({
            url,
            fileName,
            fileIndex,
            totalFiles,
            attempt,
            totalAttempts,
          }) => {
            const sourceLabel = describeModelSource(url);
            setOrtDownloadUi((prev) => ({
              assetLabel: `${labelPrefix} (${fileIndex}/${totalFiles})`,
              sourceUrl: url,
              sourceLabel,
              attempt,
              totalAttempts,
              fileIndex,
              totalFiles,
              loadedBytes: prev?.loadedBytes ?? 0,
              totalBytes: prev?.totalBytes ?? null,
              phase: "downloading",
              errorDetail: null,
            }));
            if (opts.showModal) {
              setEngineDetail(
                `Downloading runtime asset ${fileName} from ${sourceLabel}…`,
              );
            }
          },
          onProgress: ({
            url,
            fileIndex,
            totalFiles,
            attempt,
            totalAttempts,
            loadedBytes,
            totalBytes,
          }) => {
            const sourceLabel = describeModelSource(url);
            setOrtDownloadUi({
              assetLabel: `${labelPrefix} (${fileIndex}/${totalFiles})`,
              sourceUrl: url,
              sourceLabel,
              attempt,
              totalAttempts,
              fileIndex,
              totalFiles,
              loadedBytes,
              totalBytes,
              phase: "downloading",
              errorDetail: null,
            });
          },
          onRetry: ({
            url,
            fileIndex,
            totalFiles,
            attempt,
            totalAttempts,
            message,
          }) => {
            const sourceLabel = describeModelSource(url);
            setOrtDownloadUi((prev) => ({
              assetLabel: `${labelPrefix} (${fileIndex}/${totalFiles})`,
              sourceUrl: url,
              sourceLabel,
              attempt,
              totalAttempts,
              fileIndex,
              totalFiles,
              loadedBytes: prev?.loadedBytes ?? 0,
              totalBytes: prev?.totalBytes ?? null,
              phase: "retrying",
              errorDetail: message,
            }));
            if (opts.showModal) {
              setEngineDetail(
                `Runtime download failed (attempt ${attempt}/${totalAttempts}). Retrying…`,
              );
            }
          },
        })
          .then((readyBaseUrl) => {
            if (isExtended) ortExtendedReadyRef.current = true;
            else ortCoreReadyRef.current = true;
            return readyBaseUrl;
          })
          .catch((e) => {
            if (isExtended) {
              ortExtendedReadyRef.current = false;
              ortExtendedInitPromiseRef.current = null;
            } else {
              ortCoreReadyRef.current = false;
              ortCoreInitPromiseRef.current = null;
            }
            throw e;
          });
      }

      return targetPromiseRef.current;
    },
    [ortBaseUrl],
  );

  useEffect(() => {
    if (!rssError) return;
    reportIssue("rss", "Failed to load RSS feed", rssError);
  }, [reportIssue, rssError]);

  useEffect(() => {
    if (!searchError) return;
    reportIssue("search", "Podcast search failed", searchError);
  }, [reportIssue, searchError]);

  useEffect(() => {
    if (engineState !== "error") return;
    reportIssue(
      "processing",
      "Model/inference error",
      engineDetail || "The denoise engine reported an unexpected error.",
    );
  }, [engineDetail, engineState, reportIssue]);

  useEffect(() => {
    void ensureOrtAssetsReady({ showModal: false, mode: "core" }).catch(() => {
      // Ignore background bootstrap failures; processing flow will retry on demand.
    });
  }, [ensureOrtAssetsReady]);

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      const message = event.message || coerceErrorMessage(event.error);
      reportIssue("runtime", "Unhandled runtime error", message);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportIssue("runtime", "Unhandled async error", event.reason);
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [reportIssue]);

  const cancelFooterCloseTimer = useCallback(() => {
    if (footerCloseTimerRef.current !== null) {
      window.clearTimeout(footerCloseTimerRef.current);
      footerCloseTimerRef.current = null;
    }
  }, []);

  const cancelFooterExpandTimer = useCallback(() => {
    if (footerExpandTimerRef.current !== null) {
      window.clearTimeout(footerExpandTimerRef.current);
      footerExpandTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!denoiseEnabled || !isPlaying || engineState !== "ready") {
      setIsInferenceActive(false);
      return;
    }

    const thresholdMs = 700;
    const intervalMs = 180;
    const updateInferenceState = () => {
      const isActive =
        performance.now() - lastInferenceAtRef.current <= thresholdMs;
      setIsInferenceActive((prev) => (prev === isActive ? prev : isActive));
    };

    updateInferenceState();
    const timer = window.setInterval(updateInferenceState, intervalMs);
    return () => window.clearInterval(timer);
  }, [denoiseEnabled, isPlaying, engineState]);

  useEffect(() => {
    // Default load.
    try {
      const searchRaw = localStorage.getItem(searchCacheKey);
      if (searchRaw) {
        const parsed = JSON.parse(searchRaw) as {
          entries: [string, ApplePodcastResult[]][];
        };
        if (Array.isArray(parsed?.entries)) {
          searchCacheRef.current = new Map(
            parsed.entries.slice(0, maxSearchCache),
          );
        }
      }
      const feedRaw = localStorage.getItem(feedCacheKey);
      if (feedRaw) {
        const parsed = JSON.parse(feedRaw) as {
          entries: [string, ParsedPodcast][];
        };
        if (Array.isArray(parsed?.entries)) {
          const entries = parsed.entries.slice(0, maxFeedCache);
          feedCacheRef.current = new Map(entries);
          const seededLibraryStats: Record<string, LibraryFeedStats> = {};
          for (const [url, cachedPodcast] of entries) {
            seededLibraryStats[url] = summarizeFeedStats(cachedPodcast);
          }
          setLibraryStatsByUrl(seededLibraryStats);
        }
      }
      const imageRaw = localStorage.getItem(feedImageCacheKey);
      if (imageRaw) {
        const parsed = JSON.parse(imageRaw) as Record<string, string>;
        if (parsed && typeof parsed === "object") {
          setFeedImages(parsed);
        }
      }
    } catch {
      ignoreError();
    }
    void loadFeed(rssUrl);
    return () => {
      cancelFooterCloseTimer();
      cancelFooterExpandTimer();
      engineRef.current?.setInferenceActivityHandler(null);
      void engineRef.current?.dispose();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMobileEpisodeLimit(3);
  }, [episodeReverse, rssUrl, deferredEpisodeQuery]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LIBRARY_FEEDS_STORAGE_KEY,
        JSON.stringify(libraryFeeds),
      );
    } catch {
      ignoreError();
    }
  }, [libraryFeeds]);

  useEffect(() => {
    if (isFollowCheckPending) return;
    if (!rssUrl) {
      setIsCurrentShowFollowed(false);
      return;
    }
    const followed = libraryFeeds.some(
      (feed) => normalizeFeedUrlKey(feed.rssUrl) === normalizeFeedUrlKey(rssUrl),
    );
    setIsCurrentShowFollowed(followed);
  }, [isFollowCheckPending, libraryFeeds, rssUrl]);

  useEffect(() => {
    if (!isFollowCheckPending) return;
    const targetRssUrl = rssUrl;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const followed = libraryFeeds.some(
        (feed) =>
          normalizeFeedUrlKey(feed.rssUrl) === normalizeFeedUrlKey(targetRssUrl),
      );
      setIsCurrentShowFollowed(followed);
      setIsFollowCheckPending(false);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isFollowCheckPending, libraryFeeds, rssUrl]);

  useEffect(() => {
    if (!episode?.guid) {
      cancelFooterExpandTimer();
      setIsFooterExpanding(false);
      setIsFooterExpanded(false);
      setIsSidebarCompact(false);
      return;
    }

    if (isMobile) {
      cancelFooterExpandTimer();
      setIsFooterExpanding(false);
      setIsSidebarCompact(false);
      return;
    }

    if (isFooterExpanded) {
      setIsSidebarCompact(true);
    }
  }, [cancelFooterExpandTimer, episode?.guid, isFooterExpanded, isMobile]);

  useEffect(() => {
    const q = searchTerm.trim();
    setSearchError(null);
    if (!q) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const cacheKey = `${q.toLowerCase()}|10`;
    const cached = searchCacheRef.current.get(cacheKey);
    if (cached) {
      setSearchResults(cached);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          setSearchLoading(true);
          const results = await searchApplePodcasts(q, 10, controller.signal);
          searchCacheRef.current.set(cacheKey, results);
          if (searchCacheRef.current.size > maxSearchCache) {
            const firstKey = searchCacheRef.current.keys().next().value as
              | string
              | undefined;
            if (firstKey) searchCacheRef.current.delete(firstKey);
          }
          try {
            localStorage.setItem(
              searchCacheKey,
              JSON.stringify({
                entries: Array.from(searchCacheRef.current.entries()),
              }),
            );
          } catch {
            ignoreError();
          }
          setSearchResults(results);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setSearchResults([]);
          setSearchError(e instanceof Error ? e.message : String(e));
        } finally {
          setSearchLoading(false);
        }
      })();
    }, 400);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [searchTerm]);

  useEffect(() => {
    if (!isMobile) return;
    if (mobileView !== "discover" || mobileDiscoverMode !== "search") return;
    const frame = window.requestAnimationFrame(() => {
      const input = discoverSearchInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [discoverFocusToken, isMobile, mobileDiscoverMode, mobileView]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () =>
      setCurrentTime(Number.isFinite(el.currentTime) ? el.currentTime : 0);
    const onDur = () =>
      setDuration(Number.isFinite(el.duration) ? el.duration : null);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onReady = () => setLoadingEpisodeId(null);
    const onError = () => {
      setLoadingEpisodeId(null);
      const mediaError = el.error;
      const mediaMessage = mediaError
        ? `code ${mediaError.code}: ${mediaError.message || "Media playback error"}`
        : "Unknown audio playback error";
      reportIssue("audio", "Audio playback error", mediaMessage);
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("durationchange", onDur);
    el.addEventListener("loadedmetadata", onDur);
    el.addEventListener("canplay", onReady);
    el.addEventListener("play", onPlay);
    el.addEventListener("playing", onReady);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);

    // Sync initial values.
    onTime();
    onDur();
    setIsPlaying(!el.paused);

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("durationchange", onDur);
      el.removeEventListener("loadedmetadata", onDur);
      el.removeEventListener("canplay", onReady);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("playing", onReady);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
    };
  }, [reportIssue]);

  const loadFeed = useCallback(
    async (url: string) => {
      cancelFooterCloseTimer();
      setIsFooterClosing(false);
      setLoadingFeedUrl(url);
      setRssLoading(true);
      setRssError(null);
      setPodcast(null);
      const audioEl = audioRef.current;
      const shouldKeepCurrentEpisode =
        !!episode?.guid &&
        !!audioEl &&
        !!audioEl.src &&
        !audioEl.ended &&
        (!audioEl.paused ||
          (Number.isFinite(audioEl.currentTime) && audioEl.currentTime > 0));
      if (!shouldKeepCurrentEpisode) {
        setEpisode(null);
        setNowPlayingArtworkUrl(null);
      }
      setSourceKind("remote");
      setCanDenoise(null);
      setDenoiseEnabled(false);
      setIsInferenceActive(false);
      setIsProcessingStarting(false);
      lastInferenceAtRef.current = 0;
      setEpisodeQuery("");
      engineRef.current?.setEnabled(false);

      try {
        const cached = feedCacheRef.current.get(url);
        let parsed = cached ?? (await fetchAndParseRss(url));
        let cacheDirty = !cached;

        let lookup: FeedLookupMeta | null = null;
        if (!parsed.feed?.imageUrl || !parsed.feed?.genres?.length) {
          lookup = await fetchFeedLookupMeta(url);
        }

        if (
          (!parsed.feed?.genres || parsed.feed.genres.length === 0) &&
          lookup?.genres?.length
        ) {
          parsed = {
            ...parsed,
            feed: {
              ...parsed.feed,
              genres: lookup.genres,
            },
          };
          cacheDirty = true;
        }

        if (cacheDirty) {
          feedCacheRef.current.set(url, parsed);
          if (feedCacheRef.current.size > maxFeedCache) {
            const firstKey = feedCacheRef.current.keys().next().value as
              | string
              | undefined;
            if (firstKey) feedCacheRef.current.delete(firstKey);
          }
          try {
            localStorage.setItem(
              feedCacheKey,
              JSON.stringify({
                entries: Array.from(feedCacheRef.current.entries()),
              }),
            );
          } catch {
            ignoreError();
          }
        }

        const bestImage = parsed.feed?.imageUrl || lookup?.artworkUrl || null;
        if (bestImage) {
          setFeedImages((prev) => {
            if (prev[url] === bestImage) return prev;
            const next = { ...prev, [url]: bestImage };
            try {
              localStorage.setItem(feedImageCacheKey, JSON.stringify(next));
            } catch {
              ignoreError();
            }
            return next;
          });
        }
        const nextStats = summarizeFeedStats(parsed);
        setLibraryStatsByUrl((prev) => {
          const existing = prev[url];
          if (
            existing &&
            existing.episodeCount === nextStats.episodeCount &&
            existing.latestPubMs === nextStats.latestPubMs
          ) {
            return prev;
          }
          return { ...prev, [url]: nextStats };
        });
        setPodcast(parsed);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setRssError(
          [
            msg,
            "",
            "If this is a CORS error:",
            "1) Some RSS hosts block browser fetch. Try a different feed, or paste a CORS-friendly mirror.",
            "2) For denoising, the episode audio must allow CORS OR you must import a downloaded file.",
          ].join("\n"),
        );
      } finally {
        setRssLoading(false);
        setLoadingFeedUrl(null);
      }
    },
    [cancelFooterCloseTimer, episode?.guid],
  );

  async function ensureEngine() {
    if (!model) throw new Error("No model selected");
    if (!model.supported)
      throw new Error("Selected model is not supported yet");

    if (!engineRef.current) engineRef.current = new DenoiseEngine();
    engineRef.current.setInferenceActivityHandler(() => {
      lastInferenceAtRef.current = performance.now();
    });

    if (!initPromiseRef.current) {
      setEngineState("loading-model");
      setEngineDetail("Preparing ONNX runtime…");
      setDownloadModalKind("ort");
      setOrtDownloadUi((prev) => {
        if (prev) return prev;
        return {
          assetLabel: "ONNX Runtime WASM Core",
          sourceUrl: ortBaseUrl,
          sourceLabel: describeModelSource(ortBaseUrl),
          attempt: 1,
          totalAttempts: ORT_DOWNLOAD_RETRY_MAX,
          loadedBytes: 0,
          totalBytes: null,
          phase: "downloading",
          errorDetail: null,
        };
      });
      initPromiseRef.current = (async () => {
        const ortWasmBaseUrl = await ensureOrtAssetsReady({
          showModal: true,
          mode: "core",
        });
        setEngineDetail("Loading ONNX session…");
        const modelCandidateUrls = getModelCandidateUrls(model);
        const initialModelSourceUrl = toAbsoluteUrl(
          modelCandidateUrls[0] ?? model.url,
        );
        setDownloadModalKind("model");
        setModelDownloadUi((prev) => {
          if (prev) return prev;
          return {
            assetLabel: model.label,
            sourceUrl: initialModelSourceUrl,
            sourceLabel: describeModelSource(initialModelSourceUrl),
            attempt: 1,
            totalAttempts: Math.max(1, modelCandidateUrls.length),
            loadedBytes: 0,
            totalBytes: null,
            phase: "downloading",
            errorDetail: null,
          };
        });
        const modelUrl = await resolveModelInitUrl(model, {
          onDownloadStart: ({ url, attempt, totalAttempts }) => {
            const sourceLabel = describeModelSource(url);
            setDownloadModalKind("model");
            setModelDownloadUi({
              assetLabel: model.label,
              sourceUrl: url,
              sourceLabel,
              attempt,
              totalAttempts,
              loadedBytes: 0,
              totalBytes: null,
              phase: "downloading",
              errorDetail: null,
            });
            setEngineDetail(`Downloading model from ${sourceLabel}…`);
          },
          onProgress: ({
            url,
            attempt,
            totalAttempts,
            loadedBytes,
            totalBytes,
          }) => {
            const sourceLabel = describeModelSource(url);
            setModelDownloadUi((prev) => ({
              assetLabel: prev?.assetLabel ?? model.label,
              sourceUrl: url,
              sourceLabel,
              attempt,
              totalAttempts,
              loadedBytes,
              totalBytes,
              phase: "downloading",
              errorDetail: prev?.phase === "retrying" ? prev.errorDetail : null,
            }));
          },
          onSourceFailed: ({ url, attempt, totalAttempts, message }) => {
            const sourceLabel = describeModelSource(url);
            setModelDownloadUi((prev) => ({
              assetLabel: prev?.assetLabel ?? model.label,
              sourceUrl: url,
              sourceLabel,
              attempt,
              totalAttempts,
              loadedBytes: prev?.loadedBytes ?? 0,
              totalBytes: prev?.totalBytes ?? null,
              phase: "retrying",
              errorDetail: message,
            }));
            if (attempt < totalAttempts) {
              setEngineDetail(
                "Primary model source failed. Trying fallback source…",
              );
            }
          },
        });

        const initSession = async () => {
          setEngineDetail("Initializing ONNX runtime session…");
          await withTimeout(
            engineRef.current!.init({
              modelUrl,
              sampleRateHz: model.sampleRateHz,
              ortWasmBaseUrl,
              assetCacheName: MODEL_CACHE_NAME,
            }),
            ENGINE_INIT_TIMEOUT_MS,
            "Timed out while initializing ONNX runtime/session",
          );
          engineRef.current!.setWarmupMs(250);
        };

        try {
          await initSession();
        } catch (firstInitError) {
          if (!ortExtendedReadyRef.current) {
            setEngineDetail("Loading additional runtime variants…");
            await ensureOrtAssetsReady({ showModal: true, mode: "extended" });
            setEngineDetail("Retrying ONNX session init…");

            try {
              await engineRef.current?.dispose();
            } catch {
              ignoreError();
            }

            engineRef.current = new DenoiseEngine();
            engineRef.current.setInferenceActivityHandler(() => {
              lastInferenceAtRef.current = performance.now();
            });

            await initSession();
          } else {
            throw firstInitError;
          }
        }
      })();
    }

    try {
      await initPromiseRef.current;
      const st = engineRef.current!.status;
      if (st.state === "ready") {
        setEngineState("ready");
        setEngineDetail(
          `Backend: ${st.backend.toUpperCase()} · frame ${st.frameSize}`,
        );
      } else if (st.state === "error") {
        setEngineState("error");
        setEngineDetail(st.message);
      } else {
        setEngineState(st.state);
        setEngineDetail("");
      }
    } catch (e) {
      setEngineState("error");
      setEngineDetail(e instanceof Error ? e.message : String(e));
      initPromiseRef.current = null;
      throw e;
    } finally {
      setModelDownloadUi(null);
      setDownloadModalKind(null);
    }
  }

  const stopEpisodeAndHideFooter = useCallback(() => {
    cancelFooterCloseTimer();
    cancelFooterExpandTimer();

    const audioEl = audioRef.current;
    if (audioEl) {
      try {
        audioEl.pause();
      } catch {
        ignoreError();
      }
      audioEl.removeAttribute("crossorigin");
      audioEl.removeAttribute("src");
      audioEl.load();
    }

    setLoadingEpisodeId(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(null);
    setCanDenoise(null);
    setDenoiseEnabled(false);
    // setIsSidebarCompact(false) // Moved inside setTimeout
    setIsInferenceActive(false);
    setIsProcessingStarting(false);
    lastInferenceAtRef.current = 0;
    engineRef.current?.setEnabled(false);

    setIsFooterClosing(true);
    footerCloseTimerRef.current = window.setTimeout(() => {
      setEpisode(null);
      setNowPlayingArtworkUrl(null);
      setIsFooterClosing(false);
      setIsFooterExpanding(false);
      setIsFooterExpanded(false);
      setIsFooterCollapsing(false);
      setIsSidebarCompact(false); // Moved here
      footerCloseTimerRef.current = null;
    }, FOOTER_SLIDE_MS + 20); // Slightly longer than FOOTER_SLIDE_MS to ensure animation completes
  }, [cancelFooterCloseTimer, cancelFooterExpandTimer]);

  const startEpisode = useCallback(
    async (ep: PodcastEpisode) => {
      const audioEl = audioRef.current;
      if (!audioEl) return;
      cancelFooterCloseTimer();

      if (episode?.guid === ep.guid) {
        stopEpisodeAndHideFooter();
        return;
      }
      setIsFooterClosing(false);

      setLoadingEpisodeId(ep.guid);
      setEpisode(ep);
      setNowPlayingArtworkUrl(podcast?.feed.imageUrl || feedImages[rssUrl] || null);
      setSourceKind("remote");
      setCanDenoise(null);
      setDenoiseEnabled(false);
      setIsInferenceActive(false);
      setIsProcessingStarting(false);
      lastInferenceAtRef.current = 0;
      engineRef.current?.setEnabled(false);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      let playbackUrl = getRemotePlaybackUrl(ep);
      if (
        playbackUrl !== ep.enclosureUrl &&
        !proxyVerifiedRef.current.has(ep.guid)
      ) {
        const proxyOk = await probeStreamProxy(playbackUrl);
        if (!proxyOk) {
          proxyBypassRef.current.add(ep.guid);
          playbackUrl = ep.enclosureUrl;
          setEngineDetail(
            "Proxy unavailable for this episode. Using direct stream.",
          );
        } else {
          proxyVerifiedRef.current.add(ep.guid);
        }
      }

      audioEl.removeAttribute("crossorigin");
      audioEl.src = playbackUrl;
      audioEl.load();

      try {
        await audioEl.play();
      } catch {
        // User gesture / autoplay restrictions.
      }

      if (isMobile) setMobileView("showDetails");
    },
    [
      cancelFooterCloseTimer,
      episode?.guid,
      feedImages,
      getRemotePlaybackUrl,
      isMobile,
      podcast?.feed.imageUrl,
      rssUrl,
      stopEpisodeAndHideFooter,
    ],
  );

  const openMobileLibraryView = useCallback(() => {
    setMobileView("library");
  }, []);

  const openMobileDiscoverBrowseView = useCallback(() => {
    setMobileDiscoverMode("browse");
    setMobileView("discover");
  }, []);

  const openMobileDiscoverSearchView = useCallback(() => {
    setMobileDiscoverMode("search");
    setMobileView("discover");
    setDiscoverFocusToken((prev) => prev + 1);
  }, []);

  const openMobileShowDetailsView = useCallback(() => {
    setMobileView("showDetails");
  }, []);

  const openLibraryView = useCallback(() => {
    if (isMobile) {
      openMobileLibraryView();
      return;
    }
    setDesktopView("library");
  }, [isMobile, openMobileLibraryView]);

  const openDiscoverView = useCallback(() => {
    if (isMobile) {
      openMobileDiscoverBrowseView();
      return;
    }
    setDesktopView("discover");
  }, [isMobile, openMobileDiscoverBrowseView]);

  const openShowDetailsView = useCallback(() => {
    if (isMobile) {
      openMobileShowDetailsView();
      return;
    }
    setDesktopView("showDetails");
  }, [isMobile, openMobileShowDetailsView]);

  const handleSearchSelect = useCallback(
    (result: ApplePodcastResult) => {
      if (!result.feedUrl) return;
      setIsCurrentShowFollowed(false);
      setIsFollowCheckPending(true);
      setRssUrl(result.feedUrl);
      void loadFeed(result.feedUrl);
      openShowDetailsView();
    },
    [loadFeed, openShowDetailsView],
  );

  const handleSourceSelect = useCallback(
    (feed: DefaultFeed) => {
      setIsCurrentShowFollowed(true);
      setIsFollowCheckPending(false);
      setRssUrl(feed.rssUrl);
      void loadFeed(feed.rssUrl);
      openShowDetailsView();
    },
    [loadFeed, openShowDetailsView],
  );
  const handleLibraryCardSelect = useCallback(
    (feed: DefaultFeed) => {
      if (rssLoading || loadingFeedUrl === feed.rssUrl) return;
      handleSourceSelect(feed);
    },
    [handleSourceSelect, loadingFeedUrl, rssLoading],
  );

  async function startLocalFile(file: File) {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    if (!isLikelyAudioFile(file)) {
      const msg =
        "File is not recognized as audio. Try MP3, M4A, WAV, FLAC, or OGG.";
      setEngineDetail(msg);
      reportIssue("audio", "Unsupported local audio file", msg);
      return;
    }

    cancelFooterCloseTimer();
    setIsFooterClosing(false);
    setCanDenoise(null);
    setDenoiseEnabled(false);
    setIsInferenceActive(false);
    setIsProcessingStarting(false);
    lastInferenceAtRef.current = 0;
    engineRef.current?.setEnabled(false);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    setSourceKind("local");
    const localEp: PodcastEpisode = {
      guid: `local:${file.name}:${file.size}:${file.lastModified}`,
      title: file.name,
      enclosureUrl: url,
    };
    setLoadingEpisodeId(localEp.guid);
    setEpisode(localEp);
    setNowPlayingArtworkUrl(null);
    setCanDenoise(true);

    // Switch source first for immediate playback.
    try {
      audioEl.pause();
    } catch {
      ignoreError();
    }
    audioEl.removeAttribute("crossorigin");
    audioEl.src = url;
    audioEl.load();
    try {
      await audioEl.play();
    } catch {
      ignoreError();
    }

    if (isMobile) openMobileShowDetailsView();
  }

  async function toggleDenoise(next: boolean) {
    const audioEl = audioRef.current;
    if (!audioEl || !episode) return;
    const remotePlaybackUrl =
      sourceKind === "remote"
        ? getRemotePlaybackUrl(episode)
        : episode.enclosureUrl;
    const remoteNeedsCors =
      sourceKind === "remote" && !isSameOriginUrl(remotePlaybackUrl);

    if (!next) {
      setDenoiseEnabled(false);
      setIsInferenceActive(false);
      setIsProcessingStarting(false);
      lastInferenceAtRef.current = 0;
      engineRef.current?.setEnabled(false);
      audioEl.removeAttribute("crossorigin");
      return;
    }

    setIsProcessingStarting(true);
    setEngineDetail("");
    setEngineState(engineRef.current?.status.state ?? "idle");
    try {
      const ok =
        sourceKind === "local"
          ? true
          : remoteNeedsCors
            ? await corsProbe(remotePlaybackUrl)
            : true;
      setCanDenoise(ok);
      if (!ok) {
        setDenoiseEnabled(false);
        setIsInferenceActive(false);
        lastInferenceAtRef.current = 0;
        setEngineDetail("CORS blocked. Download + import the file to denoise.");
        return;
      }

      const ensureEnginePromise = ensureEngine();

      if (sourceKind === "remote") {
        // Switch the media element into CORS mode and reload the source, otherwise WebAudio will be blocked
        // even if the host supports CORS (because it was initially loaded without CORS).
        const wasPaused = audioEl.paused;
        const t = Number.isFinite(audioEl.currentTime)
          ? audioEl.currentTime
          : 0;
        if (remoteNeedsCors) audioEl.crossOrigin = "anonymous";
        else audioEl.removeAttribute("crossorigin");
        audioEl.src = remotePlaybackUrl;
        audioEl.load();
        await waitForAudioMetadata(audioEl);
        try {
          if (t > 0) audioEl.currentTime = t;
        } catch {
          ignoreError();
        }
        if (!wasPaused) {
          try {
            await audioEl.play();
          } catch {
            ignoreError();
          }
        }
      }

      await ensureEnginePromise;
      await engineRef.current!.attach(audioEl);
      engineRef.current!.setEnabled(true);
      setDenoiseEnabled(true);
    } catch (e) {
      const msg = coerceErrorMessage(e);
      setEngineState("error");
      setDenoiseEnabled(false);
      setIsInferenceActive(false);
      lastInferenceAtRef.current = 0;
      setEngineDetail(msg);
      reportIssue("processing", "Failed to enable audio processing", msg);
    } finally {
      setIsProcessingStarting(false);
    }
  }

  const togglePlayPause = useCallback(async () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    try {
      if (audioEl.paused) await audioEl.play();
      else audioEl.pause();
    } catch {
      // Autoplay restrictions; ignore.
    }
  }, []);

  function seekToPct(pct: number) {
    const audioEl = audioRef.current;
    if (!audioEl || !duration || duration <= 0) return;
    const next = Math.max(0, Math.min(duration, pct * duration));
    try {
      audioEl.currentTime = next;
    } catch {
      ignoreError();
    }
  }

  function onProgressPointer(e: PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = rect.width > 0 ? x / rect.width : 0;
    seekToPct(pct);
  }

  function setSeekFromClientX(clientX: number, el: HTMLDivElement) {
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const pct = rect.width > 0 ? x / rect.width : 0;
    seekToPct(pct);
  }

  function onMiniProgressPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    setSeekFromClientX(e.clientX, target);
    target.setPointerCapture(pointerId);

    const onMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      setSeekFromClientX(event.clientX, target);
    };
    const onStop = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onStop);
      target.removeEventListener("pointercancel", onStop);
      if (target.hasPointerCapture(pointerId))
        target.releasePointerCapture(pointerId);
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onStop);
    target.addEventListener("pointercancel", onStop);
  }

  function onMiniProgressKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!episode) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      seekBySeconds(10);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      seekBySeconds(-10);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      seekToPct(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      seekToPct(1);
    }
  }

  const setVolumeClamped = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    setVolume(clamped);
    if (clamped > 0) setLastNonZeroVolume(clamped);
  }, []);

  const setVolumeFromClientX = useCallback(
    (clientX: number, el: HTMLDivElement) => {
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = rect.width > 0 ? x / rect.width : 0;
      setVolumeClamped(pct);
    },
    [setVolumeClamped],
  );

  function onVolumePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    setVolumeFromClientX(e.clientX, target);
    target.setPointerCapture(pointerId);

    const onMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      setVolumeFromClientX(event.clientX, target);
    };
    const onStop = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onStop);
      target.removeEventListener("pointercancel", onStop);
      if (target.hasPointerCapture(pointerId))
        target.releasePointerCapture(pointerId);
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onStop);
    target.addEventListener("pointercancel", onStop);
  }

  function onVolumeKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = 0.05;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setVolumeClamped(volume + step);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setVolumeClamped(volume - step);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setVolumeClamped(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setVolumeClamped(1);
    }
  }

  function onVolumeWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.deltaY === 0) return;
    const direction = e.deltaY < 0 ? 1 : -1;
    const step = e.shiftKey ? 0.1 : 0.04;
    setVolumeClamped(volume + direction * step);
  }

  const toggleMute = useCallback(() => {
    if (volume === 0) {
      setVolumeClamped(lastNonZeroVolume > 0 ? lastNonZeroVolume : 0.66);
      return;
    }
    setVolumeClamped(0);
  }, [lastNonZeroVolume, setVolumeClamped, volume]);

  const toggleFooterExpansion = useCallback(() => {
    if (isFooterClosing) return;

    if (isFooterExpanded) {
      cancelFooterExpandTimer();
      if (!isMobile) setIsSidebarCompact(false);

      setIsFooterCollapsing(true);

      // Delay the footer height change so the sidebar gets a head start expanding
      // Reduced delay to 120ms for more overlap with sidebar expansion
      footerExpandTimerRef.current = window.setTimeout(() => {
        setIsFooterExpanded(false);
        setIsFooterExpanding(false);

        // Let controls appear slightly before the height transition finishes (600ms start for 750ms animation)
        footerExpandTimerRef.current = window.setTimeout(() => {
          setIsFooterCollapsing(false);
          footerExpandTimerRef.current = null;
        }, 600);
      }, 120);
      return;
    }

    if (isFooterExpanding) return;

    if (isMobile) {
      setIsFooterExpanded(true);
      return;
    }

    setIsFooterExpanding(true);
    setIsSidebarCompact(true);
    cancelFooterExpandTimer();
    const expandDelayMs = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : FOOTER_EXPAND_REVEAL_MS;
    footerExpandTimerRef.current = window.setTimeout(() => {
      setIsFooterExpanded(true);
      setIsFooterExpanding(false);
      footerExpandTimerRef.current = null;
    }, expandDelayMs);
  }, [
    cancelFooterExpandTimer,
    isFooterClosing,
    isFooterExpanded,
    isFooterExpanding,
    isMobile,
  ]);

  const seekBySeconds = useCallback(
    (deltaSeconds: number) => {
      const audioEl = audioRef.current;
      if (!audioEl || !episode) return;

      const current = Number.isFinite(audioEl.currentTime)
        ? audioEl.currentTime
        : 0;
      const max =
        Number.isFinite(audioEl.duration) && audioEl.duration > 0
          ? audioEl.duration
          : null;
      const unclamped = current + deltaSeconds;
      const next =
        max === null
          ? Math.max(0, unclamped)
          : Math.max(0, Math.min(max, unclamped));

      try {
        audioEl.currentTime = next;
      } catch {
        ignoreError();
      }
    },
    [episode],
  );

  const playPrev = useCallback(() => {
    if (!episode || sourceKind !== "remote" || !episodesAll.length) return;
    const idx = episodesAll.findIndex((e) => e.guid === episode.guid);
    const prev = idx > 0 ? episodesAll[idx - 1] : null;
    if (prev) void startEpisode(prev);
  }, [episode, episodesAll, sourceKind, startEpisode]);

  const playNext = useCallback(() => {
    if (!episode || sourceKind !== "remote" || !episodesAll.length) return;
    const idx = episodesAll.findIndex((e) => e.guid === episode.guid);
    const next =
      idx >= 0 && idx < episodesAll.length - 1 ? episodesAll[idx + 1] : null;
    if (next) void startEpisode(next);
  }, [episode, episodesAll, sourceKind, startEpisode]);

  const canPrev =
    sourceKind === "remote" && episode
      ? episodesAll.findIndex((e) => e.guid === episode.guid) > 0
      : false;
  const canNext =
    sourceKind === "remote" && episode
      ? episodesAll.findIndex((e) => e.guid === episode.guid) <
        episodesAll.length - 1
      : false;

  const isMobileLibraryView = isMobile && mobileView === "library";
  const isMobileDiscoverView = isMobile && mobileView === "discover";
  const isMobileShowDetailsView = isMobile && mobileView === "showDetails";
  const isMobileDiscoverBrowseView =
    isMobileDiscoverView && mobileDiscoverMode === "browse";
  const isMobileDiscoverSearchView =
    isMobileDiscoverView && mobileDiscoverMode === "search";
  const isDesktopLibraryView = !isMobile && desktopView === "library";
  const isDesktopDiscoverView = !isMobile && desktopView === "discover";
  const isDesktopShowDetailsView = !isMobile && desktopView === "showDetails";
  const isShowInfoLoading = !podcast && (rssLoading || !!loadingFeedUrl);
  const searchQuery = searchTerm.trim();
  const hasSearchQuery = searchQuery.length > 0;
  const footerProgressPct = Math.round(progressPct * 1000) / 10;
  const footerVolumePct = Math.round(volume * 100);
  const footerVolumeIcon =
    volume === 0 ? "volume_off" : volume < 0.5 ? "volume_down" : "volume_up";
  const footerEpisodeTitle = episode?.title ?? "Select an episode";
  const footerEpisodeShow =
    sourceKind === "local"
      ? "LOCAL FILE"
      : (podcast?.feed.title ?? "NO SOURCE SELECTED");
  const footerDescriptionHtml =
    episode?.description || "No description available.";
  const footerDescriptionStyle: CSSProperties | undefined =
    footerDescriptionExpandedMaxHeight > 0
      ? ({
          ["--pc-footer-description-expanded-height" as const]: `${footerDescriptionExpandedMaxHeight}px`,
        } as CSSProperties)
      : undefined;
  const footerTitlePan =
    useOverflowPanText<HTMLSpanElement>(footerEpisodeTitle);
  const footerShowPan = useOverflowPanText<HTMLSpanElement>(footerEpisodeShow);
  const footerPanActive = footerTitlePan.overflow || footerShowPan.overflow;
  const footerPanDistanceMax = Math.max(
    footerTitlePan.distance,
    footerShowPan.distance,
  );
  const footerPanDuration = Math.max(8, 8 + footerPanDistanceMax / 18);
  const footerPanSharedStyle = {
    ["--pc-pan-duration" as const]: `${footerPanDuration}s`,
    ["--pc-pan-delay" as const]: "0.8s",
  } as CSSProperties;
  const activeSource = useMemo(
    () =>
      libraryFeeds.find(
        (f) => normalizeFeedUrlKey(f.rssUrl) === normalizeFeedUrlKey(rssUrl),
      ),
    [libraryFeeds, rssUrl],
  );
  const showHost = useMemo(() => feedHostFromUrl(rssUrl), [rssUrl]);
  const showTitleRaw = isShowInfoLoading
    ? "LOADING SHOW..."
    : (podcast?.feed.title || activeSource?.title || "SELECT A SOURCE");
  const showTitleParts = useMemo(
    () => splitTitle(showTitleRaw),
    [showTitleRaw],
  );
  const showNetworkLabel = isShowInfoLoading
    ? "/// Loading feed metadata..."
    : `/// Source: ${showHost} · ${episodesAll.length} entries`;
  const sectionTagLabel = isShowInfoLoading
    ? "/// LOADING ENTRIES"
    : `/// ${episodes.length} ENTRIES`;
  const showTitleHeadScramble = useScrambleText(showTitleParts.head, 950, 0);
  const showTitleAccentScramble = useScrambleText(
    showTitleParts.accent ?? "",
    900,
    90,
  );
  const showMetaScramble = useScrambleText(showNetworkLabel, 850, 180);
  const sectionTagScramble = useScrambleText(sectionTagLabel, 850, 260);
  const showArtwork = podcast?.feed.imageUrl || feedImages[rssUrl] || null;
  const libraryImageByUrl = useMemo(() => {
    const imageByUrl = { ...feedImages };
    if (podcast?.feed.imageUrl) {
      imageByUrl[rssUrl] = podcast.feed.imageUrl;
    }
    return imageByUrl;
  }, [feedImages, podcast?.feed.imageUrl, rssUrl]);
  const libraryFeedsView = useMemo(() => {
    const normalizedQuery = libraryQuery.trim().toLowerCase();
    const filtered = libraryFeeds.filter((feed) => {
      if (!normalizedQuery) return true;
      return (
        feed.title.toLowerCase().includes(normalizedQuery) ||
        feed.rssUrl.toLowerCase().includes(normalizedQuery)
      );
    }).map((feed) => {
      const stats = libraryStatsByUrl[feed.rssUrl];
      return {
        ...feed,
        imageUrl: libraryImageByUrl[feed.rssUrl] ?? null,
        episodeCount: stats?.episodeCount ?? 0,
        latestPubMs: stats?.latestPubMs ?? null,
        isActive:
          normalizeFeedUrlKey(feed.rssUrl) === normalizeFeedUrlKey(rssUrl),
        isLoading:
          !!loadingFeedUrl &&
          normalizeFeedUrlKey(feed.rssUrl) ===
            normalizeFeedUrlKey(loadingFeedUrl),
      };
    });

    filtered.sort((a, b) => {
      if (librarySortMode === "alpha") {
        return a.title.localeCompare(b.title);
      }
      if (librarySortMode === "count") {
        if (a.episodeCount !== b.episodeCount) {
          return b.episodeCount - a.episodeCount;
        }
        return a.title.localeCompare(b.title);
      }
      const aLatest = a.latestPubMs;
      const bLatest = b.latestPubMs;
      if (aLatest === null && bLatest !== null) return 1;
      if (aLatest !== null && bLatest === null) return -1;
      if (aLatest !== null && bLatest !== null && aLatest !== bLatest) {
        return bLatest - aLatest;
      }
      return a.title.localeCompare(b.title);
    });

    return filtered;
  }, [
    libraryImageByUrl,
    libraryFeeds,
    libraryQuery,
    librarySortMode,
    libraryStatsByUrl,
    loadingFeedUrl,
    rssUrl,
  ]);
  const mobileVisibleEpisodes = useMemo(
    () => episodes.slice(0, mobileEpisodeLimit),
    [episodes, mobileEpisodeLimit],
  );
  const hasMoreMobileEpisodes = mobileEpisodeLimit < episodes.length;
  const fetchLibraryFeedArtwork = useCallback(
    async (url: string) => {
      if (!url || feedImages[url] || feedImageFetchRef.current.has(url)) return;
      feedImageFetchRef.current.add(url);
      try {
        const art = await fetchFeedArtwork(url);
        if (!art) return;
        setFeedImages((prev) => {
          if (prev[url] === art) return prev;
          const next = { ...prev, [url]: art };
          try {
            localStorage.setItem(feedImageCacheKey, JSON.stringify(next));
          } catch {
            ignoreError();
          }
          return next;
        });
      } finally {
        feedImageFetchRef.current.delete(url);
      }
    },
    [feedImageCacheKey, feedImages],
  );

  useEffect(() => {
    if (!isDesktopLibraryView && !isMobileLibraryView) return;
    const gridEl = libraryGridRef.current;
    if (!gridEl) return;

    const cards = Array.from(
      gridEl.querySelectorAll<HTMLElement>(".pcLibraryCard[data-rss-url]"),
    );
    if (!cards.length) return;

    if (typeof IntersectionObserver === "undefined") {
      for (const card of cards) {
        const url = card.dataset.rssUrl;
        if (url) void fetchLibraryFeedArtwork(url);
      }
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const card = entry.target as HTMLElement;
          const url = card.dataset.rssUrl;
          if (url) void fetchLibraryFeedArtwork(url);
        }
      },
      { root: null, rootMargin: "120px 0px", threshold: 0.01 },
    );

    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  }, [
    fetchLibraryFeedArtwork,
    isDesktopLibraryView,
    isMobileLibraryView,
    libraryFeedsView,
  ]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const session = navigator.mediaSession;
    if (!episode) {
      session.metadata = null;
      session.playbackState = "none";
      clearMediaSessionActionHandlers(session);
      return;
    }

    const artworkSrc =
      sourceKind === "local"
        ? "/icons/icon-512.png"
        : nowPlayingArtworkUrl || "/icons/icon-512.png";
    if (typeof MediaMetadata === "function") {
      session.metadata = new MediaMetadata({
        title: episode.title || "Unknown episode",
        artist:
          sourceKind === "local"
            ? "Local file"
            : (podcast?.feed.title ?? "Poisecast"),
        album:
          sourceKind === "local"
            ? "Poisecast"
            : (podcast?.feed.title ?? "Poisecast"),
        artwork: buildMediaSessionArtwork(artworkSrc),
      });
    } else {
      session.metadata = null;
    }

    clearMediaSessionActionHandlers(session);
    try {
      session.setActionHandler("play", () => {
        const audioEl = audioRef.current;
        if (!audioEl || !audioEl.paused) return;
        void audioEl.play().catch(() => {});
      });
    } catch {
      ignoreError();
    }
    try {
      session.setActionHandler("pause", () => {
        const audioEl = audioRef.current;
        if (!audioEl || audioEl.paused) return;
        audioEl.pause();
      });
    } catch {
      ignoreError();
    }
    try {
      session.setActionHandler("stop", () => {
        const audioEl = audioRef.current;
        if (!audioEl) return;
        audioEl.pause();
        try {
          audioEl.currentTime = 0;
        } catch {
          ignoreError();
        }
      });
    } catch {
      ignoreError();
    }
    try {
      session.setActionHandler("seekbackward", (details) => {
        const offset =
          typeof details.seekOffset === "number" &&
          Number.isFinite(details.seekOffset)
            ? details.seekOffset
            : 10;
        seekBySeconds(-offset);
      });
    } catch {
      ignoreError();
    }
    try {
      session.setActionHandler("seekforward", (details) => {
        const offset =
          typeof details.seekOffset === "number" &&
          Number.isFinite(details.seekOffset)
            ? details.seekOffset
            : 10;
        seekBySeconds(offset);
      });
    } catch {
      ignoreError();
    }
    try {
      session.setActionHandler("seekto", (details) => {
        const audioEl = audioRef.current;
        if (!audioEl) return;
        if (
          typeof details.seekTime !== "number" ||
          !Number.isFinite(details.seekTime)
        )
          return;

        const max =
          Number.isFinite(audioEl.duration) && audioEl.duration > 0
            ? audioEl.duration
            : details.seekTime;
        const next = Math.max(0, Math.min(max, details.seekTime));
        try {
          if (details.fastSeek && typeof audioEl.fastSeek === "function")
            audioEl.fastSeek(next);
          else audioEl.currentTime = next;
        } catch {
          ignoreError();
        }
      });
    } catch {
      ignoreError();
    }
    if (canPrev) {
      try {
        session.setActionHandler("previoustrack", playPrev);
      } catch {
        ignoreError();
      }
    }
    if (canNext) {
      try {
        session.setActionHandler("nexttrack", playNext);
      } catch {
        ignoreError();
      }
    }

    return () => {
      clearMediaSessionActionHandlers(session);
    };
  }, [
    canNext,
    canPrev,
    episode,
    playNext,
    playPrev,
    podcast?.feed.title,
    nowPlayingArtworkUrl,
    seekBySeconds,
    sourceKind,
  ]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = episode
      ? isPlaying
        ? "playing"
        : "paused"
      : "none";
  }, [episode, isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !episode) return;
    if (!duration || duration <= 0 || !Number.isFinite(duration)) return;

    const playbackRateRaw = audioRef.current?.playbackRate;
    const playbackRate =
      typeof playbackRateRaw === "number" && Number.isFinite(playbackRateRaw)
        ? playbackRateRaw
        : 1;
    const position = Math.max(
      0,
      Math.min(duration, Number.isFinite(currentTime) ? currentTime : 0),
    );
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position,
      });
    } catch {
      ignoreError();
    }
  }, [currentTime, duration, episode]);

  const showDescription = useMemo(() => {
    if (isShowInfoLoading) return "Loading selected feed…";
    const parsed = normalizeFeedDescription(podcast?.feed.description);
    if (parsed) return parsed;
    if (activeSource) return `Feed URL: ${activeSource.rssUrl}`;
    return "Select a source from the sidebar to load show details.";
  }, [activeSource, podcast?.feed.description, isShowInfoLoading]);
  const showGenres = useMemo(() => {
    if (isShowInfoLoading) return ["Loading..."];
    if (sourceKind === "local") return ["LOCAL FILE"];
    const parsed = (podcast?.feed.genres ?? []).filter(
      (g) => typeof g === "string" && g.trim().length > 0,
    );
    if (parsed.length) return parsed.slice(0, 3);
    if (activeSource?.category?.trim()) return [activeSource.category.trim()];
    return ["Podcast"];
  }, [activeSource?.category, podcast?.feed.genres, sourceKind, isShowInfoLoading]);
  const followCurrentShow = useCallback(() => {
    if (!rssUrl) return;
    const targetFeedKey = normalizeFeedUrlKey(rssUrl);
    const shouldUnfollow = isCurrentShowFollowed;
    const derivedTitle =
      podcast?.feed.title?.trim() ||
      activeSource?.title?.trim() ||
      feedHostFromUrl(rssUrl);
    const genreFromFeed = (podcast?.feed.genres ?? []).find(
      (genre) => typeof genre === "string" && genre.trim().length > 0,
    );
    const category =
      genreFromFeed?.trim() || activeSource?.category?.trim() || undefined;

    setLibraryFeeds((prev) => {
      const existingIndex = prev.findIndex(
        (feed) => normalizeFeedUrlKey(feed.rssUrl) === targetFeedKey,
      );
      if (shouldUnfollow) {
        if (existingIndex < 0) return prev;
        return prev.filter((_, idx) => idx !== existingIndex);
      }
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        const nextTitle = derivedTitle || existing.title;
        const nextCategory = category || existing.category;
        if (
          existing.title === nextTitle &&
          (existing.category ?? undefined) === (nextCategory ?? undefined)
        ) {
          return prev;
        }
        const next = [...prev];
        next[existingIndex] = {
          ...existing,
          title: nextTitle,
          ...(nextCategory ? { category: nextCategory } : {}),
        };
        return next;
      }

      return [
        {
          title: derivedTitle || rssUrl,
          rssUrl,
          ...(category ? { category } : {}),
        },
        ...prev,
      ];
    });
    setIsCurrentShowFollowed(!shouldUnfollow);
    setIsFollowCheckPending(false);
  }, [
    activeSource?.category,
    activeSource?.title,
    isCurrentShowFollowed,
    podcast?.feed.genres,
    podcast?.feed.title,
    rssUrl,
  ]);
  const footerCurrent = formatClock(currentTime);
  const footerDuration = formatClock(duration);
  const processingErrorText =
    engineState === "error"
      ? normalizeIssueDetail(engineDetail || "Unknown processing error")
      : null;
  const processingErrorInline = processingErrorText
    ? normalizeIssueDetail(processingErrorText, 72)
    : null;
  const processingStatus = isProcessingStarting
    ? "booting"
    : processingErrorText
      ? "error"
      : isInferenceActive
        ? "active"
        : "idle";
  const modelCandidateUrlsForUi = getModelCandidateUrls(model);
  const activeDownloadUi =
    downloadModalKind === "ort"
      ? ortDownloadUi
      : downloadModalKind === "model"
        ? modelDownloadUi
        : null;
  const fallbackDownloadUi: AssetDownloadUiState | null = downloadModalKind
    ? {
        assetLabel:
          downloadModalKind === "ort" ? "ONNX Runtime WASM Core" : model.label,
        sourceUrl:
          downloadModalKind === "ort"
            ? ortBaseUrl
            : toAbsoluteUrl(modelCandidateUrlsForUi[0] ?? model.url),
        sourceLabel:
          downloadModalKind === "ort"
            ? describeModelSource(ortBaseUrl)
            : describeModelSource(
                toAbsoluteUrl(modelCandidateUrlsForUi[0] ?? model.url),
              ),
        attempt: 1,
        totalAttempts:
          downloadModalKind === "model"
            ? Math.max(1, modelCandidateUrlsForUi.length)
            : ORT_DOWNLOAD_RETRY_MAX,
        loadedBytes: 0,
        totalBytes: null,
        phase: "downloading",
        errorDetail: null,
      }
    : null;
  const resolvedDownloadUi = activeDownloadUi ?? fallbackDownloadUi;
  const activeDownloadPercent =
    resolvedDownloadUi?.totalBytes && resolvedDownloadUi.totalBytes > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (resolvedDownloadUi.loadedBytes / resolvedDownloadUi.totalBytes) *
              100,
          ),
        )
      : null;
  const activeDownloadBytes =
    resolvedDownloadUi?.totalBytes && resolvedDownloadUi.totalBytes > 0
      ? `${formatByteSize(resolvedDownloadUi.loadedBytes)} / ${formatByteSize(resolvedDownloadUi.totalBytes)}`
      : resolvedDownloadUi
        ? `${formatByteSize(resolvedDownloadUi.loadedBytes)} downloaded`
        : "";
  const activeDownloadPhaseLabel =
    resolvedDownloadUi?.phase === "retrying"
      ? "Switching source…"
      : "Downloading…";
  const activeDownloadTitle =
    downloadModalKind === "ort"
      ? "Downloading Runtime Assets"
      : "Downloading AI model";
  const activeDownloadAssetLabel =
    downloadModalKind === "ort" ? "Runtime" : "Model";
  const activeDownloadAttemptLabel =
    downloadModalKind === "ort" ? "Attempt" : "Source";
  const footerProcessTooltip = !episode
    ? "Select an episode to enable audio processing"
    : isProcessingStarting
      ? "Initializing audio processing (loading runtime/model)…"
      : processingErrorText
        ? `Processing error: ${processingErrorText}`
        : denoiseEnabled
          ? "Disable audio processing (AI denoise)"
          : "Enable audio processing (AI denoise)";
  const toggleFooterDescriptionExpanded = useCallback(() => {
    setIsFooterDescriptionExpanded((prev) => !prev);
  }, []);

  const measureFooterDescriptionOverflow = useCallback(() => {
    const el = footerDescriptionRef.current;
    if (!el) {
      setIsFooterDescriptionOverflowing(false);
      setFooterDescriptionExpandedMaxHeight(0);
      return;
    }

    const parent = el.parentElement;
    if (!parent) {
      setIsFooterDescriptionOverflowing(false);
      setFooterDescriptionExpandedMaxHeight(0);
      return;
    }

    const width = el.clientWidth || el.getBoundingClientRect().width;
    if (!Number.isFinite(width) || width <= 0) {
      setIsFooterDescriptionOverflowing(false);
      setFooterDescriptionExpandedMaxHeight(0);
      return;
    }

    const makeMeasureClone = (): HTMLDivElement => {
      const clone = el.cloneNode(true) as HTMLDivElement;
      clone.style.position = "absolute";
      clone.style.visibility = "hidden";
      clone.style.pointerEvents = "none";
      clone.style.inset = "0 auto auto 0";
      clone.style.width = `${width}px`;
      return clone;
    };

    const expandedClone = makeMeasureClone();
    expandedClone.classList.remove("isClamped");
    expandedClone.classList.add("isExpanded");
    expandedClone.style.maxHeight = "none";
    parent.appendChild(expandedClone);
    const expandedHeight = Math.ceil(expandedClone.scrollHeight);
    expandedClone.remove();

    const clampedClone = makeMeasureClone();
    clampedClone.classList.remove("isExpanded");
    clampedClone.classList.add("isClamped");
    parent.appendChild(clampedClone);
    const clampedHeight = Math.ceil(clampedClone.clientHeight);
    clampedClone.remove();

    const overflow = expandedHeight - clampedHeight > 1;
    setFooterDescriptionExpandedMaxHeight(
      Math.max(expandedHeight, clampedHeight),
    );
    setIsFooterDescriptionOverflowing(overflow);
  }, []);

  useEffect(() => {
    setIsFooterDescriptionExpanded(false);
    setFooterDescriptionExpandedMaxHeight(0);
  }, [episode?.guid, isFooterExpanded]);

  useEffect(() => {
    if (!isFooterExpanded || !episode?.guid) {
      setIsFooterDescriptionOverflowing(false);
      setFooterDescriptionExpandedMaxHeight(0);
      return;
    }

    let frame = 0;
    const scheduleMeasure = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        measureFooterDescriptionOverflow();
      });
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleMeasure)
        : null;
    if (ro && footerDescriptionRef.current) {
      ro.observe(footerDescriptionRef.current);
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
      ro?.disconnect();
    };
  }, [
    episode?.guid,
    footerDescriptionHtml,
    isFooterDescriptionExpanded,
    isFooterExpanded,
    measureFooterDescriptionOverflow,
  ]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = volume === 0;
  }, [volume]);

  useEffect(() => {
    const el = nowTitleRef.current;
    if (!el) return;

    const update = () => {
      const style = window.getComputedStyle(el);
      const lineHeight = Number.parseFloat(style.lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
      const lines = Math.round(el.getBoundingClientRect().height / lineHeight);
      el.classList.toggle("isLong", lines > 2);
    };

    const onResize = () => window.requestAnimationFrame(update);
    update();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [nowTitle]);

  const topStatus = useMemo(() => {
    return [
      `ENGINE: ${engineState.toUpperCase()}`,
      `DETAIL: ${engineDetail || "READY"}`,
    ]
      .filter(Boolean)
      .join("   ");
  }, [engineDetail, engineState]);

  const episodeItems = useMemo(() => {
    return episodes.map((ep) => (
      <tr
        key={ep.guid}
        className={`pcEpisodeItem ${episode?.guid === ep.guid ? "active" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => void startEpisode(ep)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void startEpisode(ep);
          }
        }}
      >
        <td>
          <div className="pcEpisodeIcon">
            <span className="material-symbols-outlined">
              {episode?.guid === ep.guid ? "graphic_eq" : "play_circle"}
            </span>
          </div>
        </td>
        <td>
          <div className="pcEpisodeBody">
            <div className="pcEpisodeTitle">
              Ep. {episodes.indexOf(ep) + 1}: {ep.title}
            </div>
            <div className="pcEpisodeMeta">
              {ep.dateStamp ? <span>{ep.dateStamp}</span> : null}
              {ep.dateStamp && ep.duration ? (
                <span className="pcMetaSeparator">|</span>
              ) : null}
              {ep.duration ? <span>{ep.duration}</span> : null}
              {loadingEpisodeId === ep.guid ? (
                <span className="pcLoadingTag">LOADED</span>
              ) : null}
            </div>
          </div>
        </td>
        <td style={{ textAlign: "right" }}>
          <span className="pcEpisodeSize">128kbps / FLAC</span>
        </td>
      </tr>
    ));
  }, [episodes, episode?.guid, loadingEpisodeId, startEpisode]);

  const isSidebarCollapsed = isSidebarCompact && !isMobile;

  return (
    <div className={`pcApp ${isMobile ? "isMobile" : ""}`}>
      <div className="pcBackdrop" aria-hidden="true" />
      {downloadModalKind && resolvedDownloadUi ? (
        <div
          className="pcModelDlOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pcModelDlTitle"
        >
          <div className="pcModelDlBackdrop" aria-hidden="true" />
          <section className="pcModelDlCard pcChamfer">
            <header className="pcModelDlHead">
              <div>
                <div className="pcModelDlKicker">
                  Processing Bootstrap (One time download)
                </div>
                <h2 className="pcModelDlTitle" id="pcModelDlTitle">
                  {activeDownloadTitle}
                </h2>
              </div>
              <span className="pcModelDlAttempt">
                {activeDownloadAttemptLabel} {resolvedDownloadUi.attempt}/
                {resolvedDownloadUi.totalAttempts}
              </span>
            </header>
            <div className="pcModelDlMetaGrid">
              <div className="pcModelDlLabel">{activeDownloadAssetLabel}</div>
              <div className="pcModelDlValue">
                {resolvedDownloadUi.assetLabel}
              </div>
              <div className="pcModelDlLabel">Source</div>
              <div className="pcModelDlValue">
                {resolvedDownloadUi.sourceLabel}
              </div>
            </div>
            <div className="pcModelDlUrl">{resolvedDownloadUi.sourceUrl}</div>
            <div className="pcModelDlProgressWrap">
              <div
                className={`pcModelDlProgress ${activeDownloadPercent === null ? "isIndeterminate" : ""}`}
              >
                <span
                  style={
                    activeDownloadPercent === null
                      ? undefined
                      : { width: `${activeDownloadPercent}%` }
                  }
                  aria-hidden="true"
                />
              </div>
              <div className="pcModelDlProgressMeta">
                <span className="pcModelDlPhase">
                  <span className="pcModelDlBraille" aria-hidden="true">
                    <span className="pcModelDlBrailleGlyph" />
                  </span>
                  <span>{activeDownloadPhaseLabel}</span>
                </span>
                <span>{activeDownloadBytes}</span>
              </div>
            </div>
            {resolvedDownloadUi.phase === "retrying" ? (
              <div className="pcModelDlRetryMsg" aria-live="polite">
                Previous source failed:{" "}
                {resolvedDownloadUi.errorDetail ?? "Unknown error"}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

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
          <div
            className={`pcStatusIndicator ${processingStatus}`}
            title={processingErrorText ?? undefined}
          >
            <span className="pcStatusDot"></span>
            <span className="pcStatusText">
              Processing:{" "}
              {isProcessingStarting ? (
                <>
                  <span>Initializing</span>
                  <span className="pcStatusBootGlyph" aria-hidden="true">
                    <span className="pcStatusBootGlyphInner" />
                  </span>
                </>
              ) : processingErrorInline ? (
                `Error · ${processingErrorInline}`
              ) : isInferenceActive ? (
                "Active"
              ) : (
                "Idle"
              )}
            </span>
          </div>
        </div>

        <div className="pcHeaderRight">
          <button
            className="pcAddSourceBtn"
            onClick={() => void triggerInstall()}
            disabled={!canInstall || installing}
          >
            {!canInstall
              ? "Installed"
              : installing
                ? "Installing…"
                : "Install App"}
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
            <button
              className="pcMobileInstall"
              onClick={() => void triggerInstall()}
              disabled={installing}
            >
              {installing ? "INSTALLING…" : "INSTALL"}
            </button>
          ) : null}
          <button
            className={`pcMobileDenoise ${denoiseEnabled ? "on" : ""}`}
            disabled={!episode || !model?.supported || isProcessingStarting}
            onClick={() => void toggleDenoise(!denoiseEnabled)}
          >
            {denoiseEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div className="pcShell">
        {!isMobile && (
          <aside
            className={`pcSidebar pcChamfer ${isSidebarCollapsed ? "pcSidebarCollapsed" : ""}`}
          >
            <div className="pcSidebarBody">
              <>
                <div className="pcNavigation pcListStack">
                  <button
                    type="button"
                    className={`pcNavigationItem ${desktopView === "library" ? "active" : ""}`}
                    onClick={openLibraryView}
                  >
                    <div className="pcNavigationContent">
                      <div className="pcNavigationTitle">Library</div>
                      <div className="pcNavigationMeta">
                        <span className="pcNavigationUrl">
                          Personal Archive
                        </span>
                      </div>
                    </div>
                    <div className="pcNavigationIcon">
                      <span className="material-symbols-outlined">
                        library_books
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`pcNavigationItem ${desktopView === "discover" ? "active" : ""}`}
                    onClick={openDiscoverView}
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

                <div
                  className={`pcSidebarExpandedSection ${isSidebarCollapsed ? "isCollapsed" : ""}`}
                  aria-hidden={isSidebarCollapsed}
                >
                  <div
                    className="pcSidebarHead"
                    style={{ paddingTop: "24px", paddingBottom: "8px" }}
                  >
                    <div
                      className="pcSidebarTitle"
                      style={{
                        fontSize: "9px",
                        letterSpacing: "0.2em",
                        opacity: 0.4,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: "12px" }}
                      >
                        rss_feed
                      </span>
                      Recent Feeds
                    </div>
                  </div>

                  <SourceList
                    feeds={libraryFeeds}
                    activeUrl={rssUrl}
                    rssLoading={rssLoading}
                    loadingFeedUrl={loadingFeedUrl}
                    imageByUrl={feedImages}
                    showThumbs={isMobile && mobileView === "library"}
                    onSelect={handleSourceSelect}
                  />
                  {sidebarIssues.length > 0 ? (
                    <div
                      className="pcSidebarFoot pcSidebarIssues"
                      role="status"
                      aria-live="polite"
                    >
                      <div className="pcSidebarIssuesHeader">
                        <h4 className="pcFeedMetaTitle">
                          System Alerts ({sidebarIssues.length})
                        </h4>
                        <button
                          type="button"
                          className="pcSidebarIssuesClear"
                          onClick={clearSidebarIssues}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="pcSidebarIssuesList">
                        {sidebarIssues.map((issue) => (
                          <article
                            key={issue.id}
                            className="pcSidebarIssueItem"
                          >
                            <div className="pcSidebarIssueTop">
                              <span className="pcSidebarIssueSource">
                                {formatIssueSource(issue.source)}
                              </span>
                              <span className="pcSidebarIssueTime">
                                {new Date(issue.createdAt).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  },
                                )}
                              </span>
                            </div>
                            <p className="pcSidebarIssueSummary">
                              {issue.summary}
                            </p>
                            <p className="pcSidebarIssueDetail">
                              {issue.detail}
                            </p>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            </div>
          </aside>
        )}

        <main className="pcMain">
          {/* Mobile Show Details Layout */}
          {isMobileShowDetailsView && (
            <>
              {/* Mobile Header */}
              <header className="pcMobileShowDetailsHeader">
                <button
                  type="button"
                  className="pcMobileHeaderButton"
                  onClick={openMobileLibraryView}
                >
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h1 className="pcMobileHeaderTitle">Show Details</h1>
                <button type="button" className="pcMobileHeaderButton">
                  <span className="material-symbols-outlined">share</span>
                </button>
              </header>

              {/* Mobile Show Details Content */}
              <div className="pcMobileShowDetails">
                {/* Hero Section */}
                <section className="pcMobileHeroSection">
                  <div className="pcMobileArtworkContainer">
                    <div className="pcMobileArtworkGlow"></div>
                    <div className="pcMobileArtworkCard">
                      {isShowInfoLoading ? (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            background: "var(--pc-surface)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span className="pcSpinner" aria-label="Loading show artwork" />
                        </div>
                      ) : showArtwork ? (
                        <img
                          className="pcMobileArtworkCover"
                          src={showArtwork}
                          alt={`${showTitleRaw} cover art`}
                          loading="lazy"
                        />
                      ) : (
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: "120px",
                            color: "rgba(255, 255, 255, 0.05)",
                          }}
                        >
                          history_edu
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="pcMobileShowInfo">
                    <h2 className="pcMobileShowTitle">{showTitleRaw}</h2>
                    <p className="pcMobileShowHost">
                      Hosted by {showMetaScramble}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="pcMobileActionRow">
                    <button
                      type="button"
                      className={`pcMobileFollowButton ${isCurrentShowFollowed ? "isFollowed" : ""}`}
                      onClick={followCurrentShow}
                      aria-pressed={isCurrentShowFollowed}
                      disabled={isShowInfoLoading}
                    >
                      <span className="material-symbols-outlined fill-1">
                        {isCurrentShowFollowed ? "check" : "notifications"}
                      </span>
                      <span>
                        {isCurrentShowFollowed ? "Following" : "Follow"}
                      </span>
                    </button>
                    <button className="pcMobileDownloadButton">
                      <span className="material-symbols-outlined">
                        download
                      </span>
                    </button>
                  </div>
                </section>

                {/* Technical Metadata Grid */}
                <section className="pcMobileMetadataGrid">
                  <div className="pcMobileMetadataCard">
                    <span className="pcMobileMetadataLabel">Audio Output</span>
                    <div className="pcMobileMetadataValue">
                      <span className="material-symbols-outlined pcMobileMetadataIcon">
                        waves
                      </span>
                      <span>48kHz / 24-bit</span>
                    </div>
                  </div>
                  <div className="pcMobileMetadataCard">
                    <span className="pcMobileMetadataLabel">Frequency</span>
                    <div className="pcMobileMetadataValue">
                      <span className="material-symbols-outlined pcMobileMetadataIcon">
                        calendar_today
                      </span>
                      <span>Weekly Update</span>
                    </div>
                  </div>
                  <div className="pcMobileMetadataCard">
                    <span className="pcMobileMetadataLabel">Genre</span>
                    <div className="pcMobileMetadataValue">
                      <span className="material-symbols-outlined pcMobileMetadataIcon">
                        settings_input_component
                      </span>
                      <span>{showGenres[0] || "Industrial"}</span>
                    </div>
                  </div>
                  <div className="pcMobileMetadataCard">
                    <span className="pcMobileMetadataLabel">Archive Size</span>
                    <div className="pcMobileMetadataValue">
                      <span className="material-symbols-outlined pcMobileMetadataIcon">
                        data_usage
                      </span>
                      <span>{episodes.length} Episodes</span>
                    </div>
                  </div>
                </section>

                {/* Description Section */}
                <section className="pcMobileDescriptionSection">
                  <h3 className="pcMobileDescriptionHeader">
                    Show Intelligence
                  </h3>
                  <div className="pcMobileDescriptionText">
                    {showDescription ||
                      "A deep dive into the mechanical heart of modern synthesis and industrial soundscapes. Exploring the intersection of human error and machine precision."}
                  </div>
                  <button className="pcMobileReadMoreButton">
                    Read Full Protocol »
                  </button>
                </section>

                {/* Mobile Episode List */}
                <section className="pcMobileEpisodeList">
                  <div className="pcMobileEpisodeListHeader">
                    <h3 className="pcMobileEpisodeListTitle">
                      Archived Transmissions
                    </h3>
                    <span
                      className="pcMobileEpisodeSortInfo"
                      role="button"
                      tabIndex={0}
                      onClick={() => setEpisodeReverse((prev) => !prev)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setEpisodeReverse((prev) => !prev);
                        }
                      }}
                    >
                      SORT: {episodeReverse ? "OLDEST_FIRST" : "NEWEST_FIRST"}
                    </span>
                  </div>
                  <div className="pcMobileEpisodeList">
                    {isShowInfoLoading ? (
                      <div className="pcItemStatus pcLoadingText">
                        LOADING EPISODES...
                      </div>
                    ) : (
                      mobileVisibleEpisodes.map((ep, idx) => (
                        <div key={ep.guid} className="pcMobileEpisodeCard">
                          <div className="pcMobileEpisodeContent">
                            <span className="pcMobileEpisodeNumber">
                              EP_{episodes.length - idx}
                            </span>
                            <h4 className="pcMobileEpisodeTitle">{ep.title}</h4>
                            <p className="pcMobileEpisodeDescription">
                              {ep.description}
                            </p>
                            <div className="pcMobileEpisodeMeta">
                              <span className="pcMobileEpisodeMetaItem">
                                <span className="material-symbols-outlined pcMobileEpisodeMetaIcon">
                                  schedule
                                </span>
                                {ep.duration || "--:--"}
                              </span>
                              <span className="pcMobileEpisodeMetaItem">
                                <span className="material-symbols-outlined pcMobileEpisodeMetaIcon">
                                  calendar_month
                                </span>
                                {ep.pubDate
                                  ? new Date(ep.pubDate).toLocaleDateString(
                                      "en-US",
                                      { month: "short", day: "numeric" },
                                    )
                                  : "--"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="pcMobileEpisodePlayButton"
                            disabled={loadingEpisodeId === ep.guid}
                            onClick={() => void startEpisode(ep)}
                          >
                            <span className="material-symbols-outlined fill-1">
                              play_arrow
                            </span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  {!isShowInfoLoading && hasMoreMobileEpisodes && (
                    <div style={{ textAlign: "center", padding: "24px" }}>
                      <button
                        type="button"
                        className="pcMobileLoadMoreButton"
                        onClick={() =>
                          setMobileEpisodeLimit((prev) =>
                            Math.min(episodes.length, prev + 6),
                          )
                        }
                      >
                        Load Previous Data_Blocks
                      </button>
                    </div>
                  )}
                </section>
              </div>

            </>
          )}

          {/* Library View */}
          {(isDesktopLibraryView || isMobileLibraryView) && (
            <div className="pcLibraryScreen">
              {/* Library Header */}
              <div className="pcLibraryHeader">
                <div className="pcLibraryHeaderContent">
                  <div className="pcLibraryHeaderBadges">
                    <span className="pcLibraryBadge">Archive Node</span>
                    <span className="pcLibraryId">/// USER_COLLECTION_001</span>
                  </div>
                  <p className="pcLibrarySubtitle">
                    Synchronized Database / {libraryFeeds.length} Active
                    Subscriptions
                  </p>
                </div>
              </div>

              {/* Library Controls */}
              <div className="pcLibraryControls">
                <div className="pcLibraryControlsLeft">
                  <div className="pcLibrarySort">
                    <span className="pcLibraryLabel">Sort by:</span>
                    <select
                      className="pcLibrarySelect"
                      value={librarySortMode}
                      onChange={(e) =>
                        setLibrarySortMode(e.target.value as LibrarySortMode)
                      }
                    >
                      <option value="updated">Last Updated</option>
                      <option value="alpha">Alphabetical</option>
                      <option value="count">Episode Count</option>
                    </select>
                  </div>
                  <div className="pcLibraryFilters">
                    <span className="pcLibraryLabel">Filter:</span>
                    <div className="pcLibraryFilterButtons">
                      <button
                        className="pcLibraryFilterButton active"
                        disabled
                        aria-disabled="true"
                      >
                        All
                      </button>
                      <button
                        className="pcLibraryFilterButton"
                        disabled
                        aria-disabled="true"
                      >
                        Unplayed
                      </button>
                      <button
                        className="pcLibraryFilterButton"
                        disabled
                        aria-disabled="true"
                      >
                        Downloaded
                      </button>
                    </div>
                  </div>
                </div>
                <div className="pcLibrarySearch">
                  <span className="material-symbols-outlined pcLibrarySearchIcon">
                    search
                  </span>
                  <input
                    className="pcLibrarySearchInput"
                    type="text"
                    placeholder="SEARCH LIBRARY..."
                    value={libraryQuery}
                    onChange={(e) => setLibraryQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Library Grid */}
              <div className="pcLibraryGrid" ref={libraryGridRef}>
                {libraryFeedsView.length > 0 ? (
                  libraryFeedsView.map((feed) => {
                    return (
                      <div
                        key={feed.rssUrl}
                        className="pcLibraryCard"
                        data-rss-url={feed.rssUrl}
                        onClick={() => handleLibraryCardSelect(feed)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleLibraryCardSelect(feed);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        title={feed.rssUrl}
                        aria-label={`Load ${feed.title}`}
                      >
                        <div className="pcLibraryCardImageContainer">
                          <div className="pcLibraryCardOverlay"></div>
                          {feed.imageUrl ? (
                            <img
                              src={feed.imageUrl}
                              alt={`${feed.title} cover art`}
                              loading="lazy"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                            />
                          ) : (
                            <div className="pcLibraryCardPlaceholder">
                              <span className="material-symbols-outlined">
                                history_edu
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="pcEmpty">
                    No sources match "{libraryQuery.trim()}".
                  </div>
                )}
              </div>
            </div>
          )}

          {(isMobileDiscoverView || isDesktopDiscoverView) && (
            <div className="pcDiscoverScreen">
              <div className="pcDiscoverSearch">
                <div className="pcDiscoverSearchInner">
                  <span className="material-symbols-outlined pcDiscoverSearchIcon">
                    search
                  </span>
                  <input
                    ref={discoverSearchInputRef}
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
                  {searchLoading ? (
                    <div className="pcItemStatus pcLoadingText">
                      SEARCHING PODCASTS…
                    </div>
                  ) : null}
                  {searchError ? (
                    <div className="pcInlineError">{searchError}</div>
                  ) : null}
                  {!searchError ? (
                    <SearchResults
                      results={searchResults}
                      rssLoading={rssLoading}
                      loadingFeedUrl={loadingFeedUrl}
                      onSelect={handleSearchSelect}
                    />
                  ) : null}
                  {!searchLoading &&
                  !searchError &&
                  searchResults.length === 0 ? (
                    <div className="pcEmpty">
                      No shows found for "{searchQuery}".
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="pcDiscoverHero">
                <img
                  className="pcDiscoverHeroImage"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDzeTSV-6dtbtX3Z3gEnqx1ny2MdjhrnEdQ5DYGWbbUdO6M8oL3FeItZiyC8XbRKZ_aPzrp3qK4gpNljWbCEG9OLc-A6L7RpIJeI8hKnow1_8Dbe3EeREKpy-VObVYI47YVsun6ApHvX173U3CrqNlbZCBU3lFzXEanuVr5oF9grbWVZGb9fHnVXHG7ArOFqAAdbtvlE1c1I7TObE5Z12oOp07yoFFBMCvhSfQuObLStUBRxUzQm4q2iXMLPVrsgKj6N8fGmWdHICc"
                  alt="Hero Banner"
                />
                <div className="pcDiscoverHeroOverlay">
                  <div className="pcDiscoverHeroContent">
                    <div className="pcDiscoverHeroHeader">
                      <span className="pcDiscoverHeroBadge">
                        Featured Intel
                      </span>
                      <span className="pcDiscoverHeroPriority">
                        /// PRIORITY_STREAM: 098
                      </span>
                    </div>
                    <h2 className="pcDiscoverHeroTitle">
                      NEURAL{" "}
                      <span className="pcDiscoverHeroTitleAccent">
                        OVERRIDE
                      </span>
                    </h2>
                    <p className="pcDiscoverHeroDesc">
                      Exploring the ethics of cognitive enhancement and the
                      impending singularity. A deep dive into the
                      industrial-scale deployment of wetware interfaces.
                    </p>
                    <div className="pcDiscoverHeroActions">
                      <button className="pcDiscoverHeroBtn">
                        <span className="material-symbols-outlined FILL-1">
                          play_arrow
                        </span>
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
                      <span className="pcDiscoverSectionLive">
                        LIVE_TRAFFIC
                      </span>
                    </div>
                    <button className="pcDiscoverSectionBtn">
                      View All ///
                    </button>
                  </div>
                  <div className="pcDiscoverGrid">
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img
                          className="pcDiscoverCardImage"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDtzK1iqz5noL89la9IeFHfnFxxvlD3O4zDlwXFTNGS4XpFPJJBCIdNHocLSVUjijuVwPhxZi3W3g1n9ASgnnBvlKwVDN4QixR7DOE07PIOMjQFAJB6RO29gdjOh6TQb9OwepomkGTRyM58I65RzbFWCjs5-NcgaRz8EBt3N8bwPPndkPuaWZjQRZLtZyIQ0Bj1qenBwIj0fHdAbp1iDlLCWARd0ZfXjAePcIVhIZ9AFA-Hj-9IEnt4NBhRjuIjFbTBThKDV1zfmO8"
                          alt="Cover"
                        />
                        <div className="pcDiscoverCardOverlay">
                          <span className="material-symbols-outlined">
                            play_circle
                          </span>
                        </div>
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Silicon Shadows</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// SECURE_FEED_01</span>
                          <span className="pcDiscoverCardStats">
                            <span className="pcDiscoverCardStat">
                              8.4k Listeners
                            </span>
                            <span className="pcDiscoverCardSeparator">|</span>
                            <span className="pcDiscoverCardTime">42m</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img
                          className="pcDiscoverCardImage"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuD9MmU9rF06s7UoRz6GYPQg8sB6osarAIGvhGB_kKiHKS6w7SYWpW6D43cK7s7RWyCTJJvGWc696VYkXoqnIOpc9LCOGEfYXnP1n93KcwMOAGzFi0UymL80UJKBbyWYJrUDyYtfME2ACMGyNHa0S3cyt0XIQtOXuMDUeRxQeQTF7QsmyqoAE6JDoSxOfk3BXmUKuq7RaqYTdyBIq7y_qV4b_4DXPrSHQhd1HEbPt1_2hQvO497scg2_tgOjUvgmEm9P9-9n1PXisT0"
                          alt="Cover"
                        />
                        <div className="pcDiscoverCardOverlay">
                          <span className="material-symbols-outlined">
                            play_circle
                          </span>
                        </div>
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Signal Loss</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// BAND_77-ALPHA</span>
                          <span className="pcDiscoverCardStats">
                            <span className="pcDiscoverCardStat">
                              3.2k Listeners
                            </span>
                            <span className="pcDiscoverCardSeparator">|</span>
                            <span className="pcDiscoverCardTime">1h 05m</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img
                          className="pcDiscoverCardImage"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCsZvyo4Znm9_Zf6sBmSL-JM5q8iNgKeiBGmd2JIrRdVVm8YnNm3TE2A40SHbp4tXarOZkawNiJDDxvCPDs8VXk1sCpSdxXv8AmOJMGUiz1ToyKV0BpPJD1cHsRyzwd-agPUQiyxTWNHW5bwVFhpS19_aYYE2-wGlW3aqMgiDe-YNCxPwWLzuUOqWLfYemSLpmUTaehRBg3NEgmn1UCVBDcVW1W-58nS-karXJzefpt7eZK_pyUTJ9kBIQphPQiKfc1XKT9ajvqaWg"
                          alt="Cover"
                        />
                        <div className="pcDiscoverCardOverlay">
                          <span className="material-symbols-outlined">
                            play_circle
                          </span>
                        </div>
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Cybernetic Echo</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// RECURSIVE_DYNAMICS</span>
                          <span className="pcDiscoverCardStats">
                            <span className="pcDiscoverCardStat">
                              12k Listeners
                            </span>
                            <span className="pcDiscoverCardSeparator">|</span>
                            <span className="pcDiscoverCardTime">38m</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img
                          className="pcDiscoverCardImage"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzDIVsR1QW9UcG-2LSKPS05pNQ9KDbhy06hjgLOnDz-tRsInoh4OvHaWoRpgvb4axqbIzHx0Jurrx9T8XT66FAAzE2BNBBN41Fd49WgPitMLcWiW61H7oKy9QyEeAZkJKVfNOdS_JvlyFP0yfFTAu0JuqbuNE5ee4xEC-UPq3qvfxj-XL7-2FWMQcNR_bcmUBBZ9WWdIlTG6t2EBKeYjRO8k-VDlmbe_R3rva4RP_AWsjA-nsDjS_7bGKJLQ1a6zzD_CoKW-FXVVo"
                          alt="Cover"
                        />
                        <div className="pcDiscoverCardOverlay">
                          <span className="material-symbols-outlined">
                            play_circle
                          </span>
                        </div>
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">Black Box Logic</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// OPAQUE_ANALYSIS</span>
                          <span className="pcDiscoverCardStats">
                            <span className="pcDiscoverCardStat">
                              1.1k Listeners
                            </span>
                            <span className="pcDiscoverCardSeparator">|</span>
                            <span className="pcDiscoverCardTime">55m</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img
                          className="pcDiscoverCardImage"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAixwBoGqTYegjsHEcErjMm2FwUPiygGKcp2xDRqtRLmdqkbbee9X1RAougWqdI4f7OZsWzXuNqhl_TlgcvVH1qSQcJd_exGMLeWDrCnUT57aL5J-oLdKfxWWyd_12IGh_62FtLz1SUgVhIL2XMCI9z8jFNqrGLHrXrLthAH86eDJ_rU97uMHTzCLU4oNb56tA-gsuZm1ZKFNmyDGFhxdxt-PVXgPY2-WLB9NsNkAtRF5QDf-IRNnHB5Pevu45z0XO2iNIpK8xMV-0"
                          alt="Cover"
                        />
                        <div className="pcDiscoverCardOverlay">
                          <span className="material-symbols-outlined">
                            play_circle
                          </span>
                        </div>
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">The Void State</h4>
                        <div className="pcDiscoverCardMeta">
                          <span>/// NULL_POINTER</span>
                          <span className="pcDiscoverCardStats">
                            <span className="pcDiscoverCardStat">
                              6.7k Listeners
                            </span>
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
                      <span className="pcDiscoverSectionTag">
                        RECENT_UPLINK
                      </span>
                    </div>
                    <button className="pcDiscoverSectionBtn">
                      Incoming ///
                    </button>
                  </div>
                  <div className="pcDiscoverGrid">
                    <div className="pcDiscoverCard">
                      <div className="pcDiscoverCardImageContainer">
                        <img
                          className="pcDiscoverCardImage"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBQ3sDWhcCWQGb0eVMWJlmK9ijOLa2MdeshHnMRTZv9DVVGhTfsL_NhxeOvBEkfa7GJddmc_94NPrT0ZuTw4CUj2ghtMGsNbfjiKd5VEU972MpUZvjZlokGEqvO_SvRr1h9SJiXOZmljs6nO26TOapswvXFHsp67DkzqFHm61JBJGOILhjRlO4THW3rEiTEC1N7Cn9vHvnpWSGQzWuyH9gbxM1OKq5E9Yftq0Eo9xoK4iOXZvO5F-Df7VQfcvOF0bWQOO4byL6l9yM"
                          alt="Cover"
                        />
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
                        <img
                          className="pcDiscoverCardImage"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDa4iugeL8djUHWo-wL-yd0IDgeTkC7ZsKP3-N_OrOGQojYCCDGK1MifY6dLEZwJePbpbGCpnC7rzo4ikiZzpOZEwTVho0u2Hq4Q7-qVY6VrpQ_bf53GDsVyy54ZU4o6GN7yOrKeDkEjadyoEGjGYkSeTVZhZ4yMSu6EjlrpISgPudbZMFHsNHkdEjH9Ap3I2xpzJqleDYo1nRJUWec9WnQSdGS6bHB1CWP3n3LKtrAvdTuA6zV4XCqrHy5Ongr4ka39SZi4qSk-r4"
                          alt="Cover"
                        />
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
                        <img
                          className="pcDiscoverCardImage"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAdR42crqA2ZUK0rzvsRKIeGKdU4eOdVt9UltmZaQsz0UfqzMrqIeaDbUyNX2CvQ09mKD-dtcraA3I7lt6oLerJOGTSw8dlRkzTK9OpncSfStF_dQGK8e61BiVnKQDDOXOmmmnnU2h7aZ-j0zg78Fjz_2SECFeKreRvtM5N3XPtABYG7CvxPO3ni_6FOXbFoII6sOs2K7laHf9toEMQfwomMmnzR-YDLth8m-aQQvnhoiLoEjRElqaU7IsHaJAnPLrb13vf5uwTts4"
                          alt="Cover"
                        />
                      </div>
                      <div className="pcDiscoverCardContent">
                        <h4 className="pcDiscoverCardTitle">
                          Mainframe Memoirs
                        </h4>
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
          )}

          {isDesktopShowDetailsView && (
            <>
              <section className="pcShowDetails">
                <div className="pcShowDetailsInner">
                  <div className="pcShowArtwork">
                    <div className="pcShowArtworkCard">
                      {isShowInfoLoading ? (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            background: "var(--pc-surface)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span className="pcSpinner" aria-label="Loading show artwork" />
                        </div>
                      ) : showArtwork ? (
                        <img
                          className="pcShowArtworkCover"
                          src={showArtwork}
                          alt={`${showTitleRaw} cover art`}
                          loading="lazy"
                        />
                      ) : (
                        <span className="material-symbols-outlined pcShowArtworkIcon">
                          history_edu
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="pcShowInfo">
                    <div className="pcShowMeta">
                      <div className="pcShowGenres">
                        {showGenres.map((genre, idx) => (
                          <span
                            key={`${genre}-${idx}`}
                            className={`pcGenreBox ${idx === 0 ? "pcGenrePrimary" : ""}`}
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                      <span className="pcShowNetwork">{showMetaScramble}</span>
                    </div>
                    <h2 ref={nowTitleRef} className="pcShowTitle">
                      {isShowInfoLoading ? "LOADING SHOW..." : showTitleHeadScramble}
                      {!isShowInfoLoading && showTitleParts.accent ? (
                        <>
                          {" "}
                          <span className="pcShowTitleAccent">
                            {showTitleAccentScramble}
                          </span>
                        </>
                      ) : null}
                    </h2>
                    <div className="pcShowDescription">
                      <p>{showDescription}</p>
                    </div>
                  </div>
                </div>
              </section>

              {!isMobile && (
                <section className="pcEpisodes pcChamfer">
                  <div className="pcSectionHead">
                    <div className="pcSectionTitle">
                      Archive Records
                      <span className="pcSectionTag">{sectionTagScramble}</span>
                    </div>
                    <div className="pcSectionTools">
                      <div className="pcFilter">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="pcFilterIcon"
                        >
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
                        className={`pcSortBtn ${episodeReverse ? "active" : ""}`}
                        onClick={() => setEpisodeReverse((prev) => !prev)}
                        aria-pressed={episodeReverse}
                        title="Reverse episode order"
                      >
                        {episodeReverse ? "ORDER: REVERSED" : "ORDER: DEFAULT"}
                      </button>
                    </div>
                  </div>

                  <EpisodeList
                    items={
                      isShowInfoLoading ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="pcItemStatus pcLoadingText"
                            style={{ padding: "20px" }}
                          >
                            LOADING EPISODES...
                          </td>
                        </tr>
                      ) : (
                        episodeItems
                      )
                    }
                    hasEpisodes={isShowInfoLoading || episodes.length > 0}
                  />
                  {!isShowInfoLoading && rssError ? (
                    <div className="pcError">{rssError}</div>
                  ) : null}
                </section>
              )}
            </>
          )}

          {!isMobile && episode ? (
            <>
              <div className="pcFooterSpacer" />
              <footer
                className={`pcFooter ${
                  isFooterClosing
                    ? "pcFooterSlideOut"
                    : !isFooterExpanding &&
                        !isFooterExpanded &&
                        !isFooterCollapsing
                      ? "pcFooterSlideUp"
                      : ""
                } ${isFooterExpanding ? "pcFooterExpanding" : ""} ${
                  isFooterExpanded ? "pcFooterExpanded" : ""
                } ${isFooterCollapsing ? "pcFooterCollapsing" : ""}`}
              >
                <div className="pcFooterProgress">
                  <div
                    className="pcFooterProgressTrack"
                    onClick={episode ? onProgressPointer : undefined}
                  >
                    <div
                      className="pcFooterProgressFill"
                      style={{ width: `${footerProgressPct}%` }}
                    ></div>
                    <div
                      className="pcFooterProgressHandle"
                      style={{
                        left: `calc(${footerProgressPct}% - 6px)`,
                        right: "auto",
                      }}
                    ></div>
                  </div>
                  <div
                    className="pcFooterProgressTooltip"
                    style={{
                      left: `clamp(56px, ${footerProgressPct}%, calc(100% - 56px))`,
                    }}
                    aria-hidden="true"
                  >
                    <span className="pcFooterProgressTime">
                      {footerCurrent}
                    </span>
                    <span className="pcFooterProgressSep">/</span>
                    <span className="pcFooterProgressTime pcFooterProgressDuration">
                      {footerDuration}
                    </span>
                  </div>
                </div>
                <div
                  className={`pcFooterControls ${isFooterExpanding || isFooterExpanded || isFooterCollapsing ? "isCollapsed" : ""}`}
                >
                  <div
                    className="pcFooterLeft"
                    onClick={toggleFooterExpansion}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="pcFooterEpisodeInfo">
                      <div className="pcFooterEpisodeArtwork">
                        <span className="material-symbols-outlined">
                          history_edu
                        </span>
                      </div>
                      <div className="pcFooterEpisodeDetails">
                        <h4
                          className={`pcFooterEpisodeTitle ${footerPanActive ? "isPanning" : ""}`}
                        >
                          <span
                            ref={footerTitlePan.ref}
                            className={`pcFooterMarquee ${footerPanActive ? "isPanning" : ""}`}
                            style={{
                              ...footerPanSharedStyle,
                              ...footerTitlePan.style,
                            }}
                          >
                            {footerEpisodeTitle}
                          </span>
                        </h4>
                        <p
                          className={`pcFooterEpisodeShow ${footerPanActive ? "isPanning" : ""}`}
                        >
                          <span
                            ref={footerShowPan.ref}
                            className={`pcFooterMarquee ${footerPanActive ? "isPanning" : ""}`}
                            style={{
                              ...footerPanSharedStyle,
                              ...footerShowPan.style,
                            }}
                          >
                            {footerEpisodeShow}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="pcFooterCenter">
                    <div className="pcFooterPlayerControls">
                      <button
                        type="button"
                        className="pcFooterControlBtn"
                        disabled={!canPrev}
                        onClick={playPrev}
                        title="Previous"
                      >
                        <IconPrev size={22} />
                      </button>
                      <button
                        type="button"
                        className="pcFooterControlBtn pcFooterSeekBtn"
                        disabled={!episode}
                        onClick={() => seekBySeconds(-10)}
                        title="Seek backward 10 seconds"
                        aria-label="Seek backward 10 seconds"
                      >
                        <span className="material-symbols-outlined">
                          replay_10
                        </span>
                      </button>
                      <button
                        type="button"
                        className="pcFooterPlayBtn"
                        disabled={!episode || isEpisodeLoading}
                        onClick={() => void togglePlayPause()}
                        title={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? (
                          <IconPause size={26} />
                        ) : (
                          <IconPlay size={26} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="pcFooterControlBtn pcFooterSeekBtn"
                        disabled={!episode}
                        onClick={() => seekBySeconds(10)}
                        title="Seek forward 10 seconds"
                        aria-label="Seek forward 10 seconds"
                      >
                        <span className="material-symbols-outlined">
                          forward_10
                        </span>
                      </button>
                      <button
                        type="button"
                        className="pcFooterControlBtn"
                        disabled={!canNext}
                        onClick={playNext}
                        title="Next"
                      >
                        <IconNext size={22} />
                      </button>
                    </div>
                  </div>
                  <div className="pcFooterRight">
                    <div className="pcFooterControlWithTooltip">
                      <button
                        type="button"
                        className={`pcFooterControlBtn pcFooterProcessBtn ${denoiseEnabled ? "on" : ""}`}
                        disabled={
                          !episode || !model?.supported || isProcessingStarting
                        }
                        aria-label={
                          denoiseEnabled
                            ? "Disable processing"
                            : "Enable processing"
                        }
                        onClick={() => void toggleDenoise(!denoiseEnabled)}
                      >
                        <span className="material-symbols-outlined">
                          replace_audio
                        </span>
                      </button>
                      <span
                        className="pcFooterControlTooltip"
                        aria-hidden="true"
                      >
                        {footerProcessTooltip}
                      </span>
                    </div>
                    <div className="pcFooterVolume" onWheel={onVolumeWheel}>
                      <button
                        type="button"
                        className="pcFooterControlBtn"
                        onClick={toggleMute}
                        title={volume === 0 ? "Unmute" : "Mute"}
                      >
                        <span className="material-symbols-outlined">
                          {footerVolumeIcon}
                        </span>
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
                        <div
                          className="pcFooterVolumeFill"
                          style={{ width: `${footerVolumePct}%` }}
                        ></div>
                        <div
                          className="pcFooterVolumeHandle"
                          style={{ left: `calc(${footerVolumePct}% - 5px)` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
                {(isFooterExpanded ||
                  isFooterExpanding ||
                  isFooterCollapsing) &&
                episode ? (
                  <div className="pcFooterExpandedContent">
                    <div className="pcFooterExpandedBody">
                      <div className="pcFooterExpandedHero text-center mb-10 max-w-4xl mx-auto space-y-4">
                        <div className="pcFooterExpandedBadge">
                          <span className="pcFooterExpandedBadgeDot"></span>
                          <span className="pcFooterExpandedBadgeText">
                            Transmission Active
                          </span>
                        </div>
                        <div>
                          <h2 className="pcFooterExpandedTitle">
                            {footerEpisodeTitle || "Unknown Episode"}
                          </h2>
                          <p className="pcFooterExpandedSubtitle">
                            {footerEpisodeShow || "Unknown Show"} /// Episode{" "}
                            {episodesAll.findIndex(
                              (e) => e?.guid === episode?.guid,
                            ) + 1}
                          </p>
                        </div>
                        <div className="pcFooterExpandedDescriptionWrap">
                          <div
                            id="footer-expanded-description"
                            ref={footerDescriptionRef}
                            className={`pcFooterExpandedDescription ${isFooterDescriptionExpanded ? "isExpanded" : "isClamped"}`}
                            style={footerDescriptionStyle}
                            dangerouslySetInnerHTML={{
                              __html: footerDescriptionHtml,
                            }}
                          />
                          {isFooterDescriptionOverflowing ? (
                            <button
                              type="button"
                              className="pcFooterExpandedDescriptionToggle"
                              aria-controls="footer-expanded-description"
                              aria-expanded={isFooterDescriptionExpanded}
                              onClick={toggleFooterDescriptionExpanded}
                            >
                              {isFooterDescriptionExpanded
                                ? "Show less"
                                : "Show more"}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div
                        className={`pcFooterExpandedTelemetry ${isFooterDescriptionExpanded ? "isHidden" : ""}`}
                        aria-hidden={isFooterDescriptionExpanded}
                      >
                        <div className="pcFooterExpandedMetrics pcFooterExpandedMetricsLeft">
                          <div className="pcFooterExpandedMetric">
                            <span className="pcFooterExpandedMetricLabel">
                              Current Position
                            </span>
                            <span className="pcFooterExpandedMetricValue pcFooterExpandedMetricValuePrimary">
                              {footerCurrent}
                            </span>
                          </div>
                          <div className="pcFooterExpandedMetric">
                            <span className="pcFooterExpandedMetricLabel">
                              Stream Bitrate
                            </span>
                            <span className="pcFooterExpandedMetricValue">
                              1,411 KBPS
                            </span>
                          </div>
                        </div>

                        <div className="pcFooterExpandedWaveform">
                          {/* Waveform visualization */}
                          {Array.from({ length: 64 }, (_, i) => {
                            const isActive =
                              i <
                              Math.floor(
                                ((currentTime || 0) / (duration || 1)) * 64,
                              );
                            const height =
                              Math.random() > 0.5
                                ? "75%"
                                : Math.random() > 0.3
                                  ? "50%"
                                  : "25%";
                            return (
                              <div
                                key={i}
                                className={
                                  isActive
                                    ? "waveform-bar-active"
                                    : "waveform-bar"
                                }
                                style={{
                                  width: "2px",
                                  height,
                                  borderRadius: "9999px",
                                  transition: "all 300ms",
                                }}
                              ></div>
                            );
                          })}
                        </div>

                        <div className="pcFooterExpandedMetrics pcFooterExpandedMetricsRight">
                          <div className="pcFooterExpandedMetric">
                            <span className="pcFooterExpandedMetricLabel">
                              Remaining
                            </span>
                            <span className="pcFooterExpandedMetricValue">
                              {footerDuration}
                            </span>
                          </div>
                          <div className="pcFooterExpandedMetric">
                            <span className="pcFooterExpandedMetricLabel">
                              Playback Speed
                            </span>
                            <span className="pcFooterExpandedMetricValue">
                              1.25X // VAR
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pcFooterExpandedControls">
                        <button className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnSm">
                          <span className="material-symbols-outlined">
                            shuffle
                          </span>
                        </button>
                        <button
                          className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnLg"
                          disabled={!canPrev}
                          onClick={playPrev}
                        >
                          <span className="material-symbols-outlined">
                            skip_previous
                          </span>
                        </button>
                        <button
                          className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnMd"
                          onClick={() => seekBySeconds(-10)}
                        >
                          <span className="material-symbols-outlined">
                            replay_10
                          </span>
                        </button>
                        <div className="pcFooterExpandedPlayWrap">
                          <div className="pcFooterExpandedPlayGlow"></div>
                          <button
                            className="pcFooterExpandedPlayBtn"
                            onClick={() => void togglePlayPause()}
                          >
                            <span className="material-symbols-outlined pcFooterExpandedPlayIcon FILL-1">
                              {isPlaying ? "pause" : "play_arrow"}
                            </span>
                          </button>
                        </div>
                        <button
                          className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnMd"
                          onClick={() => seekBySeconds(10)}
                        >
                          <span className="material-symbols-outlined">
                            forward_10
                          </span>
                        </button>
                        <button
                          className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnLg"
                          disabled={!canNext}
                          onClick={playNext}
                        >
                          <span className="material-symbols-outlined">
                            skip_next
                          </span>
                        </button>
                        <button className="pcFooterExpandedControlBtn pcFooterExpandedControlBtnSm">
                          <span className="material-symbols-outlined">
                            repeat
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="pcFooterExpandedTray">
                      <div className="pcFooterExpandedTrayActions">
                        <button
                          className="pcFooterExpandedTrayBtn pcFooterExpandedTrayBtnGhost"
                          onClick={toggleFooterExpansion}
                        >
                          <span className="material-symbols-outlined">
                            keyboard_double_arrow_down
                          </span>
                          Collapse View
                        </button>
                        <div className="pcFooterExpandedTrayMeta">
                          <button className="pcFooterExpandedTrayBtn">
                            <span className="material-symbols-outlined">
                              closed_caption
                            </span>
                            Subtitles
                          </button>
                          <button className="pcFooterExpandedTrayBtn">
                            <span className="material-symbols-outlined">
                              list
                            </span>
                            Chapters
                          </button>
                          <button className="pcFooterExpandedTrayBtn pcFooterExpandedTrayBtnPrimary">
                            <span className="material-symbols-outlined">
                              equalizer
                            </span>
                            DSP Control
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </footer>
            </>
          ) : null}
        </main>
      </div>

      {isMobile ? (
        <div
          className={`pcMobileFixedBottom ${episode ? "" : "isHidden"}`}
          aria-hidden={!episode}
        >
          <div className="pcMobileMiniPlayer">
            <div className="pcMobileMiniPlayerArtwork">
              {nowPlayingArtworkUrl ? (
                <img src={nowPlayingArtworkUrl} alt="Now playing" />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "var(--pc-surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    history_edu
                  </span>
                </div>
              )}
            </div>
            <div className="pcMobileMiniPlayerInfo">
              <p className="pcMobileMiniPlayerLabel">Now Processing:</p>
              <p className="pcMobileMiniPlayerTitle">
                {episode?.title ?? "Select an episode to start playback"}
              </p>
            </div>
            <div className="pcMobileMiniPlayerControls">
              <button
                type="button"
                className={`pcMobileMiniPlayerControlButton pcMobileMiniPlayerProcessBtn ${denoiseEnabled ? "on" : ""}`}
                disabled={!episode || !model?.supported || isProcessingStarting}
                aria-label={
                  denoiseEnabled ? "Disable processing" : "Enable processing"
                }
                title={footerProcessTooltip}
                onClick={() => void toggleDenoise(!denoiseEnabled)}
              >
                <span className="material-symbols-outlined">replace_audio</span>
              </button>
              <button
                type="button"
                className="pcMobileMiniPlayerControlButton seek"
                onClick={() => seekBySeconds(-10)}
                disabled={!episode}
              >
                <span className="material-symbols-outlined">replay_10</span>
              </button>
              <button
                type="button"
                className="pcMobileMiniPlayerControlButton primary"
                onClick={() => void togglePlayPause()}
                disabled={isEpisodeLoading || !episode}
              >
                <span className="material-symbols-outlined fill-1">
                  {isPlaying ? "pause" : "play_arrow"}
                </span>
              </button>
              <button
                type="button"
                className="pcMobileMiniPlayerControlButton seek"
                onClick={() => seekBySeconds(10)}
                disabled={!episode}
              >
                <span className="material-symbols-outlined">forward_10</span>
              </button>
              <button
                type="button"
                className="pcMobileMiniPlayerControlButton"
                onClick={playNext}
                disabled={!canNext}
              >
                <span className="material-symbols-outlined">skip_next</span>
              </button>
            </div>
            <div className="pcMobileMiniPlayerTimeline">
              <div className="pcMobileMiniPlayerProgressMeta" aria-hidden="true">
                <span>{footerCurrent}</span>
                <span>{footerDuration}</span>
              </div>
              <div
                className="pcMobileMiniPlayerProgress"
                role="slider"
                tabIndex={0}
                aria-label="Playback progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={footerProgressPct}
                aria-valuetext={`${footerCurrent} of ${footerDuration}`}
                onPointerDown={onMiniProgressPointerDown}
                onKeyDown={onMiniProgressKeyDown}
              >
                <div
                  className="pcMobileMiniPlayerProgressFill"
                  style={{ width: `${footerProgressPct}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <nav className="pcMobileNav">
        <button
          className={`pcMobileNavItem ${isMobileDiscoverBrowseView ? "active" : ""}`}
          onClick={openMobileDiscoverBrowseView}
        >
          <span className="material-symbols-outlined pcMobileNavItemIcon fill-1">
            explore
          </span>
          <span className="pcMobileNavItemLabel">Discover</span>
        </button>
        <button
          className={`pcMobileNavItem ${isMobileLibraryView ? "active" : ""}`}
          onClick={openMobileLibraryView}
        >
          <span className="material-symbols-outlined pcMobileNavItemIcon">
            library_books
          </span>
          <span className="pcMobileNavItemLabel">Library</span>
        </button>
        <button
          className={`pcMobileNavItem ${isMobileDiscoverSearchView ? "active" : ""}`}
          onClick={openMobileDiscoverSearchView}
        >
          <span className="material-symbols-outlined pcMobileNavItemIcon">
            search
          </span>
          <span className="pcMobileNavItemLabel">Search</span>
        </button>
      </nav>

      <audio
        ref={audioRef}
        className="pcAudio"
        preload="metadata"
        playsInline
      />

      <input
        ref={fileInputRef}
        type="file"
        accept={AUDIO_FILE_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void startLocalFile(file);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
