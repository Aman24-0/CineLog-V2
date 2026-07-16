// src/features/sync/backup/BackupService.ts
//
// BackupService — the backup/restore architecture for CineLog.
//
// This service is the SINGLE entry point for backup creation, export,
// parsing, and restore. All format detection + normalization is
// delegated to normalizeBackup.ts (the Universal Normalization Layer).
//
// SUPPORTED FORMATS (auto-detected):
//   - V2 wrapped:  { version, library: { watchlist: [...] } }
//   - V1 flat array:  [...items]
//   - Future wrappers: { data: [...] }, { items: [...] }, { watchlist: [...] },
//     { library: [...] }, { vault: [...] }, { movies: [...] }, etc.
//
// NORMALIZATION PIPELINE (per item):
//   raw → mapLegacyFields → normalizeStatus → normalizeRating →
//   normalizeDates → normalizeProgress → repairMissingFields →
//   validateItem → valid WatchlistItem
//
// See normalizeBackup.ts for the full normalization logic.
//

import type { WatchlistItem } from "~/shared/types";
import {
  detectBackupFormat, extractRawItems, normalizeBatch,
  type BackupFormat,
} from "./normalizeBackup";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wrapped V2 backup document. */
export interface BackupDocument {
  version: 1;
  createdAt: string;
  appVersion: string;
  library: {
    watchlist: WatchlistItem[];
    collections?: unknown[];
  };
}

/** A parsed backup — normalized to a flat watchlist regardless of input format. */
export interface ParsedBackup {
  /** The normalized, valid items ready for import. */
  items: WatchlistItem[];
  /** Which format was detected. */
  format: BackupFormat;
  /** Items that failed validation (with reasons). */
  failures: { reason: string; item: unknown }[];
  /** Count of items that were repaired (missing fields filled in). */
  repairedCount: number;
  /** The original wrapped document, if format is "wrapped-v2". */
  document?: BackupDocument;
}

export interface BackupPreview {
  titles: number;
  movies: number;
  series: number;
  ratings: number;
  notes: number;
  completed: number;
  watching: number;
  planned: number;
  collections: number;
  /** Titles that already exist in the user's library (will be skipped). */
  duplicates: number;
  /** Total titles that will actually be added (after dedup). */
  willImport: number;
  /** Items that were repaired during normalization. */
  repaired: number;
  /** Items that failed validation and will be skipped. */
  failed: number;
}

export interface RestoreResult {
  imported: number;
  skipped: number;
  failed: number;
  repaired: number;
  duplicates: number;
  summary: string;
  /** Per-failure reasons for logging/debugging. */
  failureLog: { reason: string; title?: string }[];
}

// ---------------------------------------------------------------------------
// BackupStrategy — plugin contract for different backup types
// ---------------------------------------------------------------------------

export interface BackupStrategy {
  id: string;
  displayName: string;
  description: string;
  icon: string;
  available: boolean;
  comingSoonLabel?: string;
}

// NOTE: "Create Backup" (in-memory snapshot) and "Restore Backup" were
// removed because they duplicated "Export Backup" and "Import from JSON"
// respectively. The sync page now has a clean 2+2 structure:
//   IMPORT  → Import from JSON  +  Import from CSV
//   EXPORT  → Export as JSON    +  Export as CSV
export const BACKUP_STRATEGIES: BackupStrategy[] = [
  { id: "export",  displayName: "Export as JSON",  description: "Download your full library as a .json backup file", icon: "download", available: true },
];

export const FUTURE_BACKUP_STRATEGIES: BackupStrategy[] = [
  { id: "scheduled", displayName: "Scheduled Backups",    description: "Automatic weekly backups to keep your library safe",            icon: "schedule",     available: false, comingSoonLabel: "Coming soon" },
  { id: "encrypted", displayName: "Encrypted Backups",    description: "Password-protected backups for sensitive libraries",           icon: "lock",         available: false, comingSoonLabel: "Coming soon" },
  { id: "cloud",     displayName: "Cloud Backup Storage", description: "Store backups in your own cloud drive (Drive, Dropbox, iCloud)", icon: "cloud_upload", available: false, comingSoonLabel: "Coming soon" },
];

// ---------------------------------------------------------------------------
// Core backup operations
// ---------------------------------------------------------------------------

