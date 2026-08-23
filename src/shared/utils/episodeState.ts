import type { CachedSeasonInfo, WatchlistItem } from "~/shared/types";

export type SeriesDerivedStatus = Extract<
  WatchlistItem["status"],
  "Planned" | "Watching" | "Completed"
>;

export interface SeriesEpisodeRef {
  season: number;
  episode: number;
}

/** Return a stable chronological season list without mutating the caller. */
export function normalizeSeriesSeasons(
  seasons: readonly CachedSeasonInfo[] | undefined
): CachedSeasonInfo[] {
  return (seasons ?? [])
    .filter((season) => season.number > 0 && season.count > 0)
    .map((season) => ({ number: season.number, count: season.count }))
    .sort((a, b) => a.number - b.number);
}

/** Flatten all known episodes into one chronological cross-season sequence. */
export function listSeriesEpisodes(
  seasons: readonly CachedSeasonInfo[] | undefined
): SeriesEpisodeRef[] {
  const episodes: SeriesEpisodeRef[] = [];
  for (const season of normalizeSeriesSeasons(seasons)) {
    for (let episode = 1; episode <= season.count; episode += 1) {
      episodes.push({ season: season.number, episode });
    }
  }
  return episodes;
}

/** Return the inclusive prefix ending at the requested episode. */
export function getWatchedPrefixThrough(
  seasons: readonly CachedSeasonInfo[] | undefined,
  season: number,
  episode: number
): SeriesEpisodeRef[] {
  const episodes = listSeriesEpisodes(seasons);
  const index = episodes.findIndex(
    (candidate) => candidate.season === season && candidate.episode === episode
  );
  return index < 0 ? [] : episodes.slice(0, index + 1);
}

/** Return the episodes before the requested position, used for unwatch rewinds. */
export function getWatchedPrefixBefore(
  seasons: readonly CachedSeasonInfo[] | undefined,
  season: number,
  episode: number
): SeriesEpisodeRef[] {
  const episodes = listSeriesEpisodes(seasons);
  const index = episodes.findIndex(
    (candidate) => candidate.season === season && candidate.episode === episode
  );
  return index < 0 ? episodes : episodes.slice(0, index);
}

/** Return the last episode in a prefix, or the first episode as a safe anchor. */
export function getTrackerPosition(
  prefix: readonly SeriesEpisodeRef[],
  seasons: readonly CachedSeasonInfo[] | undefined
): SeriesEpisodeRef {
  const last = prefix[prefix.length - 1];
  if (last) return { ...last };
  const first = listSeriesEpisodes(seasons)[0];
  return first ? { ...first } : { season: 1, episode: 1 };
}

export function getLastEpisodePosition(
  seasons: readonly CachedSeasonInfo[] | undefined
): SeriesEpisodeRef {
  const episodes = listSeriesEpisodes(seasons);
  const last = episodes[episodes.length - 1];
  return last ? { ...last } : { season: 1, episode: 1 };
}

/** Derive the only valid series status from a contiguous watched count. */
export function deriveSeriesStatus(
  watchedCount: number,
  totalEpisodes: number
): SeriesDerivedStatus {
  if (watchedCount <= 0 || totalEpisodes <= 0) return "Planned";
  if (watchedCount >= totalEpisodes) return "Completed";
  return "Watching";
}

/** Return the largest valid chronological prefix represented by persisted rows. */
export function getContiguousWatchedPrefix<T>(
  seasons: readonly CachedSeasonInfo[] | undefined,
  rows: readonly T[],
  keyOf: (row: T) => string | null
): SeriesEpisodeRef[] {
  const episodes = listSeriesEpisodes(seasons);
  const watchedKeys = new Set(
    rows.map(keyOf).filter((key): key is string => key !== null)
  );
  let prefixLength = 0;
  while (prefixLength < episodes.length) {
    const current = episodes[prefixLength];
    if (!watchedKeys.has(`S${current.season}E${current.episode}`)) break;
    prefixLength += 1;
  }
  return episodes.slice(0, prefixLength);
}

export function episodeKey(season: number, episode: number): string {
  return `S${season}E${episode}`;
}
