import { memo, type CSSProperties } from "react";
import type { PodcastEpisode } from "../../podcasts/types";
import { SHOW_EPISODE_ARTWORK } from "../../config/featureFlags";

type EpisodeRowsProps = {
  episodes: PodcastEpisode[];
  activeEpisodeGuid: string | null;
  loadingEpisodeId: string | null;
  showArtworkUrl: string | null;
  onStartEpisode: (episode: PodcastEpisode) => Promise<void>;
};

function formatSize(bytes?: number): string | null {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatAudioType(mime?: string): string | null {
  if (!mime) return null;
  const normalized = mime.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("mpeg")) return "MP3";
  if (normalized.includes("aac")) return "AAC";
  if (normalized.includes("ogg")) return "OGG";
  if (normalized.includes("opus")) return "OPUS";
  if (normalized.includes("wav")) return "WAV";
  if (normalized.includes("flac")) return "FLAC";
  const subtype = normalized.split("/")[1];
  return subtype ? subtype.toUpperCase() : null;
}

export const EpisodeRows = memo(function EpisodeRows({
  episodes,
  activeEpisodeGuid,
  loadingEpisodeId,
  showArtworkUrl,
  onStartEpisode,
}: EpisodeRowsProps) {
  return (
    <>
      {episodes.map((episode, index) => {
        const episodeArtworkUrl = SHOW_EPISODE_ARTWORK
          ? episode.imageUrl
          : undefined;
        const artworkUrl = episodeArtworkUrl || showArtworkUrl || undefined;
        const primaryMeta = [
          formatAudioType(episode.enclosureType),
          formatSize(episode.enclosureLengthBytes),
        ]
          .filter(Boolean)
          .join(" / ");
        const episodeCode =
          typeof episode.seasonNumber === "number" &&
          typeof episode.episodeNumber === "number"
            ? `S${episode.seasonNumber}E${episode.episodeNumber}`
            : typeof episode.episodeNumber === "number"
              ? `EP ${episode.episodeNumber}`
              : null;
        const secondaryMeta = [
          episodeCode,
          episode.episodeType?.toUpperCase(),
          typeof episode.explicit === "boolean"
            ? episode.explicit
              ? "EXPLICIT"
              : "CLEAN"
            : null,
        ]
          .filter(Boolean)
          .join(" • ");
        return (
          <tr
            key={episode.guid}
            className={`pcEpisodeItem pcStaggerItem ${activeEpisodeGuid === episode.guid ? "active" : ""}`}
            role="button"
            tabIndex={0}
            style={
              {
                "--pc-stagger-index": `${index}`,
              } as CSSProperties
            }
            onClick={() => void onStartEpisode(episode)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                void onStartEpisode(episode);
              }
            }}
          >
            <td>
              <div
                className={`pcEpisodeIcon ${artworkUrl ? "hasArtwork" : ""}`}
              >
                {artworkUrl ? (
                  <img
                    className="pcEpisodeArtwork"
                    src={artworkUrl}
                    alt={`Artwork for ${episode.title}`}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="material-symbols-outlined">
                    {activeEpisodeGuid === episode.guid
                      ? "graphic_eq"
                      : "play_circle"}
                  </span>
                )}
              </div>
            </td>
            <td>
              <div className="pcEpisodeBody">
                <div className="pcEpisodeTitle">{episode.title}</div>
                <div className="pcEpisodeMeta">
                  {episode.dateStamp ? <span>{episode.dateStamp}</span> : null}
                  {episode.dateStamp && episode.duration ? (
                    <span className="pcMetaSeparator">|</span>
                  ) : null}
                  {episode.duration ? <span>{episode.duration}</span> : null}
                  {loadingEpisodeId === episode.guid ? (
                    <span className="pcLoadingTag">LOADED</span>
                  ) : null}
                </div>
              </div>
            </td>
            <td style={{ textAlign: "right" }}>
              <span className="pcEpisodeSize">
                {primaryMeta || "Audio Stream"}
              </span>
              {secondaryMeta ? (
                <span className="pcEpisodeSubmeta">{secondaryMeta}</span>
              ) : null}
            </td>
          </tr>
        );
      })}
    </>
  );
});
