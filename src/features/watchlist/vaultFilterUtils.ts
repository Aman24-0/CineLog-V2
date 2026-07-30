// src/features/watchlist/vaultFilterUtils.ts
import { resolveTimelineDate } from "~/shared/utils/date";
import { toMs } from "~/shared/utils/vaultStatus";
import type {
  VaultFilters,
  WatchlistItem,
  SortField,
  SortDirection
} from "~/shared/types";
import { resolvePlatformDisplayName } from "./platformDisplayNames";

/**
 * vaultFilterUtils — pure filtering + sorting helpers used by
 * useVaultFiltering. Extracted to keep the hook under the 250-line limit.
 *
 * All functions are pure (no signals, no side effects) so they can be
 * unit-tested in isolation if needed.
 */

/**
 * normalizeVaultFilters — backwards-compatibility shim for presets saved
 * before v2.6.
 *
 * The pre-v2.6 `VaultFilters` shape had a single `sort: string` field
 * with values like `"recent"`, `"imdb_desc"`, `"watch_asc"`. Saved
 * presets in Supabase still carry that legacy shape. The v2.6 shape
 * splits sort into `sortField: SortField` + `sortDirection: SortDirection`.
 *
 * This helper:
 *   1. Accepts a partial/legacy filters object (typed `unknown` for safety
 *      since it crosses the Supabase JSONB boundary).
 *   2. If `sortField` / `sortDirection` are already present (v2.6+ preset),
 *      keeps them as-is (validated against the allowed unions).
 *   3. If only the legacy `sort` string is present, derives the new pair
 *      using the mapping below.
 *   4. Fills in any other missing fields with defaults from `defaultFilters`.
 *
 * Legacy → new mapping:
 *   "recent"      → added_date, desc
 *   "updated"     → added_date, desc   (no separate "updated" field in v2.6;
 *                                        added_date is the closest proxy)
 *   "watch_desc"  → watch_date, desc
 *   "watch_asc"   → watch_date, asc
 *   "year_desc"   → release_date, desc
 *   "rating_desc" → user_rating, desc
 *   "imdb_desc"   → imdb, desc
 *   "imdb_asc"    → imdb, asc
 *   "runtime_asc" → runtime, asc
 *   "title_asc"   → title, asc
 *   (anything else / missing) → added_date, desc
 */
const LEGACY_SORT_MAP: Record<
  string,
  { field: SortField; direction: SortDirection }
> = {
  recent: { field: "added_date", direction: "desc" },
  updated: { field: "added_date", direction: "desc" },
  watch_desc: { field: "watch_date", direction: "desc" },
  watch_asc: { field: "watch_date", direction: "asc" },
  year_desc: { field: "release_date", direction: "desc" },
  rating_desc: { field: "user_rating", direction: "desc" },
  imdb_desc: { field: "imdb", direction: "desc" },
  imdb_asc: { field: "imdb", direction: "asc" },
  runtime_asc: { field: "runtime", direction: "asc" },
  title_asc: { field: "title", direction: "asc" }
};

const VALID_SORT_FIELDS: ReadonlySet<SortField> = new Set<SortField>([
  "title",
  "release_date",
  "user_rating",
  "imdb",
  "rt",
  "mt",
  "runtime",
  "added_date",
  "watch_date"
]);

