// src/core/tmdb/tmdb.ts
import type { TMDBDetails, TMDBSeasonDetails } from "~/shared/types";

export const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;

const IMG_BASE = "https://image.tmdb.org/t/p";
const API = "https://api.themoviedb.org/3";

/**
 * Build a TMDB image URL. Sizes follow TMDB's documented w-pixel conventions.
 * Returns "" if path is null/undefined (so callers can <Show when={url}>).
 */
export const tmdbImage = (
  path: string | null | undefined,
  size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "w1280" | "original" = "w500"
): string => (path ? `${IMG_BASE}/${size}${path}` : "");

export const fetchTmdbDetails = async (
  mediaType: string,
  id: string
): Promise<TMDBDetails> => {
  // append=response=videos pulls trailer/teaser clips in a single request,
  // avoiding a second round-trip when the Details modal opens.
  const res = await fetch(
    `${API}/${mediaType}/${id}?api_key=${TMDB_KEY}&language=en-US&append_to_response=videos`
  );
  if (!res.ok) throw new Error("Failed to fetch TMDB details");
  return res.json();
};

/**
 * fetchSeasonDetails — fetch the episode list for a single TV season.
 *
 * Used by the SeasonNavigator in the Details modal. Each season is
 * fetched lazily — only when the user expands that season's accordion —
 * so opening the Details modal doesn't pay for all seasons upfront.
 *
 * The response includes episode stills, titles, runtimes, air dates,
 * overviews, and vote averages. Episode data is TMDB-sourced (not
 * user-owned).
 */
export const fetchSeasonDetails = async (
  tvId: string | number,
  seasonNumber: number
): Promise<TMDBSeasonDetails> => {
  const res = await fetch(
    `${API}/tv/${tvId}/season/${seasonNumber}?api_key=${TMDB_KEY}&language=en-US`
  );
  if (!res.ok) throw new Error(`Failed to fetch season ${seasonNumber}`);
  return res.json();
};

/**
 * Pick the best trailer from a TMDB details payload.
 * Prefers YouTube trailers (official first), then teasers, then any YouTube
 * video. Returns null if none available.
 */
export const pickTrailer = (details: TMDBDetails | null): {
  key: string;
  name: string;
} | null => {
  const videos = details?.videos?.results;
  if (!videos || videos.length === 0) return null;

  const youTube = videos.filter((v) => v.site === "YouTube");
  if (youTube.length === 0) return null;

  const score = (v: (typeof youTube)[number]): number => {
    let s = 0;
    if (v.type === "Trailer") s += 10;
    if (v.official) s += 5;
    if (v.type === "Teaser") s += 2;
    return s;
  };

  const best = [...youTube].sort((a, b) => score(b) - score(a))[0];
  return best ? { key: best.key, name: best.name } : null;
};
