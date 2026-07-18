// src/features/sync/import/csvImport.ts
//
// CSV import for CineLog-V2 watchlist.
//
// Parses CSV files exported from:
//   - Letterboxd (Position, Name, Year, Letterboxd URI, Rating10)
//   - Trakt (Title, Year, Type, Rating, WatchedAt, Status)
//   - IMDb (Position, Const, Created, Modified, Description, Title, URL, ...)
//   - Generic CineLog export
//
// Returns a list of "import candidates" — partial WatchlistItem objects
// that the caller can merge into the vault via bulk add.
//
// Auto-detects the source format from the header row.

import type { WatchlistItem } from "~/shared/types";

/** A row parsed from CSV, before being mapped to a WatchlistItem. */
export interface CsvImportRow {
  source: "letterboxd" | "trakt" | "imdb" | "generic" | "unknown";
  raw: Record<string, string>;
}

/** A candidate item to import — caller resolves the TMDB id. */
export interface ImportCandidate {
  /** TMDB id if known. */
  id?: string;
  /** Title — used to search TMDB if id is missing. */
  title: string;
  /** Year — used to disambiguate TMDB search. */
  year?: string;
  /** "movie" or "tv". */
  media_type: "movie" | "tv";
  /** Status to set on import. */
  status: WatchlistItem["status"];
  /** Rating (1-10 scale) if provided. */
  rating?: number;
  /** ISO date watched, if provided. */
  watchDate?: string;
  /** ISO date added to the source library, if provided. */
  addedAt?: string;
  /** ISO date last updated, if provided. */
  updatedAt?: string;
  /** Notes / description from source. */
  notes?: string;
  // ── Extended fields (V1 expanded CSV format) ───────────────────────
  // These don't get persisted to the vault table (only TMDB-owned metadata
  // does), but we preserve them in-memory so the import preview shows
  // correct titles/posters and so they're available immediately for
  // display before TMDB enrichment runs.
  /** Runtime in minutes. */
  runtime?: number;
  /** Total episodes (TV). */
  totalEps?: number;
  /** Current season pointer (TV). */
  season?: number;
  /** Current episode pointer (TV). */
  episode?: number;
  /** Pipe-separated genres → string[]. */
  genresList?: string[];
  /** Pipe-separated platforms → string[]. */
  platformsList?: string[];
  /** Pipe-separated cast → string[]. */
  castList?: string[];
  /** Director name. */
  director?: string;
  /** IMDb id (e.g. "tt1234567"). */
  imdbId?: string;
  /** IMDb rating string. */
  imdbRating?: string;
  /** Rotten Tomatoes rating string. */
  rtRating?: string;
  /** Region tag (e.g. "International", "Indian"). */
  region?: string;
  /** User-defined tag (e.g. "Theatre", "Rewatch"). */
  tag?: string;
  /** TMDB poster path. */
  poster_path?: string;
  /** TMDB backdrop path. */
  backdrop_path?: string;
  /** Release date (movie) or first air date (TV). */
  release_date?: string;
}