export function normalizeVaultFilters(input: unknown): VaultFilters {
  // Default base — same as defaultFilters in useVaultFiltering.ts.
  // Inlined here to avoid a circular import (useVaultFiltering imports
  // from vaultFilterUtils, not the other way around).
  const out: VaultFilters = {
    type: "all",
    status: "all",
    region: "all",
    genre: "all",
    platform: "all",
    sortField: "added_date",
    sortDirection: "desc",
    tag: "all",
    imdbMin: "",
    imdbMax: "",
    rtMin: "",
    rtMax: "",
    yearMin: "",
    yearMax: "",
    runtimeMin: "",
    runtimeMax: ""
  };
  if (!input || typeof input !== "object") return out;
  const f = input as Record<string, unknown>;
  // Cast through `unknown` to assign dynamic keys — VaultFilters has no
  // index signature, so a direct cast to Record<string, unknown> would
  // fail TS2352. We've already validated `out` is the correct shape, so
  // any key we assign here is a known field on VaultFilters.
  const outMut = out as unknown as Record<string, unknown>;

  // String fields — copy if present and string-typed, else leave default.
  for (const k of ["type", "status", "region", "genre", "platform", "tag"]) {
    if (typeof f[k] === "string") outMut[k] = f[k];
  }
  // Range fields — copy if present and string-typed.
  for (const k of [
    "imdbMin",
    "imdbMax",
    "rtMin",
    "rtMax",
    "yearMin",
    "yearMax",
    "runtimeMin",
    "runtimeMax"
  ]) {
    if (typeof f[k] === "string") outMut[k] = f[k];
  }

  // Sort — prefer new shape, fall back to legacy `sort` string.
  const sf = f.sortField;
  const sd = f.sortDirection;
  if (typeof sf === "string" && VALID_SORT_FIELDS.has(sf as SortField)) {
    out.sortField = sf as SortField;
  }
  if (sd === "asc" || sd === "desc") {
    out.sortDirection = sd;
  }
  // If either is still default AND a legacy `sort` string is present,
  // use the legacy mapping to derive both. This handles presets saved
  // pre-v2.6 (which only have `sort`, not `sortField`/`sortDirection`).
  if (
    (typeof sf !== "string" || !VALID_SORT_FIELDS.has(sf as SortField)) &&
    sd !== "asc" &&
    sd !== "desc" &&
    typeof f.sort === "string"
  ) {
    const legacy = LEGACY_SORT_MAP[f.sort];
    if (legacy) {
      out.sortField = legacy.field;
      out.sortDirection = legacy.direction;
    }
  }
  return out;
}

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
//
// v3 — CREDITS SUPPORT: the search index now ALSO includes names from
// `credits.cast` (all actor names) and `credits.crew` (director names,
// filtered to job === "Director"). This makes searches like "Tom Holland"
// or "Christopher Nolan" match even when the flattened `castList` /
// `director` fields aren't populated (e.g. for items whose TMDB metadata
// carries the full credits payload). For items that only have the
// space-efficient `castList` + `director` summary (the common case from
// userLibraryAdapter), those fields are already included below.
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
      else if (g && typeof g === "object" && "name" in g)
        genresStr += " " + String((g as { name: unknown }).name);
    }
  }
  // Build cast string without intermediate array.
  // `castList` is the space-efficient summary (top 15 names) populated
  // by userLibraryAdapter from TMDB credits. This is the common case.
  let castStr = "";
  if (m.castList) {
    for (const c of m.castList) castStr += " " + c;
  }
  // Defensive: if the item carries the FULL credits payload (rare — only
  // items opened in the Details modal hydrate this), include ALL cast
  // names + director names from credits.crew. This catches the edge case
  // where `castList` is absent but `credits` is present.
  if (m.credits) {
    if (Array.isArray(m.credits.cast)) {
      for (const c of m.credits.cast) {
        if (c && c.name) castStr += " " + c.name;
      }
    }
    if (Array.isArray(m.credits.crew)) {
      for (const member of m.credits.crew) {
        // Only index Director crew entries — indexing ALL crew (gaffers,
        // best boys, etc.) would pollute the search index and cause
        // false-positive matches. Directors are the crew users search for.
        if (member && member.job === "Director" && member.name) {
          castStr += " " + member.name;
        }
      }
    }
  }
  // Build platforms string without intermediate array
  let platformsStr = "";
  if (m.platformsList) {
    for (const p of m.platformsList) platformsStr += " " + p;
  }

  const text = (
    (m.title || "") +
    " " +
    (m.original_title || "") +
    " " +
    (m.name || "") +
    " " +
    (m.original_name || "") +
    " " +
    (m.tag || "") +
    " " +
    (m.notes || "") +
    " " +
    (m.director || "") +
    " " +
    year +
    " " +
    castStr +
    " " +
    genresStr +
    " " +
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
  effectiveStatus: string
): WatchlistItem[] {
  if (effectiveStatus === "all") return items;
  return items.filter(
    (m) =>
      m.status === effectiveStatus ||
      (effectiveStatus === "Planned" && m.status === "Plan to Watch")
  );
}

