// src/features/details/animeRecommendations.ts
//
// Anime Recommendations (Phase 6)
// ---------------------------------------------------------------------
// Fetches AniList's recommendation graph for the current anime title,
// maps the recommended AniList ids back to TMDB ids (via the mapping
// table), and returns TMDBTitle[] so the existing SimilarTitles /
// DiscoverRail components can render them without changes.
//
// PIPELINE:
//   1. fetchAnimeRecommendations(anilistId) → AniListMedia[]
//      (AniList's recommendation graph — community-rated "if you liked
//      X, you might like Y" suggestions)
//   2. For each recommended AniList id, look up its TMDB id.
//      If no mapping exists, SKIP (we don't auto-map during the recs
//      flow — too expensive for a list of 12 items).
//   3. Batch-fetch TMDB metadata.
//   4. Return TMDBTitle[].
//
// CACHING:
//   The AniList client caches the recommendations query for 5 minutes.
//   The TMDB metadata fetch uses the standard apiCache (10 min TTL).
//
// ERROR HANDLING:
//   Returns an empty array on any failure. The caller should silently
//   fall back to TMDB recommendations (the existing DetailsModal path).

import { fetchAnimeRecommendations } from "~/lib/anilist";
import { getTmdbId } from "~/lib/supabase/repositories/animeMapping";
import { fetchTmdbMetadataBatch } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";

/**
 * Fetch anime recommendations for a given AniList id.
 *
 * @param anilistId  The AniList Media.id of the current title.
 * @param limit      Max number of TMDB titles to return (default 12).
 * @returns          TMDBTitle[] — same shape as TMDB recommendations.
 *                   Empty array on failure or no mappings.
 */
export async function getAnimeRecommendations(
  anilistId: number,
  limit = 12
): Promise<TMDBTitle[]> {
  if (!anilistId || anilistId <= 0) return [];

  try {
    // 1. Fetch AniList recommendations.
    const anilistMedia = await fetchAnimeRecommendations(anilistId, 1, 20);
    if (!anilistMedia || anilistMedia.length === 0) return [];

    // 2. Map AniList ids → TMDB ids in parallel.
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

    // 3. Batch-fetch TMDB metadata.
    const tmdbMap = await fetchTmdbMetadataBatch(valid);

    // 4. Build the final array, preserving the AniList order (highest
    //    community rating first). Filter out any items where TMDB
    //    returned null (e.g. stale mappings).
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
  } catch (err) {
    console.warn(`[animeRecommendations] failed for anilist_id=${anilistId}:`, err);
    return [];
  }
}
