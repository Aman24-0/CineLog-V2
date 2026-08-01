// src/features/collections/animeSmartCollections.ts
//
// Anime Smart Collections (Phase 7)
// ---------------------------------------------------------------------
// AniList-sourced "smart collections" that any user can subscribe to.
// Unlike user-vault smart collections (which filter the user's own
// library by rules), these are global lists curated by AniList:
//
//   1. "Currently Airing Anime" — AniList status: RELEASING
//   2. "Completed Anime Classics" — AniList status: FINISHED, score ≥ 80
//   3. "Top Rated Anime" — AniList sort: SCORE_DESC, score ≥ 80
//   4. "Seasonal Picks" — current AniList season + year
//
// Each collection returns TMDBTitle[] (mapped back from AniList ids via
// the mapping table) so they render in the existing Collections UI
// without changes.
//
// CACHING:
//   Each collection is cached via apiCache with a 6-24h TTL (see
//   animeCarousels.ts for the same pattern). On-demand refresh is
//   triggered by the Collections page's "Refresh" button.
//
// SUBSCRIPTION MODEL:
//   These are READ-ONLY — the user doesn't "subscribe" in the DB
//   sense. They're always visible on the Collections page under a
//   "Curated Anime Collections" section. (A future iteration can add
//   per-user subscriptions + persistence; for now they're public.)

import { cachedFetch, buildCacheKey } from "~/shared/utils/apiCache";
import { fetchTmdbMetadataBatch } from "~/core/tmdb/tmdb";
import {
  fetchCurrentlyAiring,
  fetchFinishedAnime,
  fetchTopRatedAnime,
  fetchSeasonalAnime,
  currentAniListSeason
} from "~/lib/anilist";
import { getTmdbId } from "~/lib/supabase/repositories/animeMapping";
import type { TMDBTitle } from "~/shared/types";
import type { AniListMedia } from "~/lib/anilist";

export interface AnimeSmartCollection {
  /** Stable id for keying UI lists + caching. */
  id: string;
  /** Display name. */
  label: string;
  /** Material Symbols icon name for the collection card. */
  icon: string;
  /** Short description shown under the label. */
  description: string;
  /** The TMDB titles in this collection. */
  titles: TMDBTitle[];
}

// ─── TTLs ───────────────────────────────────────────────────────────

const TTL_CURRENTLY_AIRING = 6 * 60 * 60 * 1000;   // 6h
const TTL_COMPLETED = 24 * 60 * 60 * 1000;          // 24h
const TTL_TOP_RATED = 24 * 60 * 60 * 1000;          // 24h
const TTL_SEASONAL = 6 * 60 * 60 * 1000;            // 6h

// ─── Shared pipeline (same as animeCarousels.ts) ────────────────────

async function anilistMediaToTmdbTitles(
  anilistMedia: AniListMedia[],
  limit = 24
): Promise<TMDBTitle[]> {
  if (!anilistMedia || anilistMedia.length === 0) return [];
  const tmdbIdPairs = await Promise.all(
    anilistMedia.map(async (media) => {
      const tmdbId = await getTmdbId(media.id);
      return tmdbId != null ? { tmdbId, mediaType: "tv" as const } : null;
    })
  );
  const valid = tmdbIdPairs.filter(
    (p): p is { tmdbId: number; mediaType: "tv" } => p !== null
  );
  if (valid.length === 0) return [];
  const tmdbMap = await fetchTmdbMetadataBatch(valid);
  const titles: TMDBTitle[] = [];
  for (const { tmdbId, mediaType } of valid) {
    const key = `${mediaType}/${tmdbId}`;
    const t = tmdbMap.get(key);
    if (t) {
      titles.push(t);
      if (titles.length >= limit) break;
    }
  }
  return titles;
}

// ─── Individual collection fetchers ─────────────────────────────────

export async function getCurrentlyAiringCollection(limit = 24): Promise<TMDBTitle[]> {
  return cachedFetch<TMDBTitle[]>(
    buildCacheKey("anilist:smart:currently_airing"),
    TTL_CURRENTLY_AIRING,
    async () => {
      try {
        const result = await fetchCurrentlyAiring(1, 30);
        return await anilistMediaToTmdbTitles(result.media, limit);
      } catch (err) {
        console.warn("[animeSmartCollections] currently_airing failed:", err);
        return [];
      }
    }
  );
}

export async function getCompletedClassicsCollection(limit = 24): Promise<TMDBTitle[]> {
  return cachedFetch<TMDBTitle[]>(
    buildCacheKey("anilist:smart:completed"),
    TTL_COMPLETED,
    async () => {
      try {
        const result = await fetchFinishedAnime(1, 30);
        return await anilistMediaToTmdbTitles(result.media, limit);
      } catch (err) {
        console.warn("[animeSmartCollections] completed failed:", err);
        return [];
      }
    }
  );
}

export async function getTopRatedCollection(limit = 24): Promise<TMDBTitle[]> {
  return cachedFetch<TMDBTitle[]>(
    buildCacheKey("anilist:smart:top_rated"),
    TTL_TOP_RATED,
    async () => {
      try {
        const result = await fetchTopRatedAnime(1, 30);
        return await anilistMediaToTmdbTitles(result.media, limit);
      } catch (err) {
        console.warn("[animeSmartCollections] top_rated failed:", err);
        return [];
      }
    }
  );
}

export async function getSeasonalPicksCollection(limit = 24): Promise<TMDBTitle[]> {
  const { season, year } = currentAniListSeason();
  return cachedFetch<TMDBTitle[]>(
    buildCacheKey(`anilist:smart:seasonal:${season}:${year}`),
    TTL_SEASONAL,
    async () => {
      try {
        const result = await fetchSeasonalAnime(season, year, 1, 30);
        return await anilistMediaToTmdbTitles(result.media, limit);
      } catch (err) {
        console.warn("[animeSmartCollections] seasonal failed:", err);
        return [];
      }
    }
  );
}

/**
 * Fetch ALL smart anime collections in parallel. Used by the
 * Collections page to render the section in one pass.
 *
 * Each collection is independent — if one fails, the others still load.
 */
export async function getAllAnimeSmartCollections(): Promise<AnimeSmartCollection[]> {
  const [currentlyAiring, completed, topRated, seasonal] = await Promise.all([
    getCurrentlyAiringCollection(),
    getCompletedClassicsCollection(),
    getTopRatedCollection(),
    getSeasonalPicksCollection()
  ]);

  const collections: AnimeSmartCollection[] = [];
  if (currentlyAiring.length > 0) {
    collections.push({
      id: "anime_currently_airing",
      label: "Currently Airing Anime",
      icon: "play_circle",
      description: "Series airing new episodes right now",
      titles: currentlyAiring
    });
  }
  if (completed.length > 0) {
    collections.push({
      id: "anime_completed_classics",
      label: "Completed Anime Classics",
      icon: "verified",
      description: "Finished series with the highest scores",
      titles: completed
    });
  }
  if (topRated.length > 0) {
    collections.push({
      id: "anime_top_rated",
      label: "Top Rated Anime",
      icon: "star",
      description: "The highest-rated anime of all time",
      titles: topRated
    });
  }
  if (seasonal.length > 0) {
    const { season, year } = currentAniListSeason();
    collections.push({
      id: "anime_seasonal_picks",
      label: `Seasonal Picks — ${season.charAt(0) + season.slice(1).toLowerCase()} ${year}`,
      icon: "event",
      description: "What's airing this season",
      titles: seasonal
    });
  }
  return collections;
}
