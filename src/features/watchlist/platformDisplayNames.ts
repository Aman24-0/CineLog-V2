// src/features/watchlist/platformDisplayNames.ts
//
// Platform display-name resolution for the Watchlist Platform filter.
//
// WHY THIS EXISTS:
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
  displayNameFor,
} from "~/features/discover/components/ottProviderRegistry";

/**
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
  "Discovery+",
] as const;
