// src/core/tmdb/tmdb.ts
import type { TMDBDetails, TMDBSeasonDetails, TMDBCollection, TMDBTitle } from "~/shared/types";
import { cachedFetch, buildCacheKey, TMDB_TTL } from "~/shared/utils/apiCache";

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

/** Cached fetch helper for TMDB JSON endpoints. */
async function tmdbFetch<T>(endpoint: string): Promise<T> {
  return cachedFetch(
    buildCacheKey(`tmdb:${endpoint}`),
    TMDB_TTL,
    async () => {
      const res = await fetch(`${API}${endpoint}&api_key=${TMDB_KEY}`);
      if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`);
      return res.json() as Promise<T>;
    }
  );
}

export const fetchTmdbDetails = async (
  mediaType: string,
  id: string
): Promise<TMDBDetails> => {
  return tmdbFetch<TMDBDetails>(
    `/${mediaType}/${id}?language=en-US&append_to_response=videos`
  );
};

/**
 * Fetch lightweight TMDB metadata (title, poster, backdrop, release date,
 * vote average) for a single movie or TV title by its TMDB id.
 *
 * Used by the vault enrichment layer (userLibraryAdapter) to fill in
 * display fields that are NOT stored in the Supabase `vault` table.
 * The vault only stores user-owned state (status, rating, notes) + the
 * TMDB id — the title/poster must be fetched from TMDB on every load.
 *
 * Returns null on error so the caller can fall back to "Untitled" /
 * "NO POSTER" placeholders rather than crashing the whole vault render.
 *
 * @param mediaType "movie" | "tv"
 * @param id        TMDB numeric id (as stored in vault.tmdb_id)
 */
export async function fetchTmdbMetadata(
  mediaType: "movie" | "tv",
  id: number | string,
): Promise<TMDBTitle | null> {
  try {
    const data = await tmdbFetch<TMDBTitle>(
      `/${mediaType}/${id}?language=en-US`,
    );
    return { ...data, media_type: mediaType };
  } catch (err) {
    console.warn(`[tmdb] Failed to fetch ${mediaType}/${id}:`, err);
    return null;
  }
}

/**
 * Batch-fetch TMDB metadata for multiple vault items.
 *
 * Fires all requests in parallel (Promise.allSettled) so one slow/failing
 * request doesn't block the others. Returns a Map keyed by "{media_type}/{id}"
 * for O(1) lookup during vault enrichment.
 *
 * @param items Array of { mediaType, tmdbId } pairs.
 * @returns Map<"movie|tv/{id}", TMDBTitle>
 */
export async function fetchTmdbMetadataBatch(
  items: ReadonlyArray<{ mediaType: "movie" | "tv"; tmdbId: number | string }>,
): Promise<Map<string, TMDBTitle>> {
  const results = await Promise.allSettled(
    items.map((item) => fetchTmdbMetadata(item.mediaType, item.tmdbId)),
  );
  const map = new Map<string, TMDBTitle>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      const item = items[index];
      map.set(`${item.mediaType}/${item.tmdbId}`, result.value);
    }
  });
  return map;
}

export const fetchSeasonDetails = async (
  tvId: string | number,
  seasonNumber: number
): Promise<TMDBSeasonDetails> => {
  return tmdbFetch<TMDBSeasonDetails>(
    `/tv/${tvId}/season/${seasonNumber}?language=en-US`
  );
};

export const fetchCollectionDetails = async (
  collectionId: number
): Promise<TMDBCollection> => {
  return tmdbFetch<TMDBCollection>(
    `/collection/${collectionId}?language=en-US`
  );
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
