// src/features/sync/backup/BackupService.ts
//
// BackupService — the backup/restore architecture for CineLog.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 8 CHUNK 3 — FILE SPLIT
// ─────────────────────────────────────────────────────────────────────
// This file was previously 1207 LOC. As of Phase 8 Chunk 3 it has been
// split into focused sub-modules and is now a PUBLIC FACADE that
// re-exports the public API. Consumers can keep importing from
// "./BackupService" unchanged — all existing exports continue to work:
//
//   • Types            → ./types.ts
//   • Constants        → ./constants.ts
//   • Error utilities  → ./errorUtils.ts
//   • Batch payload    → ./batchPayload.ts
//   • Library fetchers → ./fetchers.ts
//   • Restore loop     → ./restore.ts
//   • Export / parse / preview → ./exporter.ts
//
// Why: the restore loop alone was ~270 LOC of batch + retry + per-item
// fallback logic; the type definitions were ~120 LOC; the fetchers were
// ~150 LOC. Splitting them makes each piece reviewable + testable in
// isolation, and lets the type-only imports avoid pulling in Supabase.
// ─────────────────────────────────────────────────────────────────────
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

// ── Types ────────────────────────────────────────────────────────────
export type {
  BackupDocument,
  BackupCollection,
  BackupCollectionEntry,
  BackupPreset,
  BackupEpisodeProgress,
  ParsedBackup,
  BackupPreview,
  RestoreResult,
  RestoreCallbacks,
  BackupStrategy
} from "./types";

// ── Constants ────────────────────────────────────────────────────────
export {
  BACKUP_STRATEGIES,
  FUTURE_BACKUP_STRATEGIES,
  MAX_BACKUP_FILE_SIZE,
  MAX_BACKUP_ITEMS,
  RESTORE_BATCH_SIZE,
  RESTORE_BATCH_DELAY_MS,
  RESTORE_ITEM_DELAY_MS,
  RESTORE_RETRY_BATCH_DELAY_MS,
  TRANSIENT_RETRY_DELAYS_MS
} from "./constants";

// ── Error utilities ──────────────────────────────────────────────────
export {
  isTransientError,
  extractErrorMessage,
  extractErrorCode,
  extractErrorStatus,
  buildFailureReason,
  sleep
} from "./errorUtils";

// ── Batch payload helpers ────────────────────────────────────────────
export {
  watchlistItemToBatchPayload,
  upsertVaultItemInSupabaseWithRetry,
  buildBatchPayloads,
  upsertBatch,
  chunk
} from "./batchPayload";

// ── Library fetchers ─────────────────────────────────────────────────
export {
  fetchCollectionsForBackup,
  fetchPresetsForBackup,
  fetchEpisodeProgressForBackup
} from "./fetchers";

// ── Export / parse / preview ─────────────────────────────────────────
export {
  createBackupFromWatchlist,
  exportBackup,
  parseBackupFile,
  previewBackup
} from "./exporter";

// ── Restore ──────────────────────────────────────────────────────────
export { restoreBackup } from "./restore";
