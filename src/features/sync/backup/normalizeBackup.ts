// src/features/sync/backup/normalizeBackup.ts
//
// Universal Backup Normalization Layer
// =====================================
//
// This module is the SINGLE source of truth for parsing, normalizing,
// repairing, and validating backup data from ANY CineLog backup format
// (past, present, or future).
//
// PIPELINE:
//   raw JSON → detectBackupFormat() → extractRawItems()
//   → normalizeWatchlistItem() (per item)
//     → mapLegacyFields()
//     → normalizeStatus()
//     → normalizeRating()
//     → normalizeDates()
//     → normalizeProgress()
//     → repairMissingFields()
//   → validateItem()
//   → valid WatchlistItem[] (ready for Supabase insert)
//
// Every import source (JSON file, V1 Firebase, future Letterboxd/Trakt)
// uses this layer. No duplicated normalization logic anywhere else.
//

import type { WatchlistItem, WatchProgress } from "~/shared/types";

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export type BackupFormat =
  | "flat-array"           // V1 export: [...items]
  | "wrapped-v2"           // V2 export: { version, library: { watchlist } }
  | "wrapper-data"         // future: { data: [...] }
  | "wrapper-items"        // future: { items: [...] }
  | "wrapper-watchlist"    // future: { watchlist: [...] }
  | "wrapper-library"      // future: { library: [...] }
  | "wrapper-vault"        // future: { vault: [...] }
  | "wrapper-movies"       // future: { movies: [...] }
  | "unknown";

/** Known wrapper keys that might hold an array of items. */
const ARRAY_WRAPPER_KEYS = [
  "watchlist", "library", "vault", "data", "items",
  "movies", "series", "titles", "entries", "backup",
] as const;

/**
 * Detect the backup format by inspecting the parsed JSON.
 *
 * The detector checks in order:
 *   1. Is it a flat array? → "flat-array"
 *   2. Is it an object with a `library.watchlist` array? → "wrapped-v2"
 *   3. Is it an object with ANY known array wrapper key? → "wrapper-*"
 *   4. Is it an object with `library.watchlist` that's NOT an array
 *      (e.g. nested deeper)? → recurse one level
 *   5. Otherwise → "unknown"
 */
export function detectBackupFormat(parsed: unknown): BackupFormat {
  // Flat array of items.
  if (Array.isArray(parsed)) return "flat-array";
  if (!parsed || typeof parsed !== "object") return "unknown";

  const obj = parsed as Record<string, unknown>;

  // V2 wrapped: { version, library: { watchlist: [...] } }
  if (
    typeof obj.version === "number" &&
    obj.library && typeof obj.library === "object" &&
    Array.isArray((obj.library as Record<string, unknown>).watchlist)
  ) {
    return "wrapped-v2";
  }

  // Check for any known array wrapper key at the top level.
  for (const key of ARRAY_WRAPPER_KEYS) {
    if (Array.isArray(obj[key])) {
      switch (key) {
        case "data": return "wrapper-data";
        case "items": return "wrapper-items";
        case "watchlist": return "wrapper-watchlist";
        case "library": return "wrapper-library";
        case "vault": return "wrapper-vault";
        case "movies": return "wrapper-movies";
        default: return `wrapper-${key}` as BackupFormat;
      }
    }
  }

  // Maybe library is an object with a nested array (e.g. { library: { items: [...] } })
  if (obj.library && typeof obj.library === "object") {
    const lib = obj.library as Record<string, unknown>;
    for (const key of ARRAY_WRAPPER_KEYS) {
      if (Array.isArray(lib[key])) return "wrapped-v2"; // treat as v2-ish
    }
  }

  return "unknown";
}

/**
 * Extract the raw item array from any detected format.
 * Returns an array of unknown objects — they still need normalization.
 */
