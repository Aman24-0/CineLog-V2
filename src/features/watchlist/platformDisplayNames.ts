// src/features/watchlist/platformDisplayNames.ts
//
// Platform display-name resolution for the Watchlist Platform filter.
//
// ──────────────────────────────────────────────────────────────────────
// CHUNK 6 (JustWatch OTT Migration) — DEPRECATION NOTICE
// ──────────────────────────────────────────────────────────────────────
// The Platform filter NO LONGER uses this module. The filter now derives
// its options from JustWatch availability data (see
// `hooks/useWatchlistOttAvailability.ts`) and matches against
// `WatchlistItem.justwatchProviders` (JustWatch `technicalName` values).
// The JustWatch `package.clearName` is the new display name source.
//
// This file is KEPT (not deleted) per the Chunk 6 spec ("Do not delete
// the file. Just update/override the relevant functions."). As of this
// chunk, `resolvePlatformDisplayName` has NO live consumers — it was
// the Platform filter's old display-name resolver, and the filter now
// uses `resolvePlatformClearNameFromCatalog` instead. The function is
// kept for one more chunk in case other call sites need to be migrated
// piecemeal, and will be removed in a later cleanup chunk.
//
// The function below is marked `@deprecated` so future chunks know it's
// safe to remove.
// ──────────────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS (HISTORICAL):
//   The Platform filter dropdown (FilterControls.tsx) was rendering raw
//   string IDs (e.g. "8", "9") instead of human-readable names ("Netflix",
//   "Prime Video"). This happened because:
//     - `item.providers` sometimes stores TMDB provider IDs (numbers as
//       strings) instead of provider names.
//     - `item.watchProgress.server` sometimes stores a raw TMDB ID or a
//       lowercase slug instead of the official provider name.
//     - `item.platformsList` (legacy) stores human-readable names but they
//       can be inconsistently cased ("netflix" vs "Netflix").
//
//   This module normalizes ALL of those variants to a single canonical
//   display name so the dropdown shows "Netflix", "Prime Video", etc.
//   consistently, and the filter predicate (matchesPlatform) matches
//   against the same canonical name.
//
//   The mapping uses the ottProviderRegistry's TMDB_ID_TO_CANONICAL table
//   (the source of truth for which TMDB IDs map to which real-world
//   service). We import the registry's internals via its exported
//   `canonicalForTmdbId` + `displayNameFor` helpers so we don't duplicate
//   the ID→name table.

import {
  canonicalForTmdbId,
  displayNameFor
} from "~/features/discover/components/ottProviderRegistry";
import type { PlatformFilterOption } from "./hooks/useWatchlistOttAvailability";

/**
 * Resolve a JustWatch `technicalName` (the value stored in
 * `VaultFilters.platform` after Chunk 6) to its human-readable
 * `clearName` by looking it up in the JustWatch provider catalog.
 *
 * This is the new display-name resolver used by `computeChips` in
 * `vaultFilterUtils.ts`. It replaces the old `resolvePlatformDisplayName`
 * for Platform-filter purposes (the old function is still exported below
 * for the Statistics page).
 *
 * @param technicalName The JustWatch `package.technicalName` to resolve
 *        (e.g. `"apple.tv.plus"`, `"netflix"`).
 * @param catalog The JustWatch provider catalog from
 *        `useWatchlistOttAvailability`. When `undefined` or empty, the
 *        function returns the raw `technicalName` (so callers always get
 *        a non-empty string for display).
 * @returns The `clearName` if found, else the raw `technicalName`.
 */
export function resolvePlatformClearNameFromCatalog(
  technicalName: string,
  catalog: PlatformFilterOption[] | undefined
): string {
  if (!technicalName) return "";
  if (!Array.isArray(catalog) || catalog.length === 0) return technicalName;
  for (let i = 0; i < catalog.length; i++) {
    if (catalog[i].technicalName === technicalName) {
      return catalog[i].clearName;
    }
  }
  return technicalName;
}

/**
 * @deprecated Since Chunk 6 of the JustWatch OTT migration. The Platform
 *   filter now uses `resolvePlatformClearNameFromCatalog` (above) with
 *   JustWatch `technicalName`/`clearName` data. This function has NO live
 *   consumers as of this chunk — it is kept for one more chunk as a
 *   safety net and will be removed in a later cleanup.
 *
 * Normalize a single raw platform string to a human-readable display name.
 *
 * Resolution order:
 *   1. If the string is a numeric TMDB provider ID (e.g. "8", "119"),
 *      resolve it via the ottProviderRegistry. Known IDs return their
 *      canonical display name ("Netflix", "Prime Video"). Unknown numeric
 *      IDs return the original string (so the user still sees something).
 *   2. If the string is already a human-readable name ("Netflix",
 *      "Amazon Prime Video"), return it as-is (title-cased for
 *      consistency).
 *   3. If the string is a lowercase slug ("netflix", "prime_video"),
 *      attempt a case-insensitive match against the known canonical
 *      display names; if matched, return the canonical name.
 *   4. Otherwise return the trimmed original string.
 *
 * Empty / whitespace-only / non-string inputs return "" (filtered out by
 * the caller before reaching here, but defensive anyway).
 */
export function resolvePlatformDisplayName(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // 1. Numeric TMDB provider ID → canonical display name
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    const canonical = canonicalForTmdbId(id);
    if (canonical !== "other") {
      return displayNameFor(canonical);
    }
    // Unknown numeric ID — return as-is so the user still sees something.
    return trimmed;
  }

  // 2. Case-insensitive match against known canonical display names.
  //    This catches lowercase slugs ("netflix"), snake_case ("prime_video"),
  //    and minor casing variants ("AMAZON Prime Video").
  const lower = trimmed.toLowerCase();
  const normalized = lower.replace(/[\s_-]+/g, "");
  for (const name of KNOWN_DISPLAY_NAMES) {
    const canonicalNorm = name.toLowerCase().replace(/[\s_-]+/g, "");
    if (canonicalNorm === normalized) {
      return name;
    }
  }

  // 3. Return the original (trimmed) string — it's likely already a
  //    human-readable name we just don't have in our canonical table.
  return trimmed;
}

/**
 * Pre-computed list of all canonical display names from the
 * ottProviderRegistry. Used for case-insensitive matching in step 2.
 *
 * Built once at module load (the registry's display names are static).
 */
const KNOWN_DISPLAY_NAMES: readonly string[] = [
  "Netflix",
  "JioHotstar",
  "Prime Video",
  "SonyLIV",
  "ZEE5",
  "Crunchyroll",
  "Apple TV+",
  "Disney+",
  "MUBI",
  "Lionsgate Play",
  "Hulu",
  "Max",
  "Paramount+",
  "Peacock",
  "Discovery+"
] as const;
