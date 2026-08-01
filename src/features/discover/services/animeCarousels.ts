// src/features/discover/services/animeCarousels.ts
//
// Anime Carousels — Discover page feeds sourced from AniList.
// ---------------------------------------------------------------------
// Each function returns a Promise<TMDBTitle[]> so the Discover page can
// render anime cards using the EXISTING <DiscoverRail /> component
// (no UI changes needed — the cards are TMDB-shaped, just sourced
// from AniList).
//
// PIPELINE:
//   1. Fetch a list of AniList Media objects (e.g. trending).
//   2. For each AniList Media, look up its TMDB id via the mapping
//      table (getTmdbId). If no mapping exists, SKIP that item.
//      (We don't auto-map on Discover — that would be too expensive
//      for a list of 20 items. Auto-mapping happens lazily on the
//      Details page when the user opens an anime title.)
//   3. Batch-fetch TMDB metadata for the mapped ids (fetchTmdbMetadataBatch).
//   4. Filter out any items where TMDB metadata fetch failed.
//   5. Return the TMDBTitle[] array.
//
// CACHING (per carousel):
//   Trending:  6 hours
//   Seasonal:  6 hours
//   Upcoming: 12 hours
//   TopRated: 24 hours
//   Popular:  12 hours
//   HiddenGems: 24 hours
//   Movies:   24 hours
//
//   The cache is module-level + uses the existing apiCache layer so
//   in-flight dedup is automatic.
//
// ERROR HANDLING:
//   Every function returns an empty array on failure. The Discover
//   page's <DiscoverRail /> renders its empty state when titles=[].
//   We log the error to the console but never throw.

import { cachedFetch, buildCacheKey } from "~/shared/utils/apiCache";
import { fetchTmdbMetadataBatch } from "~/core/tmdb/tmdb";
import {
  fetchTrendingAnime,
  fetchSeasonalAnime,
  fetchUpcomingAnime,
  fetchTopRatedAnime,
  fetchPopularAnime,
  fetchHiddenGemsAnime,
  fetchAnimeMovies,
  fetchCurrentlyAiring,
  fetchFinishedAnime,
  currentAniListSeason
} from "~/lib/anilist";
import { getTmdbId } from "~/lib/supabase/repositories/animeMapping";
import type { TMDBTitle } from "~/shared/types";
import type { AniListMedia } from "~/lib/anilist";

// Re-export for callers that want the AniList-typed Media.
export type { AniListMedia };

// ─── TTLs (milliseconds) ────────────────────────────────────────────

const TTL_TRENDING = 6 * 60 * 60 * 1000;   // 6 hours
const TTL_SEASONAL = 6 * 60 * 60 * 1000;   // 6 hours
const TTL_UPCOMING = 12 * 60 * 60 * 1000;  // 12 hours
const TTL_TOP_RATED = 24 * 60 * 60 * 1000; // 24 hours
const TTL_POPULAR = 12 * 60 * 60 * 1000;   // 12 hours
const TTL_HIDDEN_GEMS = 24 * 60 * 60 * 1000;
const TTL_MOVIES = 24 * 60 * 60 * 1000;
const TTL_CURRENTLY_AIRING = 6 * 60 * 60 * 1000;
const TTL_FINISHED = 24 * 60 * 60 * 1000;

// ─── Shared pipeline ────────────────────────────────────────────────

/**
 * Convert a list of AniList Media objects into a list of TMDB titles
 * by mapping each AniList id → TMDB id → TMDB metadata.
 *
 * Steps 2-4 of the pipeline above. Used by every carousel function.
 *
 * @param anilistMedia  The AniList Media list (e.g. trending).
 * @param limit         Max number of TMDB titles to return. We over-
 *                      fetch from AniList (perPage=20) because some
 *                      items won't have TMDB mappings. This limit
 *                      caps the final output.
 */