/** Parse a single CSV line, respecting quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        fields.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  fields.push(cur);
  return fields;
}

/** Strip BOM + normalize line endings. */
function normalize(text: string): string {
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Split a pipe-separated CSV cell into a string array.
 * Empty/missing values return an empty array.
 *
 * V1's expanded CSV export uses `|` as the in-cell delimiter for list-valued
 * fields (genres, platforms, cast) so they round-trip cleanly through CSV
 * (which uses `,` as the field delimiter). This matches V2's own CSV export
 * format, which uses the same `|` delimiter for the `genres` column.
 */
function splitPipe(val: string | undefined): string[] {
  if (!val) return [];
  return String(val)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Detect source format from header row. */
function detectSource(headers: string[]): CsvImportRow["source"] {
  const joined = headers.join(",").toLowerCase();
  if (joined.includes("letterboxd uri")) return "letterboxd";
  if (joined.includes("watchedat") && joined.includes("type")) return "trakt";
  if (joined.includes("const") && joined.includes("title type")) return "imdb";
  if (joined.includes("media_type") && joined.includes("status")) return "generic";
  return "unknown";
}

/**
 * Parse a CSV file's text content into import candidates.
 * Auto-detects format from the header row.
 */
export function parseWatchlistCsv(text: string): {
  source: CsvImportRow["source"];
  candidates: ImportCandidate[];
  skipped: number;
} {
  const cleaned = normalize(text);
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { source: "unknown", candidates: [], skipped: 0 };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const source = detectSource(headers);

  const candidates: ImportCandidate[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (fields[idx] ?? "").trim();
    });

    try {
      const candidate = mapRowToCandidate(row, source);
      if (candidate) {
        candidates.push(candidate);
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  return { source, candidates, skipped };
}

function mapRowToCandidate(row: Record<string, string>, source: CsvImportRow["source"]): ImportCandidate | null {
  if (source === "letterboxd") {
    const name = row["Name"] || row["name"];
    if (!name) return null;
    const year = row["Year"] || row["year"] || undefined;
    const ratingStr = row["Rating10"] || row["rating10"];
    const rating = ratingStr ? Number(ratingStr) : undefined;
    // Try to extract TMDB id from Letterboxd URI (rare — usually we'd need a TMDB search)
    const uri = row["Letterboxd URI"] || row["letterboxd uri"] || "";
    const tmdbMatch = /themoviedb\.org\/movie\/(\d+)/.exec(uri);
    return {
      id: tmdbMatch ? tmdbMatch[1] : undefined,
      title: name,
      year,
      media_type: "movie",
      status: "Completed",
      rating: !isNaN(rating as number) ? rating : undefined,
      watchDate: undefined,
    };
  }

  if (source === "trakt") {
    const title = row["Title"] || row["title"];
    if (!title) return null;
    const year = row["Year"] || row["year"] || undefined;
    const typeStr = (row["Type"] || row["type"] || "movie").toLowerCase();
    const media_type: "movie" | "tv" = typeStr === "show" || typeStr === "tv" ? "tv" : "movie";
    const ratingStr = row["Rating"] || row["rating"];
    const rating = ratingStr ? Number(ratingStr) : undefined;
    const watchedAt = row["WatchedAt"] || row["watchedat"];
    const statusStr = (row["Status"] || row["status"] || "Completed") as WatchlistItem["status"];
    return {
      title,
      year,
      media_type,
      status: statusStr,
      rating: !isNaN(rating as number) ? rating : undefined,
      watchDate: watchedAt,
    };
  }

  if (source === "imdb") {
    const title = row["Title"] || row["title"];
    if (!title) return null;
    const year = row["Year"] || row["year"] || undefined;
    const titleType = (row["Title Type"] || row["title type"] || "").toLowerCase();
    const media_type: "movie" | "tv" = titleType.includes("series") || titleType.includes("tv") ? "tv" : "movie";
    const ratingStr = row["IMDb Rating"] || row["imdb rating"];
    const rating = ratingStr ? Number(ratingStr) : undefined;
    const created = row["Created"] || row["created"];
    const description = row["Description"] || row["description"];
    return {
      title,
      year,
      media_type,
      status: "Completed",
      rating: !isNaN(rating as number) ? rating : undefined,
      watchDate: created,
      notes: description,
    };
  }

  if (source === "generic") {
    const title = row["title"] || row["name"];
    if (!title) return null;
    const id = row["id"];
    const media_type = (row["media_type"] === "tv" ? "tv" : "movie") as "movie" | "tv";
    const status = (row["status"] || "Planned") as WatchlistItem["status"];
    const ratingStr = row["rating"];
    const rating = ratingStr ? Number(ratingStr) : undefined;
    // Capture watch_date and added_at SEPARATELY — previous code conflated
    // them by using added_at as a fallback for watchDate, which set the
    // wrong timestamp on Planned items (where watch_date is empty but
    // added_at should still be preserved as the add-date).
    const watchDate = row["watch_date"] || undefined;
    const addedAt = row["added_at"] || row["updated_at"] || undefined;
    const updatedAt = row["updated_at"] || undefined;

    // ── Extended fields (V1 expanded CSV format) ─────────────────────
    // These don't get written to the vault table (only user-owned state
    // is persisted), but they're preserved in-memory on the WatchlistItem
    // so the import preview renders correctly and the UI doesn't show
    // "Untitled / NO POSTER" while waiting for TMDB enrichment.
    const runtime = row["runtime"] ? parseInt(row["runtime"], 10) : undefined;
    const totalEps = row["total_eps"] ? parseInt(row["total_eps"], 10) : undefined;
    const season = row["season"] ? parseInt(row["season"], 10) : undefined;
    const episode = row["episode"] ? parseInt(row["episode"], 10) : undefined;
    const genresList = splitPipe(row["genres"]);
    const platformsList = splitPipe(row["platforms"]);
    const castList = splitPipe(row["cast"]);
    const director = row["director"] || undefined;
    const imdbId = row["imdb_id"] || undefined;
    const imdbRating = row["imdb_rating"] || undefined;
    const rtRating = row["rt_rating"] || undefined;
    const region = row["region"] || undefined;
    const tag = row["tag"] || undefined;
    const poster_path = row["poster_path"] || undefined;
    const backdrop_path = row["backdrop_path"] || undefined;
    const release_date = row["release_date"] || undefined;

    return {
      id,
      title,
      media_type,
      status,
      rating: !isNaN(rating as number) ? rating : undefined,
      watchDate,
      addedAt,
      updatedAt,
      notes: row["notes"] || undefined,
      // Extended fields — only set when actually present in the CSV so we
      // don't overwrite TMDB-enriched values with empty strings later.
      ...(runtime != null && !isNaN(runtime) && { runtime }),
      ...(totalEps != null && !isNaN(totalEps) && { totalEps }),
      ...(season != null && !isNaN(season) && { season }),
      ...(episode != null && !isNaN(episode) && { episode }),
      ...(genresList.length > 0 && { genresList }),
      ...(platformsList.length > 0 && { platformsList }),
      ...(castList.length > 0 && { castList }),
      ...(director && { director }),
      ...(imdbId && { imdbId }),
      ...(imdbRating && { imdbRating }),
      ...(rtRating && { rtRating }),
      ...(region && { region }),
      ...(tag && { tag }),
      ...(poster_path && { poster_path }),
      ...(backdrop_path && { backdrop_path }),
      ...(release_date && { release_date }),
    };
  }

  // Unknown — try generic mapping with common field names
  const title = row["title"] || row["name"] || row["Title"] || row["Name"];
  if (!title) return null;
  return {
    title,
    media_type: "movie",
    status: "Planned",
  };
}

/**
 * Read a File object as text. Promise wrapper for <input type="file">.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