export function extractRawItems(parsed: unknown, format: BackupFormat): unknown[] {
  if (format === "flat-array" && Array.isArray(parsed)) return parsed;

  if (!parsed || typeof parsed !== "object") return [];
  const obj = parsed as Record<string, unknown>;

  if (format === "wrapped-v2") {
    const lib = obj.library as Record<string, unknown> | undefined;
    const arr = lib?.watchlist;
    return Array.isArray(arr) ? arr : [];
  }

  // Generic wrapper — find the first known key that's an array.
  for (const key of ARRAY_WRAPPER_KEYS) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Legacy field mapping
// ---------------------------------------------------------------------------

/** Map of legacy field names → canonical WatchlistItem field names. */
const LEGACY_FIELD_MAP: Record<string, string> = {
  // ID aliases
  tmdb: "id",
  tmdbId: "id",
  tmdb_id: "id",
  movieId: "id",
  seriesId: "id",
  titleId: "id",
  // media_type aliases
  mediaType: "media_type",
  media_type: "media_type",
  type: "media_type",
  // status aliases
  watchStatus: "status",
  watch_state: "status",
  watchState: "status",
  // title aliases
  titleName: "title",
  name_title: "title",
  // date aliases
  dateAdded: "addedAt",
  dateUpdated: "updatedAt",
  dateWatched: "watchDate",
  // notes aliases
  comment: "notes",
  comments: "notes",
  review: "notes",
};

/**
 * Map legacy field names to canonical names.
 * Does NOT mutate the original — returns a new object.
 */
function mapLegacyFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const canonical = LEGACY_FIELD_MAP[key] ?? key;
    // Don't overwrite an existing canonical key with a legacy alias.
    if (out[canonical] === undefined) {
      out[canonical] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Status normalization
// ---------------------------------------------------------------------------

/** Canonical V2 statuses (Title Case, matching WatchlistItem.status). */
const VALID_STATUSES = new Set(["Planned", "Watching", "Completed", "Plan to Watch", "Dropped"]);

/** Map of lowercase/legacy status strings → canonical V2 status. */
const STATUS_MAP: Record<string, WatchlistItem["status"]> = {
  // V2 canonical
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  dropped: "Dropped",
  // V1 variants
  "plan to watch": "Plan to Watch",
  plantowatch: "Plan to Watch",
  // Common variants
  watched: "Completed",
  finished: "Completed",
  done: "Completed",
  paused: "Plan to Watch",  // V2's "Plan to Watch" is closest to "Paused"
  onhold: "Plan to Watch",
  "on-hold": "Plan to Watch",
  abandoned: "Dropped",
  skipped: "Dropped",
  none: "Planned",
  "": "Planned",
};

export function normalizeStatus(raw: unknown): WatchlistItem["status"] {
  if (typeof raw === "string") {
    // Already canonical?
    if (VALID_STATUSES.has(raw)) return raw as WatchlistItem["status"];
    // Try lowercase lookup.
    const mapped = STATUS_MAP[raw.toLowerCase().trim()];
    if (mapped) return mapped;
  }
  // Default.
  return "Planned";
}

// ---------------------------------------------------------------------------
// Rating normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a rating to a number 0-10 (or undefined if missing/invalid).
 *
 * Handles: numbers, numeric strings, "8.5/10" strings, "4/5" (scaled to 8),
 * "85%" (scaled to 8.5), null/undefined → undefined.
 *
 * ── V1 BACKUP COMPATIBILITY ───────────────────────────────────────
 * V1's `toV2Backup` writes ratings on a 0-10 scale directly (no scaling).
 * Previously this function applied a "heuristic" that doubled any integer
 * rating 1-5 (assuming a 0-5 scale from Letterboxd-style sources). That
 * heuristic was WRONG for V1 backups: a V1 rating of `4` (meaning 4/10)
 * got silently doubled to `8`, corrupting ~13% of imported ratings.
 *
 * The fix: treat numeric inputs as already on the 0-10 scale. The only
 * scaling we still do is for:
 *   - String formats that explicitly indicate scale ("4/5", "85%")
 *   - Numbers > 10 (assume percentage → divide by 10)
 *
 * The Letterboxd CSV parser already extracts `Rating10` (which is 0-10),
 * so it doesn't need a heuristic here either.
 */
export function normalizeRating(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") {
    if (isNaN(raw) || raw < 0) return undefined;
    // V1 uses 0-10 scale; 0 means "no rating".
    if (raw === 0) return undefined;
    // If > 10, it's probably a percentage — scale down to 0-10.
    if (raw > 10) return Math.round((raw / 10) * 10) / 10;
    // Already on the 0-10 scale — pass through unchanged.
    return raw;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    // "8.5/10" format
    const slashMatch = trimmed.match(/^([\d.]+)\s*\/\s*(\d+)$/);
    if (slashMatch) {
      const val = parseFloat(slashMatch[1]);
      const max = parseFloat(slashMatch[2]);
      if (!isNaN(val) && !isNaN(max) && max > 0) {
        return Math.round((val / max) * 10 * 10) / 10;
      }
    }
    // "85%" format
    const pctMatch = trimmed.match(/^([\d.]+)\s*%$/);
    if (pctMatch) {
      const val = parseFloat(pctMatch[1]);
      if (!isNaN(val)) return Math.round((val / 10) * 10) / 10;
    }
    // Plain number string
    const num = parseFloat(trimmed);
    if (!isNaN(num)) return normalizeRating(num);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Date normalization
// ---------------------------------------------------------------------------

/**
 * Normalize any date-like value to an ISO string.
 *
 * Handles:
 *   - ISO strings ("2026-07-07T16:49:38.329Z")
 *   - Firestore Timestamps ({ seconds, nanoseconds })
 *   - Unix timestamps (numbers — seconds or milliseconds)
 *   - Date objects
 *   - null/undefined → undefined
 */
export function normalizeDate(raw: unknown): string | undefined {
  if (raw == null || raw === "") return undefined;

  // Firestore Timestamp: { seconds, nanoseconds }
  if (typeof raw === "object" && raw !== null && "seconds" in raw) {
    const ts = raw as { seconds: number; nanoseconds?: number };
    if (typeof ts.seconds === "number") {
      return new Date(ts.seconds * 1000).toISOString();
    }
  }

  // Date object
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? undefined : raw.toISOString();
  }

  // Number (Unix timestamp — seconds or milliseconds)
  if (typeof raw === "number") {
    // If the number is very large, it's probably milliseconds.
    const ms = raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  // String
  if (typeof raw === "string") {
    // Try parsing as a number first (Unix timestamp string).
    const asNum = Number(raw);
    if (!isNaN(asNum) && raw.match(/^\d+$/)) {
      return normalizeDate(asNum);
    }
    // Parse as a date string.
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Watch progress normalization
// ---------------------------------------------------------------------------

const DEFAULT_PROGRESS: WatchProgress = {
  currentTime: 0,
  duration: 0,
  season: 1,
  episode: 1,
  server: null,
  updatedAt: new Date().toISOString(),
};

export function normalizeProgress(raw: unknown): WatchProgress {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROGRESS };
  const p = raw as Record<string, unknown>;
  return {
    currentTime: typeof p.currentTime === "number" ? p.currentTime : 0,
    duration: typeof p.duration === "number" ? p.duration : 0,
    season: typeof p.season === "number" ? p.season : 1,
    episode: typeof p.episode === "number" ? p.episode : 1,
    server: typeof p.server === "string" ? p.server : null,
    updatedAt: normalizeDate(p.updatedAt) ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Full item normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a single raw item into a WatchlistItem.
 *
 * Pipeline: mapLegacyFields → normalize each field → repairMissingFields.
 * Never throws — on any error, returns null (caller skips the item).
 */
export function normalizeWatchlistItem(raw: unknown): WatchlistItem | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const mapped = mapLegacyFields(raw as Record<string, unknown>);

    // --- Core identity ---
    const id = normalizeId(mapped.id);
    if (id == null) return null; // can't import without an id

    const mediaType = normalizeMediaType(mapped.media_type, mapped.type);
    if (mediaType == null) return null; // can't import without a media type

    // --- Status ---
    const status = normalizeStatus(mapped.status);

    // --- Rating ---
    const rating = normalizeRating(mapped.rating);

    // --- Dates ---
    const addedAt = normalizeDate(mapped.addedAt) ?? new Date().toISOString();
    const updatedAt = normalizeDate(mapped.updatedAt) ?? addedAt;
    const watchDate = normalizeDate(mapped.watchDate);
    const releaseDate = normalizeDate(mapped.release_date) ?? normalizeDate(mapped.first_air_date);

    // --- Text fields ---
    const title = typeof mapped.title === "string" ? mapped.title : undefined;
    const name = typeof mapped.name === "string" ? mapped.name : undefined;
    const notes = typeof mapped.notes === "string" ? mapped.notes : "";
    const posterPath = normalizeNullableString(mapped.poster_path);
    const backdropPath = normalizeNullableString(mapped.backdrop_path);

    // --- Arrays (repair to [] if missing) ---
    const genresList = normalizeStringArray(mapped.genresList);
    const platformsList = normalizeStringArray(mapped.platformsList);
    const castList = normalizeStringArray(mapped.castList);

    // --- Numbers ---
    const runtime = typeof mapped.runtime === "number" ? mapped.runtime : undefined;
    const totalEps = typeof mapped.totalEps === "number" ? mapped.totalEps : undefined;
    const season = typeof mapped.season === "number" ? mapped.season : undefined;
    const episode = typeof mapped.episode === "number" ? mapped.episode : undefined;

    // --- Progress ---
    const watchProgress = mapped.watchProgress != null
      ? normalizeProgress(mapped.watchProgress)
      : undefined;

    // --- Ratings strings (IMDb/RT/TMDB) ---
    const imdbRating = normalizeNullableString(mapped.imdbRating);
    const rtRating = normalizeNullableString(mapped.rtRating);
    const tmdbRating = normalizeNullableString(mapped.tmdbRating);

    // --- Misc ---
    const region = normalizeNullableString(mapped.region);
    const tag = normalizeNullableString(mapped.tag);
    const director = normalizeNullableString(mapped.director);
    const imdbId = normalizeNullableString(mapped.imdbId);
    const newSeasonAvailable = typeof mapped.newSeasonAvailable === "boolean" ? mapped.newSeasonAvailable : undefined;
    const directPlayUrl = normalizeNullableString(mapped.directPlayUrl);

    // --- Re-watch tracking (preserved from V2 backups) ---
    const rewatchCount = typeof mapped.rewatchCount === "number" ? mapped.rewatchCount : undefined;
    const rewatchDates = Array.isArray(mapped.rewatchDates) ? mapped.rewatchDates.filter((d): d is string => typeof d === "string") : undefined;

    // --- Series per-season dates (preserved from V2 backups) ---
    const seasonDates = (mapped.seasonDates != null && typeof mapped.seasonDates === "object" && !Array.isArray(mapped.seasonDates))
      ? mapped.seasonDates as Record<string, { start: string; end: string }>
      : undefined;
    const seasonRewatchCount = typeof mapped.seasonRewatchCount === "number" ? mapped.seasonRewatchCount : undefined;
    const seasonRewatchDates = Array.isArray(mapped.seasonRewatchDates) ? mapped.seasonRewatchDates as Record<string, { start: string; end: string }>[] : undefined;

    const item: WatchlistItem = {
      id,
      media_type: mediaType,
      status,
      addedAt,
      updatedAt,
      notes,
      genresList,
      platformsList,
      ...(title != null && { title }),
      ...(name != null && { name }),
      ...(rating != null && { rating }),
      ...(watchDate != null && { watchDate }),
      ...(posterPath !== undefined && { poster_path: posterPath }),
      ...(backdropPath !== undefined && { backdrop_path: backdropPath }),
      ...(releaseDate != null && { release_date: releaseDate }),
      ...(castList.length > 0 && { castList }),
      ...(runtime != null && { runtime }),
      ...(totalEps != null && { totalEps }),
      ...(season != null && { season }),
      ...(episode != null && { episode }),
      ...(watchProgress != null && { watchProgress }),
      ...(imdbRating != null && { imdbRating }),
      ...(rtRating != null && { rtRating }),
      ...(tmdbRating != null && { tmdbRating }),
      ...(region != null && { region }),
      ...(tag != null && { tag }),
      ...(director != null && { director }),
      ...(imdbId != null && { imdbId }),
      ...(newSeasonAvailable != null && { newSeasonAvailable }),
      ...(directPlayUrl != null && { directPlayUrl }),
      // Preserve re-watch + per-season fields from V2 backups
      ...(rewatchCount != null && { rewatchCount }),
      ...(rewatchDates != null && { rewatchDates }),
      ...(seasonDates != null && { seasonDates }),
      ...(seasonRewatchCount != null && { seasonRewatchCount }),
      ...(seasonRewatchDates != null && { seasonRewatchDates }),
    };

    return item;
  } catch (err) {
    console.error("[normalizeWatchlistItem] Failed to normalize item:", raw, err);
    return null;
  }
}

/** Normalize an id value to a string, or null if missing/invalid. */
function normalizeId(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed;
  }
  return null;
}

/** Normalize a media type to "movie" | "tv", or null if unknown. */
function normalizeMediaType(...candidates: unknown[]): "movie" | "tv" | null {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const lower = c.toLowerCase().trim();
    if (lower === "movie" || lower === "film") return "movie";
    if (lower === "tv" || lower === "series" || lower === "show" || lower === "television") return "tv";
  }
  return null;
}

/** Normalize a value to a string | null. undefined input → undefined (field omitted). */
function normalizeNullableString(raw: unknown): string | null | undefined {
  if (raw == null) return null;
  if (typeof raw === "string") return raw.trim() || null;
  return null;
}

/** Normalize a value to a string[] (empty array if missing/invalid). */
function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationFailure {
  reason: string;
  item: unknown;
}

/**
 * Validate a normalized WatchlistItem.
 * Returns null if valid, or a failure reason if invalid.
 *
 * MUST run AFTER normalization.
 */
export function validateItem(item: WatchlistItem | null): { reason: string } | null {
  if (item == null) return { reason: "Normalization failed" };
  if (!item.id) return { reason: "Missing TMDB ID" };
  if (item.media_type !== "movie" && item.media_type !== "tv") {
    return { reason: "Invalid media type" };
  }
  if (!["Planned", "Watching", "Completed", "Plan to Watch", "Dropped"].includes(item.status)) {
    return { reason: "Invalid status" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Repair tracking
// ---------------------------------------------------------------------------

/**
 * Check if a normalized item was "repaired" — i.e. the raw input was
 * missing fields that we filled in with defaults.
 *
 * This is a heuristic: if the raw item lacked updatedAt, genresList,
 * platformsList, or notes, and we filled them in, it counts as repaired.
 */
export function wasRepaired(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  // Check for common missing fields that trigger repair.
  return (
    o.updatedAt == null ||
    o.genresList == null ||
    o.platformsList == null ||
    o.notes == null ||
    (typeof o.id === "number") || // numeric id → string id is a repair
    (typeof o.status === "string" && !["Planned", "Watching", "Completed", "Plan to Watch", "Dropped"].includes(o.status))
  );
}

// ---------------------------------------------------------------------------
// Full pipeline: normalize + validate a raw items array
// ---------------------------------------------------------------------------

export interface NormalizedBatch {
  /** Valid, normalized items ready for Supabase insert. */
  items: WatchlistItem[];
  /** Items that failed validation (with reasons). */
  failures: ValidationFailure[];
  /** Count of items that were repaired (missing fields filled in). */
  repairedCount: number;
}

/**
 * Run the full normalization + validation pipeline on a raw items array.
 *
 * This is the SINGLE entry point every import source should call.
 * Returns valid items + failure details + repair count.
 */
export function normalizeBatch(rawItems: unknown[]): NormalizedBatch {
  const items: WatchlistItem[] = [];
  const failures: ValidationFailure[] = [];
  let repairedCount = 0;

  for (const raw of rawItems) {
    const wasFixed = wasRepaired(raw);
    const normalized = normalizeWatchlistItem(raw);
    const validation = validateItem(normalized);
    if (validation != null || normalized == null) {
      failures.push({ reason: validation?.reason ?? "Normalization failed", item: raw });
      continue;
    }
    if (wasFixed) repairedCount++;
    items.push(normalized);
  }

  return { items, failures, repairedCount };
}