/** Apply the advanced filters (type, region, genre, platform, tag). */
export function filterByAdvanced(
  items: WatchlistItem[],
  f: VaultFilters
): WatchlistItem[] {
  let out = items;
  if (f.type !== "all") out = out.filter((m) => m.media_type === f.type);
  if (f.region !== "all") out = out.filter((m) => matchesRegion(m, f.region));
  if (f.genre !== "all")
    out = out.filter((m) => {
      if (!m.genresList || !Array.isArray(m.genresList)) return false;
      return m.genresList.some((g) => {
        const name =
          typeof g === "string"
            ? g
            : typeof g === "object" && g !== null && "name" in g
              ? String((g as { name: unknown }).name)
              : String(g);
        return name === f.genre;
      });
    });
  if (f.platform !== "all")
    out = out.filter((m) => matchesPlatform(m, f.platform));
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
  "hi",
  "ta",
  "te",
  "kn",
  "ml",
  "bn",
  "mr",
  "gu",
  "pa",
  "ur",
  "or",
  "as"
]);

function matchesRegion(m: WatchlistItem, region: string): boolean {
  if (region === "Indian") {
    // 1. Explicit region field
    if (m.region === "Indian") return true;
    // 2. TMDB origin_country includes IN
    if (Array.isArray(m.origin_country) && m.origin_country.includes("IN"))
      return true;
    // 3. Spoken languages include an Indian language code
    if (Array.isArray(m.spoken_languages)) {
      for (const lang of m.spoken_languages) {
        if (!lang || typeof lang !== "object") continue;
        const code =
          typeof lang.iso_639_1 === "string"
            ? lang.iso_639_1.toLowerCase()
            : "";
        if (code && INDIAN_LANGUAGE_CODES.has(code)) return true;
      }
    }
    return false;
  }
  if (region === "International") {
    // NOT Indian — includes items with no region data (backwards compat).
    if (m.region === "Indian") return false;
    if (Array.isArray(m.origin_country) && m.origin_country.includes("IN"))
      return false;
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
 * DISPLAY NAME RESOLUTION (v3):
 *   Because `uniquePlatforms` (in useVaultFiltering.ts) resolves raw IDs
 *   to canonical display names ("8" → "Netflix"), the filter VALUE
 *   (`f.platform`) is always a display name. This function mirrors that
 *   resolution on each item's stored platform strings BEFORE comparing,
 *   so a stored provider ID "8" correctly matches a filter value of
 *   "Netflix". Without this, the dropdown would show "Netflix" but the
 *   filter would return zero matches.
 *
 * This mirrors the `uniquePlatforms` extraction in useVaultFiltering.ts
 * so the dropdown options and the filter predicate stay in sync.
 */
function matchesPlatform(m: WatchlistItem, platform: string): boolean {
  // Resolve the filter value once (it should already be a display name,
  // but resolve defensively in case a preset saved a raw ID).
  const targetName = resolvePlatformDisplayName(platform) || platform;

  if (Array.isArray(m.platformsList)) {
    for (const p of m.platformsList) {
      if (typeof p === "string" && p.trim()) {
        if (resolvePlatformDisplayName(p) === targetName) return true;
        // Also allow direct string equality as a fallback (covers names
        // not in our canonical table).
        if (p.trim() === platform) return true;
      }
    }
  }
  if (Array.isArray(m.providers)) {
    for (const p of m.providers) {
      if (typeof p === "string" && p.trim()) {
        if (resolvePlatformDisplayName(p) === targetName) return true;
        if (p.trim() === platform) return true;
      }
    }
  }
  const server = m.watchProgress?.server;
  if (typeof server === "string" && server.trim()) {
    if (resolvePlatformDisplayName(server) === targetName) return true;
    if (server.trim() === platform) return true;
  }
  return false;
}

/** Apply the numeric range filters (IMDb / RT / year / runtime). */
export function filterByRanges(
  items: WatchlistItem[],
  f: VaultFilters
): WatchlistItem[] {
  const inRange = (
    value: string | number | undefined,
    min: string,
    max: string
  ) => {
    const n = Number(value);
    if (min !== "" && (isNaN(n) || n < Number(min))) return false;
    if (max !== "" && (isNaN(n) || n > Number(max))) return false;
    return true;
  };
  return items.filter((m) => {
    const year =
      parseInt((m.release_date || m.first_air_date || "").substring(0, 4)) ||
      NaN;
    const rt = Number((m.rtRating || "").replace("%", "")) || NaN;
    return (
      inRange(m.imdbRating, f.imdbMin, f.imdbMax) &&
      inRange(rt, f.rtMin, f.rtMax) &&
      inRange(year, f.yearMin, f.yearMax) &&
      inRange(m.runtime, f.runtimeMin, f.runtimeMax)
    );
  });
}

/**
 * Sort items by the given field + direction.
 *
 * v2.6 — Refactored from a single `sort` string (17+ combinations
 * like "imdb_desc", "watch_asc") to a (field, direction) pair. This
 * matches the new SortControl UI which exposes 9 fields × 2 directions
 * = 18 combinations, but presents them as two side-by-side controls
 * instead of one giant dropdown.
 *
 * Direction semantics:
 *   - For numeric/date fields: desc = larger values first; asc = smaller first.
 *   - For title: desc = Z → A; asc = A → Z.
 *   The UI label always describes the resulting top-to-bottom display.
 *
 * Items missing the sort field (null/undefined/empty) sink to the
 * bottom of the list regardless of direction — this is the same
 * behavior as the previous "watch_desc"/"watch_asc" path which used
 * `resolveTimelineDate()` and treated null as "last".
 */
export function sortItems(
  items: WatchlistItem[],
  field: SortField,
  direction: SortDirection
): WatchlistItem[] {
  // Pre-extract a sortable key for each item so the comparator is O(1)
  // per comparison instead of re-parsing strings on every sort step.
  // For date fields we use ms-since-epoch; for ratings/runtime we use
  // numbers; for title we use a lowercased string. Missing keys are
  // represented as `null` and sink to the bottom.
  type Key = number | string | null;
  const keyOf = (m: WatchlistItem): Key => {
    switch (field) {
      case "title": {
        const t = (m.title || m.name || "").toLowerCase();
        return t === "" ? null : t;
      }
      case "release_date": {
        const d = m.release_date || m.first_air_date || "";
        if (!d) return null;
        // Lexicographic comparison of ISO dates = chronological comparison.
        // No need to parse to Date — saves allocations.
        return d;
      }
      case "user_rating": {
        const n = Number(m.rating);
        return isNaN(n) ? null : n;
      }
      case "imdb": {
        const n = parseFloat(m.imdbRating || "");
        return isNaN(n) ? null : n;
      }
      case "rt": {
        const n = Number((m.rtRating || "").replace("%", ""));
        return isNaN(n) ? null : n;
      }
      case "mt": {
        const n = Number(m.mtRating ?? "");
        return isNaN(n) ? null : n;
      }
      case "runtime": {
        const n = Number(m.runtime);
        return isNaN(n) ? null : n;
      }
      case "added_date": {
        // addedAt can be a Date, ISO string, or { seconds, nanoseconds }.
        const ms = toAddedAtMs(m.addedAt);
        return isNaN(ms) ? null : ms;
      }
      case "watch_date": {
        const d = resolveTimelineDate(m);
        return d === null ? null : d.getTime();
      }
      default:
        return null;
    }
  };

  return [...items].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    // Missing keys sink to the bottom, regardless of direction.
    const hasA = ka !== null;
    const hasB = kb !== null;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    if (!hasA && !hasB) return 0;

    if (field === "title") {
      // For title, asc = A → Z (lexicographic ascending).
      // localeCompare returns negative when a < b, so:
      //   asc  → return cmp (a<b means a first → A→Z ✓)
      //   desc → return -cmp (a<b means b first → Z→A ✓)
      const cmp = (ka as string).localeCompare(kb as string);
      return direction === "asc" ? cmp : -cmp;
    }

    if (field === "release_date") {
      // ISO date strings compare lexicographically = chronologically.
      // cmp = -1 when a < b (a is older), +1 when a > b (a is newer).
      const cmp =
        (ka as string) < (kb as string)
          ? -1
          : (ka as string) > (kb as string)
            ? 1
            : 0;
      // desc (newest first): if a is newer (cmp=+1), want a first → return +1. So return cmp.
      // asc  (oldest first): if a is older (cmp=-1), want a first → return -1. So return -cmp... wait.
      // Actually: Array.sort treats negative as "a first", positive as "b first".
      //   desc (newest first): a newer than b (cmp=+1) → want a first → return negative. So return -cmp.
      //   asc  (oldest first): a older than b (cmp=-1) → want a first → return negative. So return cmp.
      return direction === "asc" ? cmp : -cmp;
    }

    // Numeric fields (user_rating, imdb, rt, mt, runtime, added_date, watch_date).
    // na - nb is negative when a < b, positive when a > b.
    //   desc (larger first): a > b (positive na-nb) → want a first → return negative. So return -(na-nb) = nb-na.
    //   asc  (smaller first): a < b (negative na-nb) → want a first → return negative. So return na-nb.
    const na = ka as number;
    const nb = kb as number;
    const diff = na - nb;
    return direction === "asc" ? diff : -diff;
  });
}

