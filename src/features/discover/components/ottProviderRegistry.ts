// src/features/discover/components/ottProviderRegistry.ts
//
// ottProviderRegistry — canonical provider ID map + alias merging.
//
// WHY THIS EXISTS:
//
// 1. TMDB returns MULTIPLE provider entries that refer to the same
//    real-world service. For India's /watch/providers list, "Amazon
//    Prime Video", "Amazon Video", "Prime Video", and sometimes
//    "Amazon" all appear as SEPARATE rows with DIFFERENT provider IDs.
//    Without alias merging, the "More Providers" sheet showed 4 nearly-
//    identical Amazon chips. The same happens for Apple TV (Apple TV+,
//    Apple TV, Apple iTunes), and others.
//
//    Solution: every TMDB provider ID is mapped to a CANONICAL provider
//    key. Multiple TMDB IDs can map to the same canonical key. When we
//    render the "More" sheet, we deduplicate by canonical key — one
//    chip per real-world service.
//
// 2. The spec requires a specific primary chip order for India:
//       Netflix → JioHotstar → Prime Video → SonyLIV → ZEE5 → Crunchyroll
//    We hardcode the canonical TMDB provider IDs for these six. The
//    IDs are stable across TMDB's API (they're the same in every
//    region's /watch/providers response for these major streamers).
//
// 3. If a primary provider is NOT in the region's TMDB provider list
//    (e.g. Crunchyroll isn't available in some regions), we HIDE that
//    chip entirely rather than showing an empty chip that produces an
//    empty carousel. The caller passes the region's available provider
//    IDs and we filter accordingly.
//
// 4. Contextual subtitles per canonical provider, used by the OTT
//    section heading.
//

/** Canonical provider keys — one per real-world streaming service. */
export type CanonicalProviderKey =
  | "netflix"
  | "jiohotstar"
  | "prime_video"
  | "sonyliv"
  | "zee5"
  | "crunchyroll"
  | "apple_tv"
  | "disney_plus"
  | "mubi"
  | "lionsgate_play"
  | "hulu"
  | "max"
  | "paramount_plus"
  | "peacock"
  | "discovery_plus"
  | "other";

/** Display name for each canonical provider. */
const CANONICAL_DISPLAY_NAME: Record<CanonicalProviderKey, string> = {
  netflix: "Netflix",
  jiohotstar: "JioHotstar",
  prime_video: "Prime Video",
  sonyliv: "SonyLIV",
  zee5: "ZEE5",
  crunchyroll: "Crunchyroll",
  apple_tv: "Apple TV+",
  disney_plus: "Disney+",
  mubi: "MUBI",
  lionsgate_play: "Lionsgate Play",
  hulu: "Hulu",
  max: "Max",
  paramount_plus: "Paramount+",
  peacock: "Peacock",
  discovery_plus: "Discovery+",
  other: "Streaming",
};

/** Contextual subtitle for each canonical provider. */
const CANONICAL_SUBTITLE: Record<CanonicalProviderKey, string> = {
  netflix: "Trending on Netflix",
  jiohotstar: "Popular in India",
  prime_video: "Recently Added",
  sonyliv: "Watch this Weekend",
  zee5: "Indian Favourites",
  crunchyroll: "Top Anime",
  apple_tv: "Critically Acclaimed",
  disney_plus: "Family Favourites",
  mubi: "Curated Cinema",
  lionsgate_play: "Blockbuster Picks",
  hulu: "Now Streaming",
  max: "Premiere Series",
  paramount_plus: "Originals & Movies",
  peacock: "Peacock Picks",
  discovery_plus: "Reality & Docs",
  other: "Streaming now",
};

/**
 * Map of TMDB provider IDs → canonical key.
 *
 * Multiple TMDB IDs can map to the same canonical key (alias merging).
 * IDs not in this map default to "other".
 *
 * IDs verified against TMDB /watch/providers/movie?watch_region=IN and
 * /watch/providers/tv?watch_region=IN responses.
 */
const TMDB_ID_TO_CANONICAL: Record<number, CanonicalProviderKey> = {
  // Netflix — single canonical ID worldwide
  8: "netflix",

  // JioHotstar (formerly Hotstar / Disney+ Hotstar in India)
  554: "jiohotstar",
  // Legacy Hotstar IDs that still appear in some regions
  122: "jiohotstar",

  // Prime Video — TMDB lists multiple Amazon variants. Merge them all.
  9: "prime_video",     // "Amazon Prime Video" (canonical)
  119: "prime_video",   // "Amazon Prime Video" (alt ID in some regions)
  10: "prime_video",    // "Amazon Video" (rental arm, same service)
  35: "prime_video",    // "Amazon" (rare alias)

  // SonyLIV
  543: "sonyliv",

  // ZEE5
  567: "zee5",

  // Crunchyroll
  283: "crunchyroll",

  // Apple TV+ — multiple aliases
  350: "apple_tv",      // "Apple TV Plus"
  2: "apple_tv",        // "Apple iTunes" (Apple's video store, merged for display)

  // Disney+
  337: "disney_plus",

  // MUBI
  11: "mubi",

  // Lionsgate Play
  698: "lionsgate_play",

  // Hulu
  15: "hulu",

  // Max (HBO Max)
  1899: "max",
  384: "max",           // legacy "HBO Max" ID

  // Paramount+
  531: "paramount_plus",

  // Peacock
  386: "peacock",
  444: "peacock",

  // Discovery+
  335: "discovery_plus",
};

