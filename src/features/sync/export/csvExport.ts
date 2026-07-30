// src/features/sync/export/csvExport.ts
//
// CSV export for CineLog-V2 watchlist.
//
// Generates a CSV file compatible with:
//   - Letterboxd import (Position, Name, Year, Letterboxd URI, Rating10)
//   - Trakt CSV import
//   - IMDb CSV import
//   - Generic spreadsheet apps (Excel, Google Sheets)
//
// Triggers a browser download via Blob + <a download> pattern.

import type { WatchlistItem } from "~/shared/types";

/**
 * Escape a CSV field — wrap in quotes if it contains comma, quote, or newline.
 * Doubles any internal quotes per RFC 4180.
 */
function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a single CSV row from fields. */
function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(",");
}

/** Extract a YYYY year from any date-ish string. */
function yearOf(dateStr: string | undefined): string {
  if (!dateStr) return "";
  return dateStr.split("-")[0];
}

/** Format an addedAt (which may be a Firestore timestamp, ISO string, or Date) as ISO. */
function isoOf(addedAt: WatchlistItem["addedAt"]): string {
  if (!addedAt) return "";
  if (typeof addedAt === "string") return addedAt;
  if (addedAt instanceof Date) return addedAt.toISOString();
  if (typeof addedAt === "object" && "seconds" in addedAt) {
    return new Date(addedAt.seconds * 1000).toISOString();
  }
  return "";
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
        yearOf(item.watchDate),
        `https://www.themoviedb.org/movie/${item.id}`,
        item.rating ?? ""
      ])
    );
    return [header, ...rows].join("\n");
  }

  if (format === "trakt") {
    // Trakt CSV: Title, Year, Type (movie/show), Rating (1-10), WatchedAt (ISO), Status
    const header = csvRow([
      "Title",
      "Year",
      "Type",
      "Rating",
      "WatchedAt",
      "Status"
    ]);
    const rows = items.map((item) =>
      csvRow([
        item.title || item.name || "Untitled",
        yearOf(item.watchDate),
        item.media_type === "tv" ? "show" : "movie",
        item.rating ?? "",
        isoOf(item.addedAt),
        item.status ?? ""
      ])
    );
    return [header, ...rows].join("\n");
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
        yearOf(item.watchDate),
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
 */
export function downloadCsv(csv: string, filename: string): void {
  // BOM for Excel UTF-8 detection
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Convenience: export and download a watchlist in one call.
 */
export function exportWatchlistCsv(
  items: WatchlistItem[],
  format: CsvExportOptions["format"] = "generic"
): void {
  const csv = watchlistToCsv(items, { format });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `cinelog-${format}-${date}.csv`;
  downloadCsv(csv, filename);
}
