// src/features/collection/collectionFetcher.ts
import { fetchCollectionDetails } from "~/core/tmdb/tmdb";
import { searchMulti } from "~/core/tmdb/discover";
import type { TMDBTitle } from "~/shared/types";
import type { FranchiseDefinition } from "~/shared/data/franchises";

/**
 * collectionFetcher — pure data fetcher for the CollectionModal.
 *
 * Extracted from CollectionModal.tsx to keep the component under the
 * 250-line limit. Returns titles in timeline (release-date) order.
 *
 * DATA SOURCES (hybrid, in priority order):
 *   1. TMDB /collection/{id} — if the franchise has tmdbCollectionId
 *      (authoritative for movie collections like Harry Potter, Mission Impossible)
 *   2. Keyword-based search — for franchises without a TMDB collection
 *      (MCU, Star Wars, John Wick — searches TMDB for each keyword)
 */
export async function fetchFranchiseTitles(f: FranchiseDefinition): Promise<TMDBTitle[]> {
  // Strategy 1: TMDB collection endpoint (movie franchises)
  if (f.tmdbCollectionId) {
    try {
      const collection = await fetchCollectionDetails(f.tmdbCollectionId);
      return collection.parts.map((p): TMDBTitle => ({
        id: p.id,
        title: p.title,
        media_type: "movie" as const,
        poster_path: p.poster_path,
        backdrop_path: p.backdrop_path,
        overview: p.overview,
        release_date: p.release_date,
        vote_average: p.vote_average,
        vote_count: p.vote_count,
      }));
    } catch (err) {
      console.warn("TMDB collection fetch failed, falling back to search:", err);
    }
  }

  // Strategy 2: Keyword-based search
  const allResults: TMDBTitle[] = [];
  const seen = new Set<string>();
  const keywordsToSearch = f.keywords.slice(0, 5);
  for (const keyword of keywordsToSearch) {
    try {
      const results = await searchMulti(keyword);
      for (const r of results) {
        const key = `${r.media_type}/${r.id}`;
        if (seen.has(key)) continue;
        // Verify the result actually matches a franchise keyword
        const name = (r.title || r.name || "").toLowerCase();
        if (f.keywords.some((k) => name.includes(k))) {
          seen.add(key);
          allResults.push(r);
        }
      }
    } catch {
      // skip this keyword
    }
  }

  // Sort by release date ascending (timeline order)
  return allResults.sort((a, b) => {
    const dateA = a.release_date || a.first_air_date || "";
    const dateB = b.release_date || b.first_air_date || "";
    return dateA.localeCompare(dateB);
  });
}