/**
 * The primary chip order for the OTT section. Each entry maps a
 * canonical key to its preferred TMDB provider ID (the one we use
 * for /discover queries). If a primary provider isn't available in
 * the user's region, the caller hides it.
 *
 * The first TMDB ID in each entry's `ids` array is the one we use
 * for /discover queries; any additional IDs are aliases that also
 * map to this provider (used for the "available in region" check).
 */
export interface PrimaryProviderDef {
  canonical: CanonicalProviderKey;
  /** All TMDB IDs that map to this provider (first = query ID). */
  ids: number[];
}

export const PRIMARY_PROVIDER_ORDER: PrimaryProviderDef[] = [
  { canonical: "netflix",      ids: [8] },
  { canonical: "jiohotstar",   ids: [554, 122] },
  { canonical: "prime_video",  ids: [9, 119, 10, 35] },
  { canonical: "sonyliv",      ids: [543] },
  { canonical: "zee5",         ids: [567] },
  { canonical: "crunchyroll",  ids: [283] },
];

/** Resolve a TMDB provider ID to its canonical key. */
export function canonicalForTmdbId(tmdbId: number): CanonicalProviderKey {
  return TMDB_ID_TO_CANONICAL[tmdbId] ?? "other";
}

/** Get the display name for a canonical provider. */
export function displayNameFor(canonical: CanonicalProviderKey): string {
  return CANONICAL_DISPLAY_NAME[canonical] ?? "Streaming";
}

/** Get the contextual subtitle for a canonical provider. */
export function subtitleFor(canonical: CanonicalProviderKey): string {
  return CANONICAL_SUBTITLE[canonical] ?? "Streaming now";
}

/** Raw provider row as returned by TMDB /watch/providers. */
export interface TmdbProviderRow {
  providerId: number;
  providerName: string;
  logoPath: string | null;
}

/**
 * MergedProvider — one entry per real-world service. Built by merging
 * all TMDB provider rows that share a canonical key.
 */
export interface MergedProvider {
  canonical: CanonicalProviderKey;
  /** The TMDB ID to use for /discover queries (preferred/first ID). */
  primaryTmdbId: number;
  /** All TMDB IDs that map to this provider (for region availability checks). */
  allTmdbIds: number[];
  displayName: string;
  subtitle: string;
  /** Logo path from TMDB (the first non-null logo across all merged rows). */
  logoPath: string | null;
}

/**
 * Merge a list of raw TMDB provider rows into one MergedProvider per
 * canonical key. This collapses aliases (Amazon Prime Video + Amazon
 * Video + Prime Video → one "Prime Video" entry).
 *
 * Used by the OTT section to build the "More Providers" sheet without
 * duplicates.
 */
export function mergeProviders(rows: TmdbProviderRow[]): MergedProvider[] {
  const byCanonical = new Map<CanonicalProviderKey, MergedProvider>();
  for (const row of rows) {
    const canonical = canonicalForTmdbId(row.providerId);
    if (canonical === "other") {
      // Unknown provider — keep it as a standalone entry keyed by its
      // TMDB ID so it still appears in the More sheet. We use a synthetic
      // canonical key based on the ID to avoid collision.
      const syntheticKey = `other_${row.providerId}` as CanonicalProviderKey;
      const existing = byCanonical.get(syntheticKey);
      if (!existing) {
        byCanonical.set(syntheticKey, {
          canonical: "other",
          primaryTmdbId: row.providerId,
          allTmdbIds: [row.providerId],
          displayName: row.providerName,
          subtitle: subtitleFor("other"),
          logoPath: row.logoPath,
        });
      }
      continue;
    }
    const existing = byCanonical.get(canonical);
    if (!existing) {
      byCanonical.set(canonical, {
        canonical,
        primaryTmdbId: row.providerId,
        allTmdbIds: [row.providerId],
        displayName: displayNameFor(canonical),
        subtitle: subtitleFor(canonical),
        logoPath: row.logoPath,
      });
    } else {
      // Merge — keep the first non-null logo, append the ID.
      if (!existing.logoPath && row.logoPath) {
        existing.logoPath = row.logoPath;
      }
      if (!existing.allTmdbIds.includes(row.providerId)) {
        existing.allTmdbIds.push(row.providerId);
      }
    }
  }
  return Array.from(byCanonical.values());
}

/**
 * Build the primary chip list, HIDE any provider that isn't available
 * in the user's region.
 *
 * A primary provider is "available" if ANY of its TMDB IDs appear in
 * the region's provider list.
 */
export function buildPrimaryProviders(
  availableTmdbIds: Set<number>,
): MergedProvider[] {
  return PRIMARY_PROVIDER_ORDER
    .filter((def) => def.ids.some((id) => availableTmdbIds.has(id)))
    .map((def) => {
      // Use the FIRST available ID as the query ID (prefers the canonical
      // order in def.ids, but falls back to any available alias).
      const queryId = def.ids.find((id) => availableTmdbIds.has(id)) ?? def.ids[0];
      return {
        canonical: def.canonical,
        primaryTmdbId: queryId,
        allTmdbIds: def.ids,
        displayName: displayNameFor(def.canonical),
        subtitle: subtitleFor(def.canonical),
        logoPath: null, // resolved by caller from the TMDB list
      };
    });
}

/**
 * Build the "More" sheet list — every MERGED provider in the region
 * EXCEPT the primary ones. Sorted alphabetically by display name.
 *
 * "other" providers (unknown TMDB IDs) always go in the More sheet
 * since they're never in PRIMARY_PROVIDER_ORDER.
 */
export function buildMoreProviders(
  merged: MergedProvider[],
  primaryCanonicals: Set<CanonicalProviderKey>,
): MergedProvider[] {
  return merged
    .filter((p) => !primaryCanonicals.has(p.canonical))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
