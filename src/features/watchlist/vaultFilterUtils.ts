// src/features/watchlist/vaultFilterUtils.ts
import { isWatchable } from "~/shared/utils/progress";
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

/** Match a title against a free-text search query (case-insensitive). */
export function matchSearch(m: WatchlistItem, query: string): boolean {
  const s = query.toLowerCase().trim();
  const year = (m.release_date || m.first_air_date || "").substring(0, 4);
  const fields = [
    m.title, m.original_title, m.name, m.original_name,
    m.tag, m.notes, m.director, year,
    ...(m.castList || []),
    ...(m.genresList || []),
    ...(m.platformsList || []),
  ].join(" ").toLowerCase();
  return fields.includes(s);
}

/** Apply the quick-filter status tab + advanced status filter. */
export function filterByStatus(
  items: WatchlistItem[],
  effectiveStatus: string,
): WatchlistItem[] {
  if (effectiveStatus === "in-progress") return items.filter(isWatchable);
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
  if (f.region !== "all") out = out.filter((m) => (m.region || "International") === f.region);
  if (f.genre !== "all") out = out.filter((m) => m.genresList?.includes(f.genre));
  if (f.platform !== "all") out = out.filter((m) => m.platformsList?.includes(f.platform));
  if (f.tag !== "all") out = out.filter((m) => m.tag === f.tag);
  return out;
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
  return items.sort((a, b) => {
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