import { getCurrentUid } from "~/shared/hooks/useAuth";
import { upsertVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";
import { getVaultRepository, type CreateVaultItemPayload, type VaultStatus } from "~/lib/supabase/repositories";
import { STATUS_TO_DB } from "~/shared/utils/vaultStatus";

/**
 * Build a wrapped BackupDocument from the user's current watchlist.
 * Used by "Create Backup" and "Export Backup".
 */
export function createBackupFromWatchlist(watchlist: WatchlistItem[]): BackupDocument {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion: "2.0.0",
    library: {
      watchlist,
      collections: [],
    },
  };
}

/**
 * Trigger a browser download of the backup as a JSON file.
 *
 * Exports in the flat array format (the V1-compatible format) so the
 * file can be re-imported by both V1 and V2, and is human-readable.
 */
export function exportBackup(doc: BackupDocument): void {
  const filename = `Cinelog_Vault_Backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}.json`;
  const data = doc.library.watchlist;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parse a backup file from a File object (from <input type="file">).
 *
 * AUTO-DETECTS the format:
 *   - Flat array: [WatchlistItem, ...]
 *   - Wrapped V2: { version, library: { watchlist } }
 *   - Future wrappers: { data }, { items }, { watchlist }, { library }, { vault }, { movies }
 *
 * Runs every item through the normalization pipeline:
 *   mapLegacyFields → normalizeStatus → normalizeRating → normalizeDates →
 *   repairMissingFields → validateItem
 *
 * Returns a ParsedBackup with valid items + failure details + repair count.
 *
 * ── RESOURCE EXHAUSTION PROTECTION ──────────────────────────────────
 * Enforces two limits to prevent abuse via oversized or mass-import
 * backups:
 *   MAX_BACKUP_FILE_SIZE (50 MB) — rejects files larger than 50MB.
 *     A typical 1000-item backup is ~800KB. 50MB allows very large
 *     legitimate libraries while blocking memory-exhaustion attacks.
 *   MAX_BACKUP_ITEMS (10000) — rejects backups with more than 10,000
 *     items. The batch upsert sends 100 items per request, so 10k items
 *     = 100 Supabase requests — within the 500/min rate limit. Larger
 *     imports would exhaust the rate limit and could be used for DoS.
 */
const MAX_BACKUP_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_BACKUP_ITEMS = 10000;

export function parseBackupFile(file: File): Promise<ParsedBackup> {
  return new Promise((resolve, reject) => {
    // 0. Validate file size BEFORE reading (prevents memory exhaustion).
    if (file.size > MAX_BACKUP_FILE_SIZE) {
      reject(new Error(
        `Backup file is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed is ${MAX_BACKUP_FILE_SIZE / 1024 / 1024} MB.`,
      ));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const parsed = JSON.parse(text);

        // 1. Detect format.
        const format = detectBackupFormat(parsed);
        if (format === "unknown") {
          reject(new Error("Unrecognized backup format. Expected a JSON array of titles or a CineLog backup document."));
          return;
        }

        // 2. Extract the raw items array.
        const rawItems = extractRawItems(parsed, format);
        if (rawItems.length === 0) {
          reject(new Error("Backup file contains no titles."));
          return;
        }

        // 2b. Enforce item count limit (prevents mass-import DoS).
        if (rawItems.length > MAX_BACKUP_ITEMS) {
          reject(new Error(
            `Backup contains ${rawItems.length} titles — maximum allowed is ${MAX_BACKUP_ITEMS}. Please split your backup into smaller files.`,
          ));
          return;
        }

        // 3. Normalize + validate every item.
        const batch = normalizeBatch(rawItems);

        // 4. Build the result.
        resolve({
          items: batch.items,
          format,
          failures: batch.failures,
          repairedCount: batch.repairedCount,
          document: format === "wrapped-v2" ? (parsed as BackupDocument) : undefined,
        });
      } catch {
        reject(new Error("Could not read backup file. Make sure it's a valid JSON file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

/**
 * Preview a parsed backup's contents. Used by the Restore flow to show
 * the user what will be imported before they confirm.
 *
 * Also detects duplicates against the user's existing watchlist.
 */
export function previewBackup(parsed: ParsedBackup, existingWatchlist: WatchlistItem[]): BackupPreview {
  const items = parsed.items;
  const existingByTmdb = new Set(existingWatchlist.map((w) => String(w.id)));
  const existingByTitle = new Set(
    existingWatchlist
      .map((w) => (w.title || w.name || "").toLowerCase().trim())
      .filter(Boolean),
  );

  let duplicates = 0;
  for (const item of items) {
    const tmdbId = String(item.id);
    const titleKey = (item.title || item.name || "").toLowerCase().trim();
    if (existingByTmdb.has(tmdbId) || (titleKey && existingByTitle.has(titleKey))) {
      duplicates++;
    }
  }

  return {
    titles: items.length,
    movies: items.filter((i) => i.media_type === "movie").length,
    series: items.filter((i) => i.media_type === "tv").length,
    ratings: items.filter((i) => i.rating != null && i.rating > 0).length,
    notes: items.filter((i) => i.notes && i.notes.trim().length > 0).length,
    completed: items.filter((i) => i.status === "Completed").length,
    watching: items.filter((i) => i.status === "Watching").length,
    planned: items.filter((i) => i.status === "Planned" || i.status === "Plan to Watch").length,
    collections: parsed.document?.library?.collections?.length ?? 0,
    duplicates,
    // With upsert strategy, ALL items get written — duplicates are UPDATED,
    // not skipped. So willImport = total titles.
    willImport: items.length,
    repaired: parsed.repairedCount,
    failed: parsed.failures.length,
  };
}

export interface RestoreCallbacks {
  onProgress: (processed: number, total: number, imported: number, skipped: number, failed: number) => void;
  /** Optional: called when the user cancels — the loop stops after the current item. */
  shouldCancel?: () => boolean;
}

/**
 * Restore a parsed backup into the user's V2 library.
 *
 * UPSERT strategy — every item from the backup is written to the vault.
 * If an item already exists (same tmdb_id + media_type), it is UPDATED
 * with the backup's data (status, rating, notes, watch dates, season
 * dates, rewatch tracking). If it doesn't exist, it is inserted.
 *
 * This means:
 *   - No more "10 failed" from unique-constraint violations on items
 *     that were already in the vault with a different media_type.
 *   - No more "4 duplicates" skipped — existing items get refreshed
 *     with the backup's data instead.
 *   - ALL user-owned fields (watchDate, seasonDates, rewatchCount,
 *     rewatchDates, seasonRewatchCount, seasonRewatchDates, createdAt,
 *     completedAt, lastActivityAt) are preserved.
 *
 * NEVER stops because one item fails — continues with remaining items.
 *
 * Reports progress via callbacks so the UI can show a progress bar for
 * large restores (e.g. 1000+ titles). Supports cancellation.
 *
 * RESILIENCE: 30ms delay between writes keeps us under Supabase's
 * rate limit. Transient failures (429, network blips, 5xx) are
 * collected during the first pass and retried with exponential
 * backoff (200ms → 500ms → 1500ms → 4000ms) in a second pass at the
 * end. Permanent errors (RLS, constraint violations, invalid data)
 * are reported immediately and never retried.
 */

/**
 * Sleep helper for rate-limit-friendly delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Is the given error a transient network/rate-limit error that should be
 * retried? Returns true for:
 *   - Supabase rate-limit responses (429, "rate limit", "Too many requests")
 *   - Network errors (Failed to fetch, NetworkError, ERR_*)
 *   - 5xx server errors (matched by HTTP status code, NOT substring)
 *   - Connection reset / timeout errors
 *
 * Returns false for permanent errors (constraint violations, invalid data,
 * RLS denials, etc.) — retrying those would never succeed.
 *
 * ── BUG HISTORY ────────────────────────────────────────────────────
 * Previously this function used `haystack.includes("500")` /
 * `"502"` / `"503"` / `"504"` to detect 5xx HTTP errors. That substring
 * match was catastrophically broken: it also matched PostgreSQL SQLSTATE
 * codes that contain those digit sequences — most notably:
 *
 *   23503 (foreign_key_violation) → contains "503" → misclassified as
 *     "503 Service Unavailable" (transient). FK violations are PERMANENT.
 *
 *   23502 (not_null_violation) → contains "502" → misclassified as
 *     "502 Bad Gateway" (transient). NOT NULL violations are PERMANENT.
 *
 * When a batch upsert failed with one of these permanent errors, the
 * entire batch was put in the transient-retry queue instead of the
 * per-item fallback. The result: `imported=0, failed=0` and a stuck
 * progress bar (the second-pass retry loop has no progress reporting,
 * and per-item exponential backoff takes 19+ minutes for 1029 items).
 *
 * The fix: match 5xx errors by HTTP `status` field (exact number),
 * never by substring. SQLSTATE codes are never 3-digit HTTP statuses
 * and should never be tested with `includes()`.
 */
function isTransientError(err: unknown): boolean {
  const msg = String(extractErrorMessage(err)).toLowerCase();
  const status = Number(extractErrorStatus(err) ?? 0);
  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("over_request_limit") ||
    msg.includes("rate_limit") ||
    status === 429 ||
    msg.includes("429") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("network request failed") ||
    msg.includes("err_") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("connection reset") ||
    msg.includes("connection refused") ||
    msg.includes("socket hang up") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("epipe") ||
    // 5xx server errors — matched by HTTP status code (exact number),
    // NOT by substring. Substring matching caused SQLSTATE codes like
    // 23503 (FK violation) and 23502 (NOT NULL violation) to be
    // misclassified as transient 5xx errors.
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes("service unavailable") ||
    msg.includes("bad gateway") ||
    msg.includes("gateway timeout") ||
    msg.includes("internal server error")
  ) {
    return true;
  }
  return false;
}

/**
 * Defensive error → string conversion. NEVER returns "[object Object]" —
 * always extracts the useful message from any error shape.
 *
 * Handles:
 *   - Error instances (uses .message)
 *   - Supabase / PostgREST objects ({ message, code, details, hint })
 *   - Plain objects (JSON.stringify fallback)
 *   - Primitives (string, number)
 *
 * Used to build the failure log entries shown to the user.
 */
function extractErrorMessage(err: unknown): string {
  if (err == null) return "";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean") return String(err);
  if (typeof err === "object") {
    const e = err as { message?: unknown; reason?: unknown; error?: unknown };
    if (typeof e.message === "string" && e.message.length > 0) return e.message;
    if (typeof e.reason === "string" && e.reason.length > 0) return e.reason;
    if (typeof e.error === "string" && e.error.length > 0) return e.error;
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error";
    }
  }
  return String(err);
}

/** Extract a Postgres / PostgREST error code (e.g. "42703", "23505"). */
function extractErrorCode(err: unknown): string | number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const e = err as { code?: unknown };
  if (typeof e.code === "string") return e.code;
  if (typeof e.code === "number") return e.code;
  return undefined;
}

/** Extract an HTTP status code if present (Supabase sometimes attaches one). */
function extractErrorStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const e = err as { status?: unknown };
  if (typeof e.status === "number") return e.status;
  return undefined;
}

/**
 * Build a detailed, human-readable reason string for an error.
 *
 * Used by the import failure log so the user can see WHY each item failed
 * instead of "[object Object]".
 */
function buildFailureReason(err: unknown): string {
  const msg = extractErrorMessage(err);
  const code = extractErrorCode(err);
  if (code) {
    return `[${code}] ${msg || "Database error"}`;
  }
  return msg || "Unknown error";
}

/**
 * Upsert a single vault item with retry on transient errors.
 * Wraps upsertVaultItemInSupabase with exponential backoff so per-item
 * fallback during restore doesn't cascade into hundreds of 429 failures.
 */
async function upsertVaultItemInSupabaseWithRetry(uid: string, item: WatchlistItem): Promise<void> {
  const delays = [0, 200, 500, 1500];
  let lastErr: unknown;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      await upsertVaultItemInSupabase(uid, item);
      return;
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt === delays.length - 1) throw err;
      await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}

/**
 * Convert a WatchlistItem to the CreateVaultItemPayload that the vault
 * repository expects. Mirrors the mapping in vaultReadAdapter's
 * upsertVaultItemInSupabase so the batch path persists the SAME fields
 * (rewatchCount, rewatchDates, seasonDates, createdAt, completedAt,
 * lastActivityAt, progressMinutes) as the single-item path.
 *
 * ── DB CHECK CONSTRAINT AWARENESS ─────────────────────────────────
 * The `vault` table has two media-type-specific CHECK constraints:
 *
 *   vault_movie_no_series_cols:
 *     media_type <> 'movie' OR (started_at IS NULL AND completed_at IS NULL)
 *     → Movies MUST NOT have started_at or completed_at.
 *
 *   vault_tv_no_movie_cols:
 *     media_type <> 'tv' OR (progress_minutes IS NULL AND watched_on IS NULL)
 *     → TV MUST NOT have progress_minutes or watched_on.
 *
 * To respect these, we partition the date/progress fields by media_type:
 *   • Movies: use `watchedOn` (when watched) + `progressMinutes` (player progress).
 *   • TV:     use `startedAt` (when first watched) + `completedAt` (when finished).
 *
 * V1's `watchDate` field is overloaded — for movies it's the watch date,
 * for TV it's derived from the latest seasonDates.end. We map both
 * correctly below so imports no longer violate the CHECK constraints
 * (previously ~25% of V1 imports failed with "violates check constraint
 * vault_movie_no_series_cols" / "vault_tv_no_movie_cols").
 */
function watchlistItemToBatchPayload(uid: string, item: WatchlistItem): CreateVaultItemPayload {
  const isMovie = item.media_type === "movie";
  const isTV = item.media_type === "tv";
  const isCompleted = item.status === "Completed";
  const watchDate = item.watchDate;

  // Movies use watched_on + progress_minutes.
  // TV uses started_at + completed_at.
  // (Setting both sides for one media_type would violate the CHECK
  // constraints and the entire batch upsert would fail atomically.)
  const watchedOn = isMovie ? watchDate : undefined;
  const progressMinutes = isMovie && typeof item.runtime === "number" && item.watchProgress && item.watchProgress.duration > 0
    ? Math.min(item.watchProgress.currentTime || 0, item.watchProgress.duration)
    : undefined;
  const startedAt = isTV ? watchDate : undefined;
  const completedAt = isTV && isCompleted && watchDate ? watchDate : undefined;

  return {
    userId: uid,
    tmdbId: Number(item.id),
    mediaType: item.media_type,
    status: (STATUS_TO_DB[item.status ?? "Planned"] ?? "planned") as VaultStatus,
    rating: item.rating,
    notes: item.notes,
    watchedOn,
    rewatchCount: item.rewatchCount,
    rewatchDates: item.rewatchDates,
    seasonDates: item.seasonDates,
    seasonRewatchCount: item.seasonRewatchCount,
    seasonRewatchDates: item.seasonRewatchDates,
    progressMinutes,
    startedAt,
    completedAt,
    createdAt:
      typeof item.addedAt === "string"
        ? item.addedAt
        : item.addedAt && typeof item.addedAt === "object" && "seconds" in item.addedAt
          ? new Date(item.addedAt.seconds * 1000).toISOString()
          : undefined,
    lastActivityAt: item.updatedAt ?? (typeof item.addedAt === "string" ? item.addedAt : undefined),
  };
}

/** Chunk an array into batches of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function restoreBackup(
  parsed: ParsedBackup,
  existingWatchlist: WatchlistItem[],
  callbacks?: RestoreCallbacks,
): Promise<RestoreResult> {
  const uid = getCurrentUid();
  if (!uid) {
    throw new Error("You must be signed in to restore a backup.");
  }

  const existingByTmdb = new Set(existingWatchlist.map((w) => String(w.id)));
  const existingByTitle = new Set(
    existingWatchlist
      .map((w) => (w.title || w.name || "").toLowerCase().trim())
      .filter(Boolean),
  );

  let imported = 0;
  const skipped = 0;
  let failed = 0;
  let duplicates = 0;
  const failureLog: { reason: string; title?: string }[] = [];
  const total = parsed.items.length;

  // ── BATCH UPSERT STRATEGY ──────────────────────────────────────────
  // Chunk the items into batches of BATCH_SIZE (100) and send each batch
  // as a SINGLE Supabase upsert request. For 1029 items this means ~11
  // network calls instead of 1029, eliminating the rate-limit failures
  // that plagued the per-item approach.
  //
  // BATCH_SIZE = 100 keeps each request payload under ~200 KB even for
  // items with rich metadata (seasonDates, castList, etc.).
  const BATCH_SIZE = 100;
  const batches = chunk(parsed.items, BATCH_SIZE);

  // Track transient-failed batches for a second-pass retry at the end.
  const transientFailedBatches: { items: WatchlistItem[]; batchStartIdx: number }[] = [];

  let processed = 0;
  for (let b = 0; b < batches.length; b++) {
    if (callbacks?.shouldCancel?.()) break;

    const batchItems = batches[b];
    const batchStartIdx = processed;

    // Pre-count duplicates for items in this batch (for accurate reporting).
    // The batch upsert itself doesn't tell us which rows were inserts vs
    // updates — both count as "imported" since the upsert succeeds either way.
    let batchDuplicates = 0;
    for (const item of batchItems) {
      const tmdbId = String(item.id);
      const titleKey = (item.title || item.name || "").toLowerCase().trim();
      if (existingByTmdb.has(tmdbId) || (!!titleKey && existingByTitle.has(titleKey))) {
        batchDuplicates++;
      }
      // Track these ids so we don't re-count duplicates in a later batch
      // of the same restore (in case the same item appears twice).
      existingByTmdb.add(tmdbId);
      if (titleKey) existingByTitle.add(titleKey);
    }

    // Build the batch payload.
    const payloads = batchItems.map((item) => watchlistItemToBatchPayload(uid, item));

    try {
      const repo = getVaultRepository();
      const { error } = await repo.upsertVaultItemsBatch(payloads);
      if (error) throw error;

      // Batch succeeded — every item in it counts as imported.
      imported += batchItems.length;
      duplicates += batchDuplicates;
    } catch (err) {
      const detailedReason = buildFailureReason(err);

      if (isTransientError(err)) {
        // Save for second-pass retry at the end.
        transientFailedBatches.push({ items: batchItems, batchStartIdx });
        console.warn(
          `[restoreBackup] Batch ${b + 1}/${batches.length} transient failure (${batchItems.length} items, will retry): ${detailedReason}`,
        );
      } else {
        // Permanent failure — fall back to per-item upsert so we can salvage
        // the items in this batch that ARE valid. The bad ones get logged
        // individually so the user can see exactly what failed.
        console.error(
          `[restoreBackup] Batch ${b + 1}/${batches.length} permanent failure — retrying items individually: ${detailedReason}`,
          { err },
        );
        let itemIdx = 0;
        for (const item of batchItems) {
          // Check cancel BEFORE each item so the cancel button feels
          // responsive — even mid-batch-fallback the user can stop.
          if (callbacks?.shouldCancel?.()) break;
          itemIdx++;
          try {
            await upsertVaultItemInSupabaseWithRetry(uid, item);
            imported++;
          } catch (itemErr) {
            const iReason = buildFailureReason(itemErr);
            failed++;
            failureLog.push({
              reason: iReason,
              title: item.title || item.name || undefined,
            });
          }
          // Report progress every 5 items so the UI updates frequently
          // during per-item fallback (otherwise a 100-item batch shows
          // no progress for ~5 seconds while it grinds through items).
          if (itemIdx % 5 === 0 && callbacks) {
            callbacks.onProgress(processed + itemIdx, total, imported, skipped, failed);
          }
          // Small delay between per-item upserts to stay under Supabase's
          // free-tier rate limit (~2 req/sec sustained). Without this, 100
          // sequential requests in a few seconds triggers 429 errors.
          await sleep(50);
        }
      }
    }

    processed += batchItems.length;

    // Small delay between batches. 100 items per request = ~10 batches for
    // 1000 items. Even with a 300ms delay between batches, the whole
    // restore takes ~3 seconds + network RTT — well within Supabase's
    // 500 req/min limit (we're only making ~10-15 requests total).
    if (batches.length > 5) {
      await sleep(300);
    }

    // Report progress per batch.
    if (callbacks) {
      callbacks.onProgress(processed, total, imported, skipped, failed);
    }
  }

  // ── SECOND PASS: retry transient-failed batches ──────────────────
  // These are batches that failed due to rate-limiting or network blips
  // during the first pass. The main rush of writes is over now, so we
  // retry with the same batch approach — most should succeed.
  //
  // SAFETY VALVE: If ALL batches went to the transient queue (highly
  // unusual for a real transient failure), it's almost certainly a
  // systematic error that was misclassified as transient. Skip the
  // second-pass batch retry and go straight to per-item fallback so the
  // user sees actual failure reasons instead of a 5-minute hang.
  const allBatchesTransient = transientFailedBatches.length > 0
    && transientFailedBatches.length === batches.length;

  if (allBatchesTransient) {
    console.warn(
      `[restoreBackup] ALL ${transientFailedBatches.length} batches failed transiently in first pass — ` +
      `this is unusual; skipping batch retry and going straight to per-item fallback ` +
      `(if errors are actually permanent, per-item retry will report them immediately).`,
    );
  }

  if (transientFailedBatches.length > 0 && !allBatchesTransient) {
    if (import.meta.env?.DEV) {
      console.log(
        `[restoreBackup] Retrying ${transientFailedBatches.length} transient-failed batches...`,
      );
    }
    for (const { items } of transientFailedBatches) {
      if (callbacks?.shouldCancel?.()) break;
      const payloads = items.map((item) => watchlistItemToBatchPayload(uid, item));
      try {
        const repo = getVaultRepository();
        // Retry each batch with one retry — if it fails again, fall back to
        // per-item upsert so we salvage what we can.
        const { error } = await repo.upsertVaultItemsBatch(payloads);
        if (error) throw error;
        imported += items.length;
        // Report progress so the UI doesn't look frozen during the second pass.
        if (callbacks) {
          callbacks.onProgress(processed, total, imported, skipped, failed);
        }
      } catch (err) {
        // Batch retry failed — try per-item as a last resort.
        console.warn(
          `[restoreBackup] Batch retry failed — falling back to per-item upsert for ${items.length} items`,
          err,
        );
        let itemIdx = 0;
        for (const item of items) {
          // Check cancel BEFORE each item so the cancel button is
          // responsive even during the second-pass retry loop.
          if (callbacks?.shouldCancel?.()) break;
          itemIdx++;
          try {
            await upsertVaultItemInSupabaseWithRetry(uid, item);
            imported++;
          } catch (itemErr) {
            const iReason = buildFailureReason(itemErr);
            failed++;
            failureLog.push({
              reason: iReason,
              title: item.title || item.name || undefined,
            });
          }
          // Report progress every 5 items so the UI updates during the
          // second-pass per-item fallback (which can take minutes for
          // large batches). Without this, the progress bar stays frozen
          // at the first-pass value and the user thinks the app hung.
          if (itemIdx % 5 === 0 && callbacks) {
            callbacks.onProgress(processed, total, imported, skipped, failed);
          }
          await sleep(50);
        }
      }
      await sleep(500);
    }
  } else if (allBatchesTransient) {
    // All batches failed transiently — go straight to per-item fallback
    // WITHOUT retrying the batch first (the batch retry would just fail
    // again with the same error, wasting time). This ensures the user
    // sees failure reasons quickly instead of waiting for a 5-minute
    // batch retry that produces no visible progress.
    if (import.meta.env?.DEV) {
      console.log(
        `[restoreBackup] Skipping batch retry — going straight to per-item fallback for ${transientFailedBatches.reduce((n, b) => n + b.items.length, 0)} items.`,
      );
    }
    for (const { items } of transientFailedBatches) {
      if (callbacks?.shouldCancel?.()) break;
      let itemIdx = 0;
      for (const item of items) {
        if (callbacks?.shouldCancel?.()) break;
        itemIdx++;
        try {
          await upsertVaultItemInSupabaseWithRetry(uid, item);
          imported++;
        } catch (itemErr) {
          const iReason = buildFailureReason(itemErr);
          failed++;
          failureLog.push({
            reason: iReason,
            title: item.title || item.name || undefined,
          });
        }
        if (itemIdx % 5 === 0 && callbacks) {
          callbacks.onProgress(processed, total, imported, skipped, failed);
        }
        await sleep(50);
      }
    }
  }

  // Final progress report so the UI shows the complete counts before
  // the result panel replaces the progress bar.
  if (callbacks) {
    callbacks.onProgress(processed, total, imported, skipped, failed);
  }

  // Build the summary string.
  const parts: string[] = [`${imported} imported`];
  if (duplicates > 0) parts.push(`${duplicates} updated`);
  if (parsed.repairedCount > 0) parts.push(`${parsed.repairedCount} repaired`);
  if (failed > 0) parts.push(`${failed} failed`);

  return {
    imported,
    skipped,
    failed,
    repaired: parsed.repairedCount,
    duplicates,
    summary: parts.join(", "),
    failureLog,
  };
}
