// src/features/sync/export/csvExport.ts
//
// CSV export for CineLog-V2 watchlist.
//
// Generates CSV files compatible with Letterboxd, Trakt, IMDb, and generic
// spreadsheet applications. The Trakt branch intentionally uses only Trakt
// CSV-supported identity and state fields; it never substitutes CineLog IDs,
// titles, or years for an external media-service ID.

import type { WatchlistItem } from "~/shared/types";

export const TRAKT_CSV_HEADERS = [
  "tmdb_id",
  "imdb_id",
  "trakt_id",
  "tvdb_id",
  "type",
  "watched_at",
  "watchlisted_at",
  "rating",
  "rated_at"
] as const;

/**
 * Trakt's recognized ISO date sentinel for history whose exact watch date is
 * unknown. This is deliberately not a fabricated CineLog watch date.
 */
export const TRAKT_UNKNOWN_WATCHED_AT = "1970-01-01T00:00:00.000Z";

type CsvCell = string | number | null | undefined;
type TraktMediaType = "movie" | "show";

interface TraktExportRecord {
  tmdbId: string;
  imdbId: string;
  traktId: string;
  tvdbId: string;
  type: TraktMediaType;
  watchedAts: string[];
  watchlistedAt: string;
  rating: number | undefined;
}

/**
 * Escape a CSV field — wrap in quotes if it contains comma, quote, or newline.
 * Doubles any internal quotes per RFC 4180.
 */
function escapeCsvField(value: CsvCell): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a single CSV row from fields. */
function csvRow(fields: CsvCell[]): string {
  return fields.map(escapeCsvField).join(",");
}

/** Extract a YYYY year from any date-ish string. */
function yearOf(dateStr: string | undefined): string {
  if (!dateStr) return "";
  return dateStr.split("-")[0];
}

/**
 * Resolve the RELEASE year of a title — NOT the user's watch date.
 *
 * Resolution: prefer `release_date` (movies) → `first_air_date` (TV).
 * Fall back to `watchDate` only for legacy items missing TMDB enrichment.
 */
function releaseYearOf(item: WatchlistItem): string {
  const releaseDate = item.release_date ?? item.first_air_date;
  if (releaseDate) return yearOf(releaseDate);
  return yearOf(item.watchDate);
}

/**
 * Normalize a CineLog date value to a valid UTC ISO 8601 timestamp.
 * Dates with no usable timestamp intentionally become empty rather than being
 * replaced with a guessed date.
 */
function isoOf(
  value: WatchlistItem["addedAt"] | string | undefined | null
): string {
  if (!value) return "";

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }

  if (typeof value === "object" && "seconds" in value) {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  return "";
}

