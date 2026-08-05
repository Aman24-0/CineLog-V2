// src/features/sync/backup/constants.ts
//
// Pure constants for the backup/restore pipeline.
//
// Extracted from BackupService.ts (Phase 8 Chunk 3) so constants can be
// imported by tests + other modules without pulling in the full service.
//
// All consumer-facing constants live here. The BackupService.ts file
// re-exports them so existing imports keep working.

import type { BackupStrategy } from "./types";

// NOTE: "Create Backup" (in-memory snapshot) and "Restore Backup" were
// removed because they duplicated "Export Backup" and "Import from JSON"
// respectively. The sync page now has a clean 2+2 structure:
//   IMPORT  → Import from JSON  +  Import from CSV
//   EXPORT  → Export as JSON    +  Export as CSV
export const BACKUP_STRATEGIES: BackupStrategy[] = [
  {
    id: "export",
    displayName: "Export as JSON",
    description: "Download your full library as a .json backup file",
    icon: "download",
    available: true
  }
];

export const FUTURE_BACKUP_STRATEGIES: BackupStrategy[] = [
  {
    id: "scheduled",
    displayName: "Scheduled Backups",
    description: "Automatic weekly backups to keep your library safe",
    icon: "schedule",
    available: false,
    comingSoonLabel: "Coming soon"
  },
  {
    id: "encrypted",
    displayName: "Encrypted Backups",
    description: "Password-protected backups for sensitive libraries",
    icon: "lock",
    available: false,
    comingSoonLabel: "Coming soon"
  },
  {
    id: "cloud",
    displayName: "Cloud Backup Storage",
    description:
      "Store backups in your own cloud drive (Drive, Dropbox, iCloud)",
    icon: "cloud_upload",
    available: false,
    comingSoonLabel: "Coming soon"
  }
];

/**
 * Maximum allowed backup file size (50 MB).
 *
 * A typical 1000-item backup is ~800KB. 50MB allows very large
 * legitimate libraries while blocking memory-exhaustion attacks.
 */
export const MAX_BACKUP_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Maximum allowed number of items in a backup.
 *
 * The batch upsert sends 100 items per request, so 10k items
 * = 100 Supabase requests — within the 500/min rate limit. Larger
 * imports would exhaust the rate limit and could be used for DoS.
 */
export const MAX_BACKUP_ITEMS = 10000;

/**
 * Batch size for the upsert during restore.
 *
 * BATCH_SIZE = 100 keeps each request payload under ~200 KB even for
 * items with rich metadata (seasonDates, castList, etc.).
 */
export const RESTORE_BATCH_SIZE = 100;

/**
 * Delay between batch upserts during restore (ms).
 *
 * 100 items per request = ~10 batches for 1000 items. Even with a 300ms
 * delay between batches, the whole restore takes ~3 seconds + network RTT
 * — well within Supabase's 500 req/min limit (we're only making ~10-15
 * requests total).
 */
export const RESTORE_BATCH_DELAY_MS = 300;

/**
 * Delay between per-item upserts during the fallback path (ms).
 *
 * Small delay keeps us under Supabase's free-tier rate limit (~2 req/sec
 * sustained). Without this, 100 sequential requests in a few seconds
 * triggers 429 errors.
 */
export const RESTORE_ITEM_DELAY_MS = 50;

/**
 * Delay between transient-failed batch retries in the second pass (ms).
 */
export const RESTORE_RETRY_BATCH_DELAY_MS = 500;

/**
 * Per-item retry backoff schedule for transient errors (ms).
 *
 * Used by `upsertVaultItemInSupabaseWithRetry`. 4 attempts total
 * (0ms, 200ms, 500ms, 1500ms) — the 4th attempt throws if it fails.
 */
export const TRANSIENT_RETRY_DELAYS_MS = [0, 200, 500, 1500];
