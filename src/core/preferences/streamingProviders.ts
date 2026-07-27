// src/core/preferences/streamingProviders.ts
// Streaming Provider Subscriptions
// A set of TMDB watch_provider IDs the user is subscribed to.
// Used by Discover OTT section + Where-to-watch on detail pages.
//
// DYNAMIC PROVIDER LIST (v3):
//   There are NO hardcoded provider lists here. Both the Settings page
//   and the Discover OTT dropdown fetch the full provider list directly
//   from TMDB's /watch/providers/{movie,tv}?watch_region={country}
//   endpoints, merge them, deduplicate by provider_id, and sort by
//   TMDB's display_priority ascending. This ensures every official
//   streaming provider for the user's country is available — no manual
//   curation, no alias mapping, no hidden services.

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";

const STREAMING_PROVIDERS_KEY = "cinelog_streaming_providers";

function readProviderSet(): string[] {
  if (isServer) return [];
  try {
    const raw = localStorage.getItem(STREAMING_PROVIDERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const [streamingProviders, setStreamingProviders] = createSignal<string[]>(readProviderSet());

createEffect(() => {
  if (isServer) return;
  try {
    localStorage.setItem(STREAMING_PROVIDERS_KEY, JSON.stringify(streamingProviders()));
  } catch {
    // ignore quota errors
  }
});

export function toggleStreamingProvider(id: string): void {
  setStreamingProviders((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );
}

export function hasStreamingProvider(id: string): boolean {
  return streamingProviders().includes(id);
}

// ─── Dynamic provider types + utilities ───────────────────────────────

/**
 * A single TMDB watch provider — the shape returned by
 * /watch/providers/{movie,tv}?watch_region={region}.
 *
 * This is the ONLY provider type used by the Settings page and the
 * Discover OTT dropdown. There are no curated/aliased variants —
 * every provider is fetched directly from TMDB.
 */
export interface TmdbProvider {
  /** TMDB watch_provider ID (as a string for the discover query). */
  id: string;
  /** Official TMDB provider_name (e.g. "Netflix", "Amazon Prime Video"). */
  name: string;
  /** TMDB logo_path (e.g. "/8OUSXUW5n6fO7xofp5WhFpk6fS9.jpg"). */
  logoPath: string | null;
  /**
   * TMDB display_priority — a 0-based integer where lower = more
   * popular in the region. Used to sort the merged movie+TV list so
   * Netflix/Prime appear at the top.
   */
  displayPriority: number;
}

/**
 * Raw row shape from getWatchProviderList / getWatchProviderListTv.
 * Kept here (not in discover.ts) so the merge utility is self-contained
 * and doesn't need to know about the TMDB fetch layer.
 */
interface TmdbProviderRow {
  providerId: number;
  providerName: string;
  logoPath: string | null;
  displayPriority: number;
}

/**
 * Merge the movie + TV provider lists from TMDB into a single
 * deduplicated list, sorted by display_priority ascending.
 *
 * Rules:
 *   1. Deduplicate by provider_id — if a provider appears in both the
 *      movie and TV lists, keep the first occurrence (movie list wins
 *      because it's passed first; the movie display_priority is
 *      generally the canonical one).
 *   2. Sort by display_priority ascending — TMDB's priority puts the
 *      most popular providers (Netflix, Prime, etc.) at the top.
 *   3. IDs are normalized to strings (the discover query + the
 *      streamingProviders preference both use string IDs).
 *
 * @param movieRows  Rows from getWatchProviderList(region)
 * @param tvRows     Rows from getWatchProviderListTv(region)
 * @returns Merged, deduplicated, sorted TmdbProvider[]
 */
export function mergeAndSortProviders(
  movieRows: TmdbProviderRow[],
  tvRows: TmdbProviderRow[],
): TmdbProvider[] {
  const seen = new Set<string>();
  const merged: TmdbProvider[] = [];
  // Movie list first — its display_priority is generally canonical.
  for (const row of movieRows) {
    const id = String(row.providerId);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({
      id,
      name: row.providerName,
      logoPath: row.logoPath,
      displayPriority: row.displayPriority,
    });
  }
  // TV list — add any providers not already in the movie list.
  for (const row of tvRows) {
    const id = String(row.providerId);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({
      id,
      name: row.providerName,
      logoPath: row.logoPath,
      // TV-only providers keep their TV display_priority.
      displayPriority: row.displayPriority,
    });
  }
  // Sort by display_priority ascending (most popular first).
  merged.sort((a, b) => a.displayPriority - b.displayPriority);
  return merged;
}
