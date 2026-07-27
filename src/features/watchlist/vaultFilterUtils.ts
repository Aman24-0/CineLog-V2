// src/features/watchlist/vaultFilterUtils.ts
import { resolveTimelineDate } from "~/shared/utils/date";
import { toMs } from "~/shared/utils/vaultStatus";
import type { VaultFilters, WatchlistItem } from "~/shared/types";

/**
 * vaultFilterUtils — pure filtering + sorting helpers used by
 * useVaultFiltering. Extracted to keep the hook under the 250-line limit.
 *
 * All functions are pure (no signals, no side effects) so they can be
 * unit-tested in isolation if needed.
 */

const toAddedAtMs = (v: WatchlistItem["addedAt"]) => toMs(v);

// ── SEARCH INDEX — precomputed searchable text per item ─────────────
// Previously, matchSearch() allocated 6 arrays/strings PER ITEM PER
// SEARCH: genres array, castList spread, platformsList spread, fields
// array, joined string, lowercased string. For a 1029-item vault with
// a search query, that's 6,174 allocations per keystroke (after debounce)
// — massive GC pressure.
//
// Now we precompute a single lowercased search string per item and cache
// it in a WeakMap. The first search on each item computes the string;
// subsequent searches (including different queries) reuse the cached
// string. The WeakMap lets GC reclaim entries when WatchlistItems are
// removed from the vault.
const searchIndex = new WeakMap<WatchlistItem, string>();

/** Build (or retrieve from cache) the lowercased searchable text for an item. */
function getSearchText(m: WatchlistItem): string {
  const cached = searchIndex.get(m);
  if (cached !== undefined) return cached;

  const year = (m.release_date || m.first_air_date || "").substring(0, 4);
  // Build genres string without intermediate array
  let genresStr = "";
  if (m.genresList) {
    for (const g of m.genresList) {
      if (typeof g === "string") genresStr += " " + g;
      else if (g && typeof g === "object" && "name" in g) genresStr += " " + String((g as { name: unknown }).name);
    }
  }
  // Build cast string without intermediate array
  let castStr = "";
  if (m.castList) {
    for (const c of m.castList) castStr += " " + c;
  }
  // Build platforms string without intermediate array
  let platformsStr = "";
  if (m.platformsList) {
    for (const p of m.platformsList) platformsStr += " " + p;
  }

  const text = (
    (m.title || "") + " " +
    (m.original_title || "") + " " +
    (m.name || "") + " " +
    (m.original_name || "") + " " +
    (m.tag || "") + " " +
    (m.notes || "") + " " +
    (m.director || "") + " " +
    year + " " +
    castStr + " " +
    genresStr + " " +
    platformsStr
  ).toLowerCase();

  searchIndex.set(m, text);
  return text;
}

/** Match a title against a free-text search query (case-insensitive).
 *  Uses a precomputed + cached search string to eliminate per-search
 *  allocations. First search on each item builds the index; subsequent
 *  searches are O(1) string.includes() with zero allocations. */
export function matchSearch(m: WatchlistItem, query: string): boolean {
  const s = query.toLowerCase().trim();
  if (!s) return true;
  return getSearchText(m).includes(s);
}

/** Apply the quick-filter status tab + advanced status filter. */
export function filterByStatus(
  items: WatchlistItem[],
  effectiveStatus: string,
): WatchlistItem[] {
  if (effectiveStatus === "all") return items;
  return items.filter(
    (m) =>
      m.status === effectiveStatus ||
      (effectiveStatus === "Planned" && m.status === "Plan to Watch"),
  );
}

/** Apply the advanced filters (type, region, genre, platform, tag). */
export function filterByAdvanced(
  items: WatchlistItem[],
  f: VaultFilters,
): WatchlistItem[] {
  let out = items;
  if (f.type !== "all") out = out.filter((m) => m.media_type === f.type);
  if (f.region !== "all") out = out.filter((m) => matchesRegion(m, f.region));
  if (f.genre !== "all") out = out.filter((m) => {
    if (!m.genresList || !Array.isArray(m.genresList)) return false;
    return m.genresList.some((g) => {
      const name = typeof g === "string" ? g
        : typeof g === "object" && g !== null && "name" in g ? String((g as { name: unknown }).name)
        : String(g);
      return name === f.genre;
    });
  });
  if (f.platform !== "all") out = out.filter((m) => matchesPlatform(m, f.platform));
  if (f.tag !== "all") out = out.filter((m) => m.tag === f.tag);
  return out;
}

