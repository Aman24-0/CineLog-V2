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

export const BACKUP_STRATEGIES: BackupStrategy[] = [
  { id: "create",  displayName: "Create Backup",  description: "Snapshot your entire library to a backup file",     icon: "backup",   available: true },
  { id: "export",  displayName: "Export Backup",  description: "Download your backup as a JSON file you can store anywhere", icon: "download", available: true },
  { id: "restore", displayName: "Restore Backup", description: "Import titles from a previous backup file",         icon: "restore",  available: true },
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
import { createVaultItemInSupabase, upsertVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";

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
 */
export function parseBackupFile(file: File): Promise<ParsedBackup> {
  return new Promise((resolve, reject) => {
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
 *   - 5xx server errors
 *   - Connection reset / timeout errors
 *
 * Returns false for permanent errors (constraint violations, invalid data,
 * RLS denials, etc.) — retrying those would never succeed.
 */
function isTransientError(err: unknown): boolean {
  const msg = String(
    (err instanceof Error ? err.message : err) ?? "",
  ).toLowerCase();
  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
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
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
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
 * Run a single upsert with retry-on-transient-error.
 *
 * Strategy:
 *   - Up to 4 attempts total (1 initial + 3 retries)
 *   - Exponential backoff: 200ms → 500ms → 1500ms → 4000ms
 *   - Only retries on transient errors (network/rate-limit/5xx)
 *   - Permanent errors (constraint violations, RLS, invalid data) throw
 *     immediately on the first attempt
 *
 * Between successful writes, the caller adds a small delay to avoid
 * triggering Supabase's rate limiter in the first place.
 */
async function upsertWithRetry(
  uid: string,
  item: WatchlistItem,
  maxAttempts = 4,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await upsertVaultItemInSupabase(uid, item);
      return; // success
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err)) {
        // Permanent error — don't retry, throw immediately.
        throw err;
      }
      // Transient error — wait and retry (unless this was the last attempt).
      if (attempt < maxAttempts - 1) {
        const backoffMs = [200, 500, 1500, 4000][attempt] ?? 4000;
        await sleep(backoffMs);
      }
    }
  }
  throw lastErr;
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
  let skipped = 0;
  let failed = 0;
  let duplicates = 0;
  const failureLog: { reason: string; title?: string }[] = [];
  const total = parsed.items.length;

  // Track transient failures so we can retry them all in a second pass
  // after the main loop completes. This way the user sees progress fast
  // (most items succeed on the first pass), and only the failed ones
  // get the slow retry treatment at the end.
  const transientFailures: { item: WatchlistItem; wasExisting: boolean }[] = [];

  for (let i = 0; i < total; i++) {
    // Check for cancellation.
    if (callbacks?.shouldCancel?.()) break;

    const item = parsed.items[i];
    const tmdbId = String(item.id);
    const titleKey = (item.title || item.name || "").toLowerCase().trim();
    const wasExisting =
      existingByTmdb.has(tmdbId) || (!!titleKey && existingByTitle.has(titleKey));

    try {
      await upsertVaultItemInSupabase(uid, item);

      if (wasExisting) {
        duplicates++; // counted as "updated" — still a successful write
      }
      imported++; // every successful upsert counts as imported

      // Track this id so we don't re-process it if it appears again in
      // the same backup.
      existingByTmdb.add(tmdbId);
      if (titleKey) existingByTitle.add(titleKey);
    } catch (err) {
      if (isTransientError(err)) {
        // Don't count as failed yet — we'll retry at the end.
        transientFailures.push({ item, wasExisting });
      } else {
        console.error("[restoreBackup] Failed to restore item:", item, err);
        failed++;
        const reason = err instanceof Error ? err.message : "Database error";
        const title = item.title || item.name || undefined;
        failureLog.push({ reason, title });
      }
    }

    // Small delay between writes to avoid triggering Supabase's rate
    // limiter. 30ms is enough to keep us under ~30 req/sec, which is
    // well within Supabase free-tier limits. Total added time for
    // 1000 items = ~30 seconds — acceptable for a restore operation.
    if (total > 100) {
      await sleep(30);
    }

    // Report progress — every item for small batches, every 10 for large.
    if (callbacks) {
      if (total <= 100 || i % 10 === 0 || i === total - 1) {
        callbacks.onProgress(i + 1, total, imported, skipped, failed);
      }
    }
  }

  // ---- SECOND PASS: retry transient failures ----
  // These are items that failed due to rate-limiting or network blips
  // during the first pass. We retry them now (with longer backoffs)
  // because the main rush of writes is over and the rate limiter has
  // had time to reset.
  if (transientFailures.length > 0) {
    console.log(
      `[restoreBackup] Retrying ${transientFailures.length} transient failures...`,
    );
    for (const { item, wasExisting } of transientFailures) {
      if (callbacks?.shouldCancel?.()) break;
      try {
        await upsertWithRetry(uid, item);
        if (wasExisting) duplicates++;
        imported++;
      } catch (err) {
        console.error("[restoreBackup] Final retry failed:", item, err);
        failed++;
        const reason = err instanceof Error ? err.message : "Database error";
        const title = item.title || item.name || undefined;
        failureLog.push({ reason, title });
      }
      // Longer delay between retries since we know rate limiting is active.
      await sleep(100);
    }
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
