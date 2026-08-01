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
import { searchMulti } from "~/core/tmdb/discover";
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
import { getTmdbId, saveMapping } from "~/lib/supabase/repositories/animeMapping";
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
 * Pick the best AniList title variant for a TMDB search query.
 * Preference order: userPreferred → english → romaji → native.
 * Falls back to "" if no variant is available.
 */
function pickAniListTitle(media: AniListMedia): string {
  return (
    media.title?.userPreferred ||
    media.title?.english ||
    media.title?.romaji ||
    media.title?.native ||
    ""
  );
}

/**
 * Find a TMDB match for an AniList Media by searching TMDB's /search/multi
 * endpoint with the AniList title. Used as a FALLBACK when no mapping
 * exists in the `anime_mappings` table.
 *
 * Heuristics for picking the best match:
 *   1. Prefer results whose media_type is "tv" or "movie" (skip people).
 *   2. If the AniList Media has a seasonYear, prefer results whose
 *      release_date/first_air_date year matches (±1 year tolerance).
 *   3. Prefer results with a poster_path (skip placeholder entries).
 *   4. For AniList format=MOVIE, prefer movie results; otherwise prefer tv.
 *
 * Returns { tmdbId, mediaType } or null if no good match was found.
 */
async function findTmdbMatchViaSearch(
  media: AniListMedia
): Promise<{ tmdbId: number; mediaType: "tv" | "movie" } | null> {
  const title = pickAniListTitle(media);
  if (!title) return null;

  try {
    const results = await searchMulti(title);
    if (!results || results.length === 0) return null;

    const anilistYear = media.seasonYear ?? null;
    const anilistFormat = media.format;
    const preferMovies = anilistFormat === "MOVIE";

    // Score each result and pick the best one.
    let best: { tmdbId: number; mediaType: "tv" | "movie"; score: number } | null = null;
    for (const r of results) {
      // Skip non-media results (people, etc.)
      if (r.media_type !== "tv" && r.media_type !== "movie") continue;
      // Skip results without a poster (likely placeholder/low-quality)
      if (!r.poster_path && !r.backdrop_path) continue;

      let score = 0;
      // Base score: prefer movies for MOVIE format, tv for everything else
      if (preferMovies && r.media_type === "movie") score += 30;
      else if (!preferMovies && r.media_type === "tv") score += 30;

      // Year match bonus
      if (anilistYear != null) {
        const dateStr = r.release_date || r.first_air_date || "";
        const resultYear = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
        if (resultYear != null && !Number.isNaN(resultYear)) {
          if (resultYear === anilistYear) score += 50;
          else if (Math.abs(resultYear - anilistYear) <= 1) score += 30;
          else if (Math.abs(resultYear - anilistYear) <= 3) score += 10;
        }
      }

      // Popularity tiebreaker
      score += Math.min(r.vote_count ?? 0, 100) / 100;

      if (!best || score > best.score) {
        best = { tmdbId: r.id, mediaType: r.media_type as "tv" | "movie", score };
      }
    }

    // Only return a match if the score is reasonable (avoids bad matches
    // for very generic anime titles like "Wolf" or "Hero").
    if (!best || best.score < 30) return null;
    return { tmdbId: best.tmdbId, mediaType: best.mediaType };
  } catch (err) {
    console.warn(`[animeCarousels] TMDB search failed for "${title}":`, err);
    return null;
  }
}

/**
 * Convert a list of AniList Media objects into a list of TMDB titles
 * by mapping each AniList id → TMDB id → TMDB metadata.
 *
 * Pipeline:
 *   1. For each AniList Media, look up its TMDB id via the mapping table.
 *   2. If no mapping exists, FALL BACK to searching TMDB by title. If a
 *      match is found, save the mapping (fire-and-forget) so future
 *      loads skip the search.
 *   3. Batch-fetch TMDB metadata for the mapped ids.
 *   4. Filter out any items where TMDB metadata fetch failed.
 *   5. Return the TMDBTitle[] array.
 *
 * The fallback (step 2) is CRITICAL for first-time use: before any user
 * has opened an anime Details page (which triggers auto-mapping), the
 * `anime_mappings` table is empty. Without the fallback, every carousel
 * would return an empty array and the Discover page would show no anime
 * sections at all.
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

  // 1. Try the mapping table for every AniList id in parallel.
  //    Items without a mapping get a fallback TMDB search.
  const lookupResults = await Promise.all(
    anilistMedia.map(async (media): Promise<{
      tmdbId: number;
      mediaType: "tv" | "movie";
      anilist: AniListMedia;
    } | null> => {
      // 1a. Try the mapping table first (fast path — cached in-memory).
      const mappedTmdbId = await getTmdbId(media.id);
      if (mappedTmdbId != null) {
        return { tmdbId: mappedTmdbId, mediaType: "tv" as const, anilist: media };
      }

      // 1b. Fallback: search TMDB by title. This is the path that
      //     populates the mapping table on first use.
      const searchMatch = await findTmdbMatchViaSearch(media);
      if (searchMatch) {
        // Fire-and-forget save so the next carousel load skips the search.
        // We don't await this — the carousel doesn't need to wait for the
        // mapping to be persisted. If it fails (RLS, network), the next
        // load will just search again.
        void saveMapping({
          tmdbId: searchMatch.tmdbId,
          tmdbType: searchMatch.mediaType,
          anilistId: media.id,
          anilistType: "ANIME",
          title: pickAniListTitle(media),
          matchConfidence: "medium",
          createdBy: "system"
        }).catch(() => {
          // Silent — RLS blocks anon writes, which is expected.
          // The mapping just won't persist; next load will search again.
        });
        return {
          tmdbId: searchMatch.tmdbId,
          mediaType: searchMatch.mediaType,
          anilist: media
        };
      }
      return null;
    })
  );

  const valid = lookupResults.filter(
    (p): p is NonNullable<typeof p> => p !== null
  );
  if (valid.length === 0) return [];

  // 2. Batch-fetch TMDB metadata for all resolved ids.
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