function nonEmptyString(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** The library item's `id` is a TMDB ID only when it is a positive integer. */
function tmdbIdOf(item: WatchlistItem): string {
  const id = nonEmptyString(item.id);
  return /^\d+$/.test(id) && Number(id) > 0 ? id : "";
}

function traktTypeOf(item: WatchlistItem): TraktMediaType {
  return item.media_type === "tv" ? "show" : "movie";
}

function isCompleted(item: WatchlistItem): boolean {
  return item.status === "Completed";
}

function isWatchlisted(item: WatchlistItem): boolean {
  return item.status === "Planned" || item.status === "Plan to Watch";
}

/**
 * CineLog title ratings are integer values on the same 1–10 scale Trakt
 * accepts. Do not coerce absent, fractional, or out-of-range data to zero or
 * another rating because that would change the user's data.
 */
function traktRatingOf(item: WatchlistItem): number | undefined {
  // Current client types use `number`, while legacy/imported rows can arrive
  // as numeric strings from database drivers. Parse only numeric values and
  // still enforce Trakt's integer 1–10 contract.
  const rawRating = item.rating as unknown;
  const rating =
    typeof rawRating === "number"
      ? rawRating
      : typeof rawRating === "string" && rawRating.trim() !== ""
        ? Number(rawRating)
        : Number.NaN;

  return Number.isInteger(rating) && rating >= 1 && rating <= 10
    ? rating
    : undefined;
}

/**
 * Preserve each exact, stored watch event. A completed item without a precise
 * date emits Trakt's documented unknown-date ISO sentinel instead of a guessed
 * day. Watching, planned, and dropped states are not falsely exported as
 * watched history.
 */
function watchedAtsOf(item: WatchlistItem): string[] {
  if (!isCompleted(item)) return [];

  const candidates = [item.watchDate, ...(item.rewatchDates ?? [])]
    .map((date) => isoOf(date))
    .filter(Boolean);

  if (candidates.length === 0) return [TRAKT_UNKNOWN_WATCHED_AT];

  return [...new Set(candidates)];
}

function externalIdentityTokens(record: TraktExportRecord): string[] {
  return [
    record.tmdbId && `tmdb:${record.tmdbId}`,
    record.imdbId && `imdb:${record.imdbId}`,
    record.traktId && `trakt:${record.traktId}`,
    record.tvdbId && `tvdb:${record.tvdbId}`
  ].filter(Boolean) as string[];
}

function recordFromItem(item: WatchlistItem): TraktExportRecord | null {
  const record: TraktExportRecord = {
    tmdbId: tmdbIdOf(item),
    imdbId: nonEmptyString(item.externalIds?.imdb),
    traktId: nonEmptyString(item.externalIds?.trakt),
    tvdbId: nonEmptyString(item.externalIds?.tvdb),
    type: traktTypeOf(item),
    watchedAts: watchedAtsOf(item),
    watchlistedAt: isWatchlisted(item) ? isoOf(item.addedAt) : "",
    rating: traktRatingOf(item)
  };

  // Trakt's importer cannot resolve a row with no supported external ID. Skip
  // it rather than writing a malformed row or falling back to a CineLog UUID,
  // title, or year.
  return externalIdentityTokens(record).length > 0 ? record : null;
}

function preferKnownWatchDate(current: string, incoming: string): string {
  if (!current) return incoming;
  if (!incoming) return current;
  if (current === TRAKT_UNKNOWN_WATCHED_AT) return incoming;
  return current;
}

function mergeRecord(target: TraktExportRecord, incoming: TraktExportRecord): void {
  target.tmdbId ||= incoming.tmdbId;
  target.imdbId ||= incoming.imdbId;
  target.traktId ||= incoming.traktId;
  target.tvdbId ||= incoming.tvdbId;

  for (const watchedAt of incoming.watchedAts) {
    const matchingIndex = target.watchedAts.indexOf(watchedAt);
    if (matchingIndex === -1) target.watchedAts.push(watchedAt);
  }

  // A precise date wins over the unknown-date sentinel if duplicate source
  // records disagree. Multiple precise rewatch events remain separate rows.
  const knownWatchedAts = target.watchedAts.filter(
    (date) => date !== TRAKT_UNKNOWN_WATCHED_AT
  );
  target.watchedAts = knownWatchedAts.length > 0
    ? [...new Set(knownWatchedAts)]
    : target.watchedAts.slice(0, 1);

  target.watchlistedAt = preferKnownWatchDate(
    target.watchlistedAt,
    incoming.watchlistedAt
  );
  target.rating ??= incoming.rating;
}

/**
 * Build Trakt import records while deduplicating the same title across any
 * available external identifier. This merges watched, watchlisted, and rated
 * state into the same primary row, while retaining distinct stored rewatch
 * timestamps as legitimate independent history rows.
 */
function traktRecords(items: WatchlistItem[]): TraktExportRecord[] {
  const records: TraktExportRecord[] = [];
  const byIdentity = new Map<string, TraktExportRecord>();

  for (const item of items) {
    const incoming = recordFromItem(item);
    if (!incoming) continue;

    const identityTokens = externalIdentityTokens(incoming);
    const matchingRecords = [...new Set(
      identityTokens
        .map((token) => byIdentity.get(token))
        .filter((record): record is TraktExportRecord => Boolean(record))
    )];

    let target = matchingRecords[0];
    if (!target) {
      target = incoming;
      records.push(target);
    } else {
      mergeRecord(target, incoming);
    }

    // Rare imported data can connect two prior records through different IDs.
    // Collapse them into one title record so duplicate rows are not emitted.
    for (const duplicate of matchingRecords.slice(1)) {
      if (duplicate === target) continue;
      mergeRecord(target, duplicate);
      const duplicateIndex = records.indexOf(duplicate);
      if (duplicateIndex !== -1) records.splice(duplicateIndex, 1);
      for (const token of externalIdentityTokens(duplicate)) {
        byIdentity.set(token, target);
      }
    }

    for (const token of externalIdentityTokens(target)) {
      byIdentity.set(token, target);
    }
  }

  return records;
}

function traktRows(items: WatchlistItem[]): string[] {
  const rows: string[] = [];

  for (const record of traktRecords(items)) {
    // A title with rewatch history produces one legitimate history row for
    // each unique stored watch timestamp. Watchlist/rating state appears only
    // on the first row, preventing status-driven duplicates.
    const watchedAts = record.watchedAts.length > 0 ? record.watchedAts : [""];
    watchedAts.forEach((watchedAt, index) => {
      rows.push(
        csvRow([
          record.tmdbId,
          record.imdbId,
          record.traktId,
          record.tvdbId,
          record.type,
          watchedAt,
          index === 0 ? record.watchlistedAt : "",
          index === 0 ? record.rating ?? "" : "",
          // CineLog has no dedicated rating-created/updated timestamp. Its
          // generic `updated_at` can reflect unrelated edits, so leave this
          // blank rather than fabricating a rating action time.
          ""
        ])
      );
    });
  }

  return rows;
}

export interface CsvExportOptions {
  /** Format: 'letterboxd' (Letterboxd-compatible), 'trakt', 'imdb', 'generic'. */
  format?: "letterboxd" | "trakt" | "imdb" | "generic";
}

/**
 * Convert a watchlist to a CSV string.
 *
 * Format defaults to "generic" which includes all CineLog data.
 * Use format="letterboxd" for Letterboxd-compatible export (movies only).
 */
export function watchlistToCsv(
  items: WatchlistItem[],
  options: CsvExportOptions = {}
): string {
  const format = options.format ?? "generic";

  if (format === "letterboxd") {
    // Letterboxd format: Position, Name, Year, Letterboxd URI, Rating10
    // Only movies — Letterboxd is film-only.
    const movies = items.filter((i) => i.media_type !== "tv");
    const header = csvRow([
      "Position",
      "Name",
      "Year",
      "Letterboxd URI",
      "Rating10"
    ]);
    const rows = movies.map((item, idx) =>
      csvRow([
        idx + 1,
        item.title || item.name || "Untitled",
        releaseYearOf(item),
        `https://www.themoviedb.org/movie/${item.id}`,
        item.rating ?? ""
      ])
    );
    return [header, ...rows].join("\n");
  }

  if (format === "trakt") {
    return [csvRow([...TRAKT_CSV_HEADERS]), ...traktRows(items)].join("\n");
  }

  if (format === "imdb") {
    // IMDb CSV: Position, Const, Created, Modified, Description, Title, URL, Title Type, IMDb Rating, Runtime (mins), Year, Genres, Num Votes, Release Date, Directors
    const header = csvRow([
      "Position",
      "Const",
      "Created",
      "Modified",
      "Description",
      "Title",
      "URL",
      "Title Type",
      "IMDb Rating",
      "Runtime (mins)",
      "Year",
      "Genres",
      "Num Votes",
      "Release Date",
      "Directors"
    ]);
    const rows = items.map((item, idx) =>
      csvRow([
        idx + 1,
        `tt${item.id}`,
        isoOf(item.addedAt),
        item.updatedAt ?? "",
        item.notes ?? "",
        item.title || item.name || "Untitled",
        `https://www.themoviedb.org/${item.media_type === "tv" ? "tv" : "movie"}/${item.id}`,
        item.media_type === "tv" ? "TV Series" : "Movie",
        item.rating ?? "",
        item.runtime ?? "",
        releaseYearOf(item),
        (item.genresList ?? []).join(","),
        "",
        item.watchDate ?? "",
        item.director ?? ""
      ])
    );
    return [header, ...rows].join("\n");
  }

  // Generic — full CineLog data
  const header = csvRow([
    "id",
    "title",
    "media_type",
    "status",
    "rating",
    "added_at",
    "updated_at",
    "watch_date",
    "runtime",
    "genres",
    "notes",
    "director",
    "poster_path",
    "backdrop_path"
  ]);
  const rows = items.map((item) =>
    csvRow([
      item.id,
      item.title || item.name || "",
      item.media_type ?? "",
      item.status ?? "",
      item.rating ?? "",
      isoOf(item.addedAt),
      item.updatedAt ?? "",
      item.watchDate ?? "",
      item.runtime ?? "",
      (item.genresList ?? []).join("|"),
      item.notes ?? "",
      item.director ?? "",
      item.poster_path ?? "",
      item.backdrop_path ?? ""
    ])
  );
  return [header, ...rows].join("\n");
}

/**
 * Trigger a CSV file download in the browser.
 *
 * Trakt receives plain UTF-8 without a BOM so the first header is exactly
 * `tmdb_id`; existing non-Trakt exports retain their Excel-friendly BOM.
 */
export function downloadCsv(
  csv: string,
  filename: string,
  options: { includeBom?: boolean } = {}
): void {
  const content = options.includeBom === false ? csv : "\uFEFF" + csv;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convenience: export and download a watchlist in one call. */
export function exportWatchlistCsv(
  items: WatchlistItem[],
  format: CsvExportOptions["format"] = "generic"
): void {
  const csv = watchlistToCsv(items, { format });
  const date = new Date().toISOString().slice(0, 10);
  const filename =
    format === "trakt" ? "cinelog-trakt-export.csv" : `cinelog-${format}-${date}.csv`;
  downloadCsv(csv, filename, { includeBom: format !== "trakt" });
}
