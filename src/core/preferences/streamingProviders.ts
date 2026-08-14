// src/core/preferences/streamingProviders.ts
// Streaming Provider Subscriptions
// ---------------------------------------------------------------------
// A list of JustWatch `technicalName` strings the user is subscribed to.
// Used by Discover OTT section + Where-to-watch on detail pages.
//
// ─────────────────────────────────────────────────────────────────────
// STAGE 5 MIGRATION (Chunk 4)
// ─────────────────────────────────────────────────────────────────────
// PREVIOUSLY: this preference stored TMDB watch_provider IDs as strings
// (e.g. "8" = Netflix, "119" = Amazon Prime Video). The values came from
// TMDB's `/watch/providers/{movie,tv}?watch_region={country}` endpoints.
//
// NOW: this preference stores JustWatch `technicalName` strings (e.g.
// "netflix", "amazonprimevideo"). The values come from the new
// `/api/ott/providers` route, which fetches JustWatch's
// `packages(country, platform: WEB)` GraphQL query.
//
// LEGACY CLEAR:
//   JustWatch `technicalName` values are NEVER pure-numeric (they're
//   slugged provider names like "netflix", "jiocinema", "sonyliv").
//   So any stored value matching `/^\d+$/` is a legacy TMDB ID. On
//   initialization we detect legacy IDs and clear the ENTIRE array —
//   partial migration is unsafe because TMDB ID 8 ≠ JustWatch "8"
//   (there is no JustWatch provider with technicalName "8"). Clearing
//   is all-or-nothing: either the array is all JustWatch technicalName
//   strings, or it's empty.
//
//   The clear happens BEFORE the signal is created (so the initial
//   value is already clean) AND the cleaned array is written back to
//   localStorage immediately so the next page load doesn't re-trigger
//   the clear. `preferencesSync.ts` will then push the empty array to
//   `prefs_json` on the next debounced sync, so legacy TMDB IDs are
//   also cleared from the server-side snapshot.
//
// ─────────────────────────────────────────────────────────────────────
// COMPATIBILITY EXPORTS (DO NOT REMOVE)
// ─────────────────────────────────────────────────────────────────────
// `TmdbProvider` and `mergeAndSortProviders` are STILL EXPORTED because:
//   • `src/features/discover/components/OttDropdown.tsx` imports them
//     (Discover OTT dropdown — NOT modified in this chunk).
//   • `src/routes/settings/content-discover.tsx` imports them (legacy
//     settings route — NOT modified in this chunk).
//   • `src/core/preferences/__tests__/streamingProviders.test.ts`
//     tests `mergeAndSortProviders`.
//
// These exports will be removed in a later chunk when the Discover OTT
// dropdown is migrated to JustWatch. For now they remain so this chunk
// doesn't break unrelated code.

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";

const STREAMING_PROVIDERS_KEY = "cinelog_streaming_providers";

/**
 * Returns true if a stored provider ID is a legacy TMDB watch_provider
 * ID (a pure-numeric string like "8", "119", "122").
 *
 * JustWatch `technicalName` values are NEVER pure-numeric — they're
 * slugged provider names ("netflix", "amazonprimevideo", "jiocinema",
 * "sonyliv", etc.). So any pure-numeric value in localStorage is a
 * legacy TMDB ID that must be cleared.
 */
export function isLegacyProviderId(value: string): boolean {
  return typeof value === "string" && /^\d+$/.test(value);
}

/**
 * Read the stored provider array from localStorage, clearing legacy
 * TMDB IDs on first contact.
 *
 * Flow:
 *   1. Parse the stored JSON array (defensive against malformed data).
 *   2. Filter to strings only (drop anything else).
 *   3. If ANY value is a legacy TMDB ID (pure-numeric), replace the
 *      ENTIRE array with [] and write the empty array back to
 *      localStorage immediately. Partial migration is unsafe because
 *      TMDB IDs and JustWatch technicalNames are completely different
 *      namespaces — keeping some TMDB IDs alongside JustWatch
 *      technicalNames would produce a broken mixed state.
 *   4. Otherwise return the array as-is.
 */