/** Compute the active filter chips for display in the header. */
export function computeChips(
  f: VaultFilters
): { label: string; key: string }[] {
  const out: { label: string; key: string }[] = [];
  if (f.type !== "all")
    out.push({ label: f.type === "movie" ? "Movies" : "Series", key: "type" });
  if (f.region !== "all") out.push({ label: f.region, key: "region" });
  if (f.genre !== "all") out.push({ label: f.genre, key: "genre" });
  // Resolve platform to its display name so the chip shows "Netflix"
  // instead of a raw ID like "8" (covers presets saved with raw IDs).
  if (f.platform !== "all") {
    const display = resolvePlatformDisplayName(f.platform) || f.platform;
    out.push({ label: display, key: "platform" });
  }
  if (f.tag !== "all") out.push({ label: f.tag, key: "tag" });
  if (f.imdbMin) out.push({ label: `IMDb > ${f.imdbMin}`, key: "imdbMin" });
  if (f.imdbMax) out.push({ label: `IMDb < ${f.imdbMax}`, key: "imdbMax" });
  if (f.rtMin) out.push({ label: `RT > ${f.rtMin}`, key: "rtMin" });
  if (f.rtMax) out.push({ label: `RT < ${f.rtMax}`, key: "rtMax" });
  if (f.yearMin) out.push({ label: `Year > ${f.yearMin}`, key: "yearMin" });
  if (f.yearMax) out.push({ label: `Year < ${f.yearMax}`, key: "yearMax" });
  if (f.runtimeMin)
    out.push({ label: `RT > ${f.runtimeMin}m`, key: "runtimeMin" });
  if (f.runtimeMax)
    out.push({ label: `RT < ${f.runtimeMax}m`, key: "runtimeMax" });
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
  // v2.6 — sort is "active" (non-default) when either the field or
  // direction diverges from the defaults (added_date / desc). We treat
  // any non-default sort as a single active filter so the badge count
  // matches the user's mental model ("I changed the sort = 1 thing").
  if (f.sortField !== "added_date" || f.sortDirection !== "desc") count++;
  if (f.imdbMin || f.imdbMax) count++;
  if (f.rtMin || f.rtMax) count++;
  if (f.yearMin || f.yearMax) count++;
  if (f.runtimeMin || f.runtimeMax) count++;
  return count;
}

/** True when any advanced filter is set (ignoring status, which is owned by the quick tab). */
export function hasAdvancedFiltersActive(f: VaultFilters): boolean {
  return (
    f.type !== "all" ||
    f.region !== "all" ||
    f.genre !== "all" ||
    f.platform !== "all" ||
    f.tag !== "all" ||
    f.sortField !== "added_date" ||
    f.sortDirection !== "desc" ||
    f.imdbMin !== "" ||
    f.imdbMax !== "" ||
    f.rtMin !== "" ||
    f.rtMax !== "" ||
    f.yearMin !== "" ||
    f.yearMax !== "" ||
    f.runtimeMin !== "" ||
    f.runtimeMax !== ""
  );
}
