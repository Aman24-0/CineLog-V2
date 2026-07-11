// src/features/sync/backup/BackupService.ts
//
// BackupService — the backup/restore architecture for CineLog.
//
// ARCHITECTURE:
//   The Sync page delegates all backup operations to this service.
//   The service supports:
//     - createBackup()  — snapshot the user's entire library to JSON
//     - exportBackup()  — download the snapshot as a .json file
//     - restoreBackup() — import a snapshot file back into the library
//
//   Future backup types (local, scheduled, encrypted) can be added by
//   implementing the BackupStrategy interface and registering it in
//   BACKUP_STRATEGIES. The Sync page reads the registry and renders a
//   card per strategy — no page changes required.
//
// BACKUP FORMAT:
//   The backup is a versioned JSON document. Version 1 schema:
//   { version: 1, createdAt, library: { watchlist, collections } }
//
// RESTORE SAFETY:
//   Restore is MERGE-by-default (not replace). Existing titles are
//   kept; titles in the backup that aren't in the library are added.
//   The user can review the restore preview before confirming.

import type { WatchlistItem } from "~/shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupDocument {
  version: 1;
  createdAt: string;
  appVersion: string;
  library: {
    watchlist: WatchlistItem[];
    collections?: unknown[]; // future: collection snapshots
  };
}

export interface BackupPreview {
  titles: number;
  ratings: number;
  notes: number;
  collections: number;
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

// Currently available strategies.
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

// Future strategies — shown as "coming soon" on the Sync page.
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
 * Create a backup document from the user's current library.
 *
 * Reads the watchlist from the shared UserLibrary (already loaded at
 * the app root — no extra fetch). Returns a BackupDocument that can
 * be downloaded or stored.
 *
 * NOTE: This function is kept for the API contract. Callers should use
 * createBackupFromWatchlist(watchlist) instead, since this service
 * can't call hooks directly.
 */
export function createBackup(): BackupDocument | null {
  return null;
}

export function createBackupFromWatchlist(watchlist: WatchlistItem[]): BackupDocument {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion: "2.0.0",
    library: {
      watchlist,
      collections: [], // future: fetch collections
    },
  };
}

/**
 * Preview a backup file's contents. Used by the Restore flow to show
 * the user what will be imported before they confirm.
 */
export function previewBackup(doc: BackupDocument): BackupPreview {
  const items = doc?.library?.watchlist ?? [];
  return {
    titles: items.length,
    ratings: items.filter((i) => i.rating != null).length,
    notes: items.filter((i) => i.notes).length,
    collections: doc?.library?.collections?.length ?? 0,
  };
}

/**
 * Trigger a browser download of the backup as a JSON file.
 */
export function exportBackup(doc: BackupDocument): void {
  const filename = `cinelog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
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
 */
export function parseBackupFile(file: File): Promise<BackupDocument> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const parsed = JSON.parse(text) as BackupDocument;
        if (parsed.version !== 1 || !parsed.library?.watchlist) {
          reject(new Error("Invalid backup file format."));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error("Could not read backup file. Make sure it's a valid CineLog backup."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

/**
 * Restore a backup into the user's V2 library.
 *
 * MERGE by default — titles already in the library (matched by TMDB id
 * or title) are skipped. Returns a summary of imported/skipped/failed.
 */
export async function restoreBackup(
  doc: BackupDocument,
  existingWatchlist: WatchlistItem[],
): Promise<RestoreResult> {
  const uid = getCurrentUid();
  if (!uid) {
    throw new Error("You must be signed in to restore a backup.");
  }

  const existingByTmdb = new Set(existingWatchlist.map((w) => String(w.id)));
  const existingByTitle = new Set(
    existingWatchlist.map((w) => (w.title || w.name || "").toLowerCase().trim()).filter(Boolean),
  );

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of doc.library.watchlist) {
    try {
      const tmdbId = String(item.id);
      const titleKey = (item.title || item.name || "").toLowerCase().trim();
      if (existingByTmdb.has(tmdbId) || (titleKey && existingByTitle.has(titleKey))) {
        skipped++;
        continue;
      }
      await createVaultItemInSupabase(uid, item);
      imported++;
    } catch (err) {
      console.error("[restoreBackup] Failed to restore item:", item, err);
      failed++;
    }
  }

  return {
    imported,
    skipped,
    failed,
    summary: `${imported} titles imported, ${skipped} already in your library, ${failed} failed`,
  };
}
