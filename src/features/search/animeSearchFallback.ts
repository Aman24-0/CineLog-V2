// src/features/search/animeSearchFallback.ts
//
// Anime Search Fallback
// ---------------------------------------------------------------------
// When the main TMDB search returns no results for a query, the Search
// page can use this as a fallback to find anime via AniList.
//
// PIPELINE:
//   1. Call searchAnime(query) on AniList (returns AniList Media[]).
//   2. For each result, look up its TMDB id via getTmdbId (mapping table).
//      If no mapping exists, skip (we don't auto-map during search —
//      too expensive for a list of results).
//   3. Batch-fetch TMDB metadata for the mapped ids.
//   4. Return TMDBTitle[] — same shape as the main TMDB search results,
//      so the existing SearchResults component can render them without
//      any changes.
//
// WHEN TO USE:
//   - The TMDB search returned zero results.
//   - The query looks anime-related (heuristic: contains Japanese
//     characters OR matches anime keywords). We don't want to spam
//     AniList for every English movie search.
//
// WHEN NOT TO USE:
//   - TMDB returned results (even if few). TMDB is the primary source.
//   - The query is empty or very short (< 3 chars).
//
// ERROR HANDLING:
//   Returns an empty array on any failure. The caller falls back to
//   the existing "no results" UI.

import { searchAnime } from "~/lib/anilist";
import { getTmdbId } from "~/lib/supabase/repositories/animeMapping";
import { fetchTmdbMetadataBatch } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";

// Japanese hiragana + katakana + kanji ranges. If the query contains
// any of these characters, it's very likely an anime search.
const JAPANESE_CHAR_RE = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\u3400-\u4dbf]/;

const ANIME_KEYWORDS = [
  "anime", "manga", "ova", "ona", "shounen", "shoujo", "seinen",
  "isekai", "mecha", "kawaii", "senpai", "kawaii", "tsundere",
  "light novel", "visual novel"
];

/**
 * Heuristic: does this query look anime-related?
 * Used to decide whether to fire the AniList fallback. We want to
 * avoid spamming AniList for every search, but also avoid missing
 * anime results when the user is clearly searching for anime.
 */
export function looksLikeAnimeQuery(query: string): boolean {
  if (!query || query.length < 3) return false;
  // Japanese characters → strong signal.
  if (JAPANESE_CHAR_RE.test(query)) return true;
  // Anime keywords → weak signal (case-insensitive word match).
  const lower = query.toLowerCase();
  return ANIME_KEYWORDS.some((kw) => {
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(lower);
  });
}

/**
 * Search AniList for anime matching the query, then map results back
 * to TMDB titles for display.
 *
 * @param query   The search string.
 * @param limit   Max number of TMDB titles to return (default 10).
 * @returns       TMDBTitle[] — same shape as TMDB search results.
 *                Empty array on failure or no mappings.
 */
export async function searchAnimeFallback(
  query: string,
  limit = 10
): Promise<TMDBTitle[]> {
  if (!query || query.length < 3) return [];

  try {
    // 1. Search AniList.
    const result = await searchAnime(query, 1, 20);
    if (!result.media || result.media.length === 0) return [];

    // 2. Map AniList ids → TMDB ids in parallel.
    const tmdbIdPairs = await Promise.all(
      result.media.map(async (media) => {
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

    // 4. Build the final array, preserving AniList order (best match first).
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
    console.warn("[animeSearchFallback] failed:", err);
    return [];
  }
}