function readProviderSet(): string[] {
  if (isServer) return [];
  try {
    const raw = localStorage.getItem(STREAMING_PROVIDERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const strings = arr.filter((x) => typeof x === "string") as string[];

    // Legacy clear: if ANY value is a pure-numeric TMDB ID, nuke the
    // whole array. We can't safely map TMDB IDs → JustWatch
    // technicalNames (the mapping isn't 1:1 and isn't stored anywhere),
    // so a full clear is the only safe migration. The user will re-add
    // their providers via the new Settings UI.
    if (strings.some(isLegacyProviderId)) {
      try {
        localStorage.setItem(STREAMING_PROVIDERS_KEY, JSON.stringify([]));
      } catch {
        // ignore quota errors — the in-memory signal will still be []
      }
      return [];
    }

    return strings;
  } catch {
    return [];
  }
}

export const [streamingProviders, setStreamingProviders] =
  createSignal<string[]>(readProviderSet());

// Persist to localStorage on every change. The initial readProviderSet()
// already wrote [] back if it cleared legacy IDs, so this effect's first
// run is a no-op for cleared users (it writes [] over []).
createEffect(() => {
  if (isServer) return;
  try {
    localStorage.setItem(
      STREAMING_PROVIDERS_KEY,
      JSON.stringify(streamingProviders())
    );
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

/**
 * Remove a provider from the selected list by technicalName.
 * Convenience wrapper around setStreamingProviders for the Settings UI.
 */
export function removeStreamingProvider(id: string): void {
  setStreamingProviders((prev) => prev.filter((x) => x !== id));
}

/**
 * Add a provider to the end of the selected list by technicalName.
 * Convenience wrapper — deduplicates to avoid double-adds.
 */
export function addStreamingProvider(id: string): void {
  setStreamingProviders((prev) =>
    prev.includes(id) ? prev : [...prev, id]
  );
}

/**
 * Move a provider from one position to another in the selected list.
 * Used by the Settings UI's up/down reorder buttons. If `from` or `to`
 * is out of bounds, or the provider at `from` doesn't match `id`, the
 * call is a no-op (defensive against stale UI state).
 */
export function moveStreamingProvider(
  id: string,
  from: number,
  to: number
): void {
  setStreamingProviders((prev) => {
    if (from < 0 || from >= prev.length) return prev;
    if (to < 0 || to >= prev.length) return prev;
    if (prev[from] !== id) return prev;
    const next = prev.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

// ─── JustWatch provider list item type ──────────────────────────────
//
// This is the shape consumed by the Settings UI's "Streaming Providers"
// subsection. It mirrors the JustWatchPackage type from
// `src/shared/types/justwatch.ts` but is duplicated here (rather than
// imported) so the preferences module — which is imported by many
// client components — does NOT take a dependency on the shared
// justwatch types file (which lives under src/shared/types and is
// fine to import, but keeping the preference module self-contained
// makes it easier to tree-shake and reason about).
//
// The /api/ott/providers route returns JustWatchPackage[] directly;
// the Settings hook maps each JustWatchPackage to this type. The shape
// is identical, so the mapping is a no-op cast at runtime.

/**
 * A JustWatch provider list item — the shape returned by
 * `/api/ott/providers` and consumed by the Settings UI.
 *
 *   id            — JustWatch Package ID (opaque base64-ish string)
 *   clearName     — display name (e.g. "Netflix", "Amazon Prime Video")
 *   shortName     — short code (e.g. "NF", "APV") — may be empty
 *   technicalName — slugged identifier (e.g. "netflix",
 *                   "amazonprimevideo") — this is the value stored in
 *                   `streamingProviders()` and used as the cache key
 *                   for the provider catalog
 *   icon          — JustWatch CDN template path, e.g.
 *                   "/icon/4982/{profile}/{technicalName}.{format}"
 *                   The consumer substitutes {profile} (s16|s32|s64|
 *                   s100|s200) and {format} (png|webp|jpg) and
 *                   prefixes with "https://images.justwatch.com".
 */
export interface JustWatchProviderItem {
  id: string;
  clearName: string;
  shortName: string;
  technicalName: string;
  icon: string;
}

// ─── LEGACY TMDB COMPATIBILITY EXPORTS (DO NOT REMOVE) ─────────────
//
// The exports below remain ONLY because `OttDropdown.tsx`,
// `src/routes/settings/content-discover.tsx`, and the existing test
// suite still depend on them. They will be removed in the chunk that
// migrates the Discover OTT dropdown to JustWatch.

/**
 * A single TMDB watch provider — the shape returned by
 * /watch/providers/{movie,tv}?watch_region={region}.
 *
 * @deprecated Stage 5 migration: the Settings UI no longer uses this
 *             type. It remains only for `OttDropdown.tsx` and the
 *             legacy `src/routes/settings/content-discover.tsx` route.
 *             Will be removed when Discover OTT is migrated.
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
 *
 * @deprecated See TmdbProvider above.
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
 * @deprecated Stage 5 migration: the Settings UI no longer calls this.
 *             It remains only for `OttDropdown.tsx` and the legacy
 *             `src/routes/settings/content-discover.tsx` route. Will be
 *             removed when Discover OTT is migrated.
 *
 * @param movieRows  Rows from getWatchProviderList(region)
 * @param tvRows     Rows from getWatchProviderListTv(region)
 * @returns Merged, deduplicated, sorted TmdbProvider[]
 */
export function mergeAndSortProviders(
  movieRows: TmdbProviderRow[],
  tvRows: TmdbProviderRow[]
): TmdbProvider[] {
  const seen = new Set<string>();
  const merged: TmdbProvider[] = [];
  for (const row of movieRows) {
    const id = String(row.providerId);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({
      id,
      name: row.providerName,
      logoPath: row.logoPath,
      displayPriority: row.displayPriority
    });
  }
  for (const row of tvRows) {
    const id = String(row.providerId);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({
      id,
      name: row.providerName,
      logoPath: row.logoPath,
      displayPriority: row.displayPriority
    });
  }
  merged.sort((a, b) => a.displayPriority - b.displayPriority);
  return merged;
}