async function anilistMediaToTmdbTitles(
  anilistMedia: AniListMedia[],
  limit = 12
): Promise<TMDBTitle[]> {
  if (!anilistMedia || anilistMedia.length === 0) return [];

  // 1. Map every AniList id → TMDB id in parallel.
  const tmdbIdPairs = await Promise.all(
    anilistMedia.map(async (media) => {
      const tmdbId = await getTmdbId(media.id);
      return tmdbId != null
        ? { tmdbId, mediaType: "tv" as const, anilist: media }
        : null;
    })
  );
  const valid = tmdbIdPairs.filter((p): p is NonNullable<typeof p> => p !== null);
  if (valid.length === 0) return [];

  // 2. Batch-fetch TMDB metadata.
  const tmdbMetadataMap = await fetchTmdbMetadataBatch(
    valid.map((p) => ({ mediaType: p.mediaType, tmdbId: p.tmdbId }))
  );

  // 3. Build the final TMDBTitle[] array, preserving the AniList order
  //    (trending first, etc.). Filter out any items where TMDB returned
  //    null (e.g. the mapping was stale and TMDB deleted the title).
  const titles: TMDBTitle[] = [];
  for (const { tmdbId, mediaType } of valid) {
    const key = `${mediaType}/${tmdbId}`;
    const title = tmdbMetadataMap.get(key);
    if (title) {
      titles.push(title);
      if (titles.length >= limit) break;
    }
  }
  return titles;
}

// ─── Public carousel functions ──────────────────────────────────────

/**
 * Cached wrapper for an AniList carousel. Runs the AniList query, then
 * pipes the results through anilistMediaToTmdbTitles. Each carousel
 * has its own TTL (specified by the caller).
 */
async function cachedCarousel(
  cacheKey: string,
  ttl: number,
  fetchAnilist: () => Promise<{ media: AniListMedia[]; hasNextPage: boolean }>,
  limit = 12
): Promise<TMDBTitle[]> {
  return cachedFetch<TMDBTitle[]>(
    buildCacheKey(`anilist:carousel:${cacheKey}`),
    ttl,
    async () => {
      try {
        const result = await fetchAnilist();
        return await anilistMediaToTmdbTitles(result.media, limit);
      } catch (err) {
        console.warn(`[animeCarousels] ${cacheKey} failed:`, err);
        return [];
      }
    }
  );
}

export const getTrendingAnimeCarousel = (limit = 12) =>
  cachedCarousel("trending", TTL_TRENDING, () => fetchTrendingAnime(1, 20), limit);

export const getSeasonalAnimeCarousel = (limit = 12) => {
  const { season, year } = currentAniListSeason();
  return cachedCarousel(
    `seasonal:${season}:${year}`,
    TTL_SEASONAL,
    () => fetchSeasonalAnime(season, year, 1, 20),
    limit
  );
};

export const getUpcomingAnimeCarousel = (limit = 12) =>
  cachedCarousel("upcoming", TTL_UPCOMING, () => fetchUpcomingAnime(1, 20), limit);

export const getTopRatedAnimeCarousel = (limit = 12) =>
  cachedCarousel("top_rated", TTL_TOP_RATED, () => fetchTopRatedAnime(1, 20), limit);

export const getPopularAnimeCarousel = (limit = 12) =>
  cachedCarousel("popular", TTL_POPULAR, () => fetchPopularAnime(1, 20), limit);

export const getHiddenGemsAnimeCarousel = (limit = 12) =>
  cachedCarousel("hidden_gems", TTL_HIDDEN_GEMS, () => fetchHiddenGemsAnime(1, 20), limit);

export const getAnimeMoviesCarousel = (limit = 12) =>
  cachedCarousel("movies", TTL_MOVIES, () => fetchAnimeMovies(1, 20), limit);

export const getCurrentlyAiringCarousel = (limit = 12) =>
  cachedCarousel("currently_airing", TTL_CURRENTLY_AIRING, () => fetchCurrentlyAiring(1, 20), limit);

export const getFinishedAnimeCarousel = (limit = 12) =>
  cachedCarousel("finished", TTL_FINISHED, () => fetchFinishedAnime(1, 20), limit);
