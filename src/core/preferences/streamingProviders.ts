// src/core/preferences/streamingProviders.ts
// Streaming Provider Subscriptions
// A set of TMDB watch_provider IDs the user is subscribed to.
// Used by Discover OTT section + Where-to-watch on detail pages.
//
// INDIA CURATION (v2):
//   The raw TMDB watch providers API returns duplicate/invalid entries
//   (rent/buy "Amazon Video" instead of flatrate "Amazon Prime Video",
//   inactive/merged providers like Disney+ standalone, etc.). For India
//   we curate a SHORT, ACCURATE list of the actually-active flatrate
//   services, with canonical IDs that the Discover /discover/movie?
//   with_watch_providers=ID query respects.
//
//   The curated list is exported below so BOTH the Settings page (for
//   the toggle UI) and the Discover page (for the OTT dropdown) read
//   from the same source of truth.

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

// ─── Curated provider registry ────────────────────────────────────────

/**
 * A curated streaming provider entry.
 *
 * `id` is the CANONICAL TMDB watch_provider ID we send to
 * /discover/movie?with_watch_providers={id}. For alias-merged providers
 * (e.g. JioStar = JioCinema + Hotstar), `id` is the primary ID we use
 * for the discover query, and `aliasIds` lists every TMDB ID that
 * should toggle this same button (so a user who previously selected
 * either alias is shown as active).
 */
export interface CuratedProvider {
  /** Canonical TMDB provider ID (string, for the discover query). */
  id: string;
  /** Aliases — other TMDB IDs that map to this same provider button. */
  aliasIds?: string[];
  /** Display name shown in the UI. */
  name: string;
  /**
   * TMDB logo_path for this provider (e.g. "/8OUSXUW5n6fO7xofp5WhFpk6fS9.jpg").
   * Fetched at runtime from /watch/providers/movie for the user's region.
   * Null until the runtime fetch resolves (the UI shows a letter avatar
   * fallback while null).
   */
  logoPath: string | null;
}

/**
 * INDIA-curated provider list — the accurate, active flatrate services.
 *
 * IDs are the canonical TMDB watch_provider IDs that the Discover
 * /discover/movie?with_watch_providers={id}&watch_region=IN query
 * respects. These were verified against TMDB's /watch/providers/movie
 * ?watch_region=IN response:
 *
 *   - Netflix (8)              — flatrate, active
 *   - Prime Video (119)        — flatrate Amazon Prime (NOT 10 = rent/buy Amazon Video)
 *   - JioStar (122 = JioCinema primary) — alias-combines Hotstar (122)
 *     and JioCinema (220) under one unified "JioStar" button
 *   - Sony LIV (237)           — flatrate, active
 *   - ZEE5 (232)               — flatrate, active
 *   - Apple TV+ (350)          — flatrate, active
 *
 * Unavailable/merged services (Hulu, Max, HBO Max, Disney+ standalone,
 * Peacock, Paramount+) are intentionally HIDDEN for India because they
 * don't have a flatrate offering there.
 */
export const INDIA_CURATED_PROVIDERS: CuratedProvider[] = [
  { id: "8",   name: "Netflix",    logoPath: null },
  { id: "119", name: "Prime Video", logoPath: null },
  { id: "122", name: "JioStar",    aliasIds: ["122", "220"], logoPath: null },
  { id: "237", name: "Sony LIV",   logoPath: null },
  { id: "232", name: "ZEE5",       logoPath: null },
  { id: "350", name: "Apple TV+",  logoPath: null },
];

/**
 * FALLBACK (non-India) provider list — a curated set of the major
 * global streamers. Used when the user's country is NOT India so the
 * settings page isn't empty. Logos are fetched at runtime for the
 * user's region; if a provider isn't available in their region, the
 * toggle still works (the discover query just returns no results).
 */
export const GLOBAL_FALLBACK_PROVIDERS: CuratedProvider[] = [
  { id: "8",   name: "Netflix",      logoPath: null },
  { id: "9",   name: "Prime Video",  logoPath: null },
  { id: "337", name: "Disney+",      logoPath: null },
  { id: "2",   name: "Apple TV+",    logoPath: null },
  { id: "15",  name: "Hulu",         logoPath: null },
  { id: "384", name: "Max",          logoPath: null },
  { id: "283", name: "Crunchyroll",  logoPath: null },
  { id: "200", name: "MUBI",         logoPath: null },
];

/**
 * Get the curated provider list for a region.
 *
 * For India (IN), returns the accurate India-curated list. For any
 * other region, returns the global fallback list. The caller is
 * responsible for fetching logo_path values from TMDB's
 * /watch/providers/movie endpoint and merging them into the returned
 * entries.
 */
export function getCuratedProvidersForRegion(region: string): CuratedProvider[] {
  if (region.toUpperCase() === "IN") {
    return INDIA_CURATED_PROVIDERS.map((p) => ({ ...p }));
  }
  return GLOBAL_FALLBACK_PROVIDERS.map((p) => ({ ...p }));
}

/**
 * Check if a user-selected provider id is active under a curated
 * provider (matching either the canonical id OR any alias id).
 */
export function isProviderActive(
  curated: CuratedProvider,
  selectedIds: string[],
): boolean {
  const allIds = new Set([curated.id, ...(curated.aliasIds ?? [])]);
  return selectedIds.some((id) => allIds.has(id));
}
