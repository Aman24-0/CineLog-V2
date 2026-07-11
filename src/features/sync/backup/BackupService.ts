// src/features/sync/backup/BackupService.ts
//
// BackupService — the backup/restore architecture for CineLog.
//
// BACKUP FORMATS SUPPORTED:
//   1. Flat JSON array (V1 export format):  [WatchlistItem, ...]
//      This is the format produced by CineLog V1's "Export Vault" feature
//      and the format of real backup files like
//      Cinelog_Vault_Backup_07_07_2026.json (1025 items).
//
//   2. Wrapped JSON document (V2 format):
//      { version: 1, createdAt, library: { watchlist: [...] } }
//      This is the structured format V2 produces via "Create Backup".
//
//   parseBackupFile() auto-detects which format the file is in and
//   normalizes to a flat WatchlistItem[] for the preview + restore.
//
// RESTORE SAFETY:
//   Restore is MERGE-by-default (not replace). Existing titles are
//   kept; titles in the backup that aren't in the library are added.
//   Duplicate detection: TMDB id match (preferred) + title fallback.
//   The user sees a preview before confirming.

import type { WatchlistItem } from "~/shared/types";

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
  /** The flat watchlist array, extracted from either format. */
  items: WatchlistItem[];
  /** Which format was detected. */
  format: "flat-array" | "wrapped-document";
  /** The original wrapped document, if format is "wrapped-document". */
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
}

export interface RestoreResult {
  imported: number;
  skipped: number;
  failed: number;
  summary: string;
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
  {
    id: "create",
    displayName: "Create Backup",
    description: "Snapshot your entire library to a backup file",
    icon: "backup",
    available: true,
  },
  {
    id: "export",
    displayName: "Export Backup",
    description: "Download your backup as a JSON file you can store anywhere",
    icon: "download",
    available: true,
  },
  {
    id: "restore",
    displayName: "Restore Backup",
    description: "Import titles from a previous backup file",
    icon: "restore",
    available: true,
  },
];

export const FUTURE_BACKUP_STRATEGIES: BackupStrategy[] = [
  {
    id: "scheduled",
    displayName: "Scheduled Backups",
    description: "Automatic weekly backups to keep your library safe",
    icon: "schedule",
    available: false,
    comingSoonLabel: "Coming soon",
  },
  {
    id: "encrypted",
    displayName: "Encrypted Backups",
    description: "Password-protected backups for sensitive libraries",
    icon: "lock",
    available: false,
    comingSoonLabel: "Coming soon",
  },
  {
    id: "cloud",
    displayName: "Cloud Backup Storage",
    description: "Store backups in your own cloud drive (Drive, Dropbox, iCloud)",
    icon: "cloud_upload",
    available: false,
    comingSoonLabel: "Coming soon",
  },
];

// ---------------------------------------------------------------------------
// Core backup operations
// ---------------------------------------------------------------------------

import { getCurrentUid } from "~/shared/hooks/useAuth";
import { createVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";

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
  // Export as a flat array — the V1-compatible format.
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
 * Auto-detects the format:
 *   - Flat array: [WatchlistItem, ...]  (V1 export)
 *   - Wrapped:    { version, library: { watchlist } }  (V2 export)
 *
 * Returns a ParsedBackup with a normalized flat items array.
 */
export function parseBackupFile(file: File): Promise<ParsedBackup> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const parsed = JSON.parse(text);

        // Format 1: Flat array of WatchlistItems.
        // This is the V1 export format — the most common real-world backup.
        if (Array.isArray(parsed)) {
          const items = parsed.filter(isValidWatchlistItem);
          if (items.length === 0) {
            reject(new Error("Backup file contains no valid titles."));
            return;
          }
          resolve({ items, format: "flat-array" });
          return;
        }

        // Format 2: Wrapped document with version + library.
        if (parsed && typeof parsed === "object" && parsed.library?.watchlist) {
          const doc = parsed as BackupDocument;
          const items = (doc.library.watchlist || []).filter(isValidWatchlistItem);
          if (items.length === 0) {
            reject(new Error("Backup file contains no valid titles."));
            return;
          }
          resolve({ items, format: "wrapped-document", document: doc });
          return;
        }

        reject(new Error("Unrecognized backup format. Expected a JSON array of titles or a CineLog backup document."));
      } catch {
        reject(new Error("Could not read backup file. Make sure it's a valid JSON file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

/** Type guard: check if a parsed object looks like a valid WatchlistItem. */
function isValidWatchlistItem(obj: unknown): obj is WatchlistItem {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    o.id != null &&
    (o.media_type === "movie" || o.media_type === "tv")
  );
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
    willImport: items.length - duplicates,
  };
}

export interface RestoreCallbacks {
  onProgress: (processed: number, total: number, imported: number, skipped: number, failed: number) => void;
}

/**
 * Restore a parsed backup into the user's V2 library.
 *
 * MERGE by default — titles already in the library (matched by TMDB id
 * or title) are skipped. Returns a summary of imported/skipped/failed.
 *
 * Reports progress via callbacks so the UI can show a progress bar for
 * large restores (e.g. 1000+ titles).
 */
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
  const total = parsed.items.length;

  for (let i = 0; i < total; i++) {
    const item = parsed.items[i];
    try {
      const tmdbId = String(item.id);
      const titleKey = (item.title || item.name || "").toLowerCase().trim();
      if (existingByTmdb.has(tmdbId) || (titleKey && existingByTitle.has(titleKey))) {
        skipped++;
      } else {
        await createVaultItemInSupabase(uid, item);
        imported++;
      }
    } catch (err) {
      console.error("[restoreBackup] Failed to restore item:", item, err);
      failed++;
    }

    // Report progress every item (or every 10 for very large restores).
    if (callbacks) {
      if (total <= 100 || i % 10 === 0 || i === total - 1) {
        callbacks.onProgress(i + 1, total, imported, skipped, failed);
      }
    }
  }

  return {
    imported,
    skipped,
    failed,
    summary: `${imported} titles imported, ${skipped} already in your library, ${failed} failed`,
  };
}