/**
 * Region filter — robustly detects "Indian" vs "International" titles.
 *
 * Checks (in priority order) for the "Indian" region:
 *   1. Explicit `m.region === "Indian"` (legacy field, still used)
 *   2. `m.origin_country` array includes "IN" (TMDB)
 *   3. `m.spoken_languages` array includes any Indian language code
 *      (hi, ta, te, kn, ml, bn, mr, gu, pa, ur, or, as)
 *
 * "International" matches anything that is NOT Indian (including items
 * with no region data at all — backwards compatible with the previous
 * "defaults missing region to International" behavior).
 *
 * All array accesses use optional chaining + Array.isArray() guards so
 * the filter is safe when the arrays are missing (older vault items).
 */
const INDIAN_LANGUAGE_CODES = new Set([
  "hi", "ta", "te", "kn", "ml", "bn", "mr", "gu", "pa", "ur", "or", "as",
]);

function matchesRegion(m: WatchlistItem, region: string): boolean {
  if (region === "Indian") {
    // 1. Explicit region field
    if (m.region === "Indian") return true;
    // 2. TMDB origin_country includes IN
    if (Array.isArray(m.origin_country) && m.origin_country.includes("IN")) return true;
    // 3. Spoken languages include an Indian language code
    if (Array.isArray(m.spoken_languages)) {
      for (const lang of m.spoken_languages) {
        if (!lang || typeof lang !== "object") continue;
        const code = typeof lang.iso_639_1 === "string" ? lang.iso_639_1.toLowerCase() : "";
        if (code && INDIAN_LANGUAGE_CODES.has(code)) return true;
      }
    }
    return false;
  }
  if (region === "International") {
    // NOT Indian — includes items with no region data (backwards compat).
    if (m.region === "Indian") return false;
    if (Array.isArray(m.origin_country) && m.origin_country.includes("IN")) return false;
    return true;
  }
  // Unknown region value — pass through (don't filter)
  return true;
}

/**
 * Platform filter — matches if the platform string is found in ANY of
 * the platform-carrying fields on the item:
 *   - `platformsList` (legacy array)
 *   - `providers` (TMDB watch-provider field)
 *   - `watchProgress.server` (single-string fallback)
 *
 * This mirrors the `uniquePlatforms` extraction in useVaultFiltering.ts
 * so the dropdown options and the filter predicate stay in sync.
 */
function matchesPlatform(m: WatchlistItem, platform: string): boolean {
  if (Array.isArray(m.platformsList) && m.platformsList.includes(platform)) return true;
  if (Array.isArray(m.providers) && m.providers.includes(platform)) return true;
  const server = m.watchProgress?.server;
  if (typeof server === "string" && server === platform) return true;
  return false;
}

/** Apply the numeric range filters (IMDb / RT / year / runtime). */
export function filterByRanges(
  items: WatchlistItem[],
  f: VaultFilters,
): WatchlistItem[] {
  const inRange = (value: string | number | undefined, min: string, max: string) => {
    const n = Number(value);
    if (min !== "" && (isNaN(n) || n < Number(min))) return false;
    if (max !== "" && (isNaN(n) || n > Number(max))) return false;
    return true;
  };
  return items.filter((m) => {
    const year = parseInt((m.release_date || m.first_air_date || "").substring(0, 4)) || NaN;
    const rt = Number((m.rtRating || "").replace("%", "")) || NaN;
    return (
      inRange(m.imdbRating, f.imdbMin, f.imdbMax) &&
      inRange(rt, f.rtMin, f.rtMax) &&
      inRange(year, f.yearMin, f.yearMax) &&
      inRange(m.runtime, f.runtimeMin, f.runtimeMax)
    );
  });
}

/** Sort items according to the active sort key. */
export function sortItems(items: WatchlistItem[], sort: VaultFilters["sort"]): WatchlistItem[] {
  return [...items].sort((a, b) => {
    if (sort === "watch_desc" || sort === "watch_asc") {
      const dA = resolveTimelineDate(a), dB = resolveTimelineDate(b);
      const hasA = dA !== null, hasB = dB !== null;
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      if (!hasA && !hasB) return 0;
      return sort === "watch_desc"
        ? dB!.getTime() - dA!.getTime()
        : dA!.getTime() - dB!.getTime();
    }
    if (sort === "year_desc")
      return (
        (parseInt((b.release_date || b.first_air_date || "").substring(0, 4)) || 0) -
        (parseInt((a.release_date || a.first_air_date || "").substring(0, 4)) || 0)
      );
    if (sort === "rating_desc") return (b.rating || 0) - (a.rating || 0);
    if (sort === "imdb_desc")
      return (parseFloat(b.imdbRating || "0") || 0) - (parseFloat(a.imdbRating || "0") || 0);
    if (sort === "imdb_asc")
      return (parseFloat(a.imdbRating || "0") || 0) - (parseFloat(b.imdbRating || "0") || 0);
    if (sort === "runtime_asc") return (a.runtime || 0) - (b.runtime || 0);
    if (sort === "updated") return toAddedAtMs(b.updatedAt) - toAddedAtMs(a.updatedAt);
    if (sort === "title_asc")
      return (a.title || a.name || "").localeCompare(b.title || b.name || "");
    return toAddedAtMs(b.addedAt) - toAddedAtMs(a.addedAt);
  });
}

/** Compute the active filter chips for display in the header. */
export function computeChips(f: VaultFilters): { label: string; key: string }[] {
  const out: { label: string; key: string }[] = [];
  if (f.type !== "all") out.push({ label: f.type === "movie" ? "Movies" : "Series", key: "type" });
  if (f.region !== "all") out.push({ label: f.region, key: "region" });
  if (f.genre !== "all") out.push({ label: f.genre, key: "genre" });
  if (f.platform !== "all") out.push({ label: f.platform, key: "platform" });
  if (f.tag !== "all") out.push({ label: f.tag, key: "tag" });
  if (f.imdbMin) out.push({ label: `IMDb > ${f.imdbMin}`, key: "imdbMin" });
  if (f.imdbMax) out.push({ label: `IMDb < ${f.imdbMax}`, key: "imdbMax" });
  if (f.rtMin) out.push({ label: `RT > ${f.rtMin}`, key: "rtMin" });
  if (f.rtMax) out.push({ label: `RT < ${f.rtMax}`, key: "rtMax" });
  if (f.yearMin) out.push({ label: `Year > ${f.yearMin}`, key: "yearMin" });
  if (f.yearMax) out.push({ label: `Year < ${f.yearMax}`, key: "yearMax" });
  if (f.runtimeMin) out.push({ label: `RT > ${f.runtimeMin}m`, key: "runtimeMin" });
  if (f.runtimeMax) out.push({ label: `RT < ${f.runtimeMax}m`, key: "runtimeMax" });
  return out;
}

/** Count how many advanced filters are active (for the badge on the filter button). */
export function countActiveFilters(f: VaultFilters): number {
  let count = 0;
  if (f.type !== "all") count++;
  if (f.region !== "all") count++;
  if (f.genre !== "all") count++;
  if (f.platform !== "all") count++;
  if (f.tag !== "all") count++;
  if (f.sort !== "recent") count++;
  if (f.imdbMin || f.imdbMax) count++;
  if (f.rtMin || f.rtMax) count++;
  if (f.yearMin || f.yearMax) count++;
  if (f.runtimeMin || f.runtimeMax) count++;
  return count;
}

/** True when any advanced filter is set (ignoring status, which is owned by the quick tab). */
export function hasAdvancedFiltersActive(f: VaultFilters): boolean {
  return (
    f.type !== "all" || f.region !== "all" || f.genre !== "all" ||
    f.platform !== "all" || f.tag !== "all" || f.sort !== "recent" ||
    f.imdbMin !== "" || f.imdbMax !== "" || f.rtMin !== "" || f.rtMax !== "" ||
    f.yearMin !== "" || f.yearMax !== "" || f.runtimeMin !== "" || f.runtimeMax !== ""
  );
}
