// src/features/sync/backup/exporter.ts
//
// Backup export + parse + preview functions.
//
// Extracted from BackupService.ts (Phase 8 Chunk 3) so the export/parse
// pipeline can be unit-tested in isolation.
//
// These functions are the user-facing entry points for "Export Backup"
// (exportBackup + createBackupFromWatchlist) and the parse/preview steps
// of the import flow (parseBackupFile + previewBackup).

import type { WatchlistItem } from "~/shared/types";
import {
  detectBackupFormat,
  extractRawItems,
  normalizeBatch
} from "./normalizeBackup";
import {
  fetchCollectionsForBackup,
  fetchEpisodeProgressForBackup,
  fetchPresetsForBackup
} from "./fetchers";
import { MAX_BACKUP_FILE_SIZE, MAX_BACKUP_ITEMS } from "./constants";
import type { BackupDocument, BackupPreview, ParsedBackup } from "./types";

/**
 * Build a wrapped BackupDocument from the user's current watchlist +
 * collections + presets + episode progress.
 *
 * Phase 1 audit fix: previously this only exported `watchlist` with
 * `collections: []` hardcoded to empty. Now it fetches the user's
 * full library from Supabase so the backup is a complete snapshot.
 *
 * Used by "Create Backup" and "Export Backup".
 *
 * @param watchlist  The current in-memory watchlist (already loaded
 *                   by useUserLibrary — no extra fetch needed).
 * @param userId     The current user's ID. Required for fetching
 *                   collections + presets + episode progress from
 *                   Supabase. If null, only the watchlist is
 *                   exported (degraded mode for signed-out users).
 */
export async function createBackupFromWatchlist(
  watchlist: WatchlistItem[],
  userId: string | null
): Promise<BackupDocument> {
  // Default document — watchlist only. We'll enrich it with
  // collections + presets + episode progress if the user is signed in.
  const doc: BackupDocument = {
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion: "2.0.0",
    library: {
      watchlist,
      collections: [],
      presets: [],
      episodeProgress: []
    }
  };

  if (!userId) {
    // Signed-out user — can't fetch from Supabase. The watchlist is
    // still useful (it might have been built up from localStorage).
    return doc;
  }

  try {
    // Fetch all four data sources in parallel.
    const [collectionsData, presetsData, progressData] = await Promise.all([
      fetchCollectionsForBackup(userId),
      fetchPresetsForBackup(userId),
      fetchEpisodeProgressForBackup(userId, watchlist)
    ]);

    doc.library.collections = collectionsData;
    doc.library.presets = presetsData;
    doc.library.episodeProgress = progressData;
  } catch (err) {
    // Don't fail the whole backup if one fetch fails — the watchlist
    // is still the most important data.
    console.error("[backup] Failed to fetch full library:", err);
  }

  return doc;
}

/**
 * Trigger a browser download of the backup as a JSON file.
 *
 * Phase 1 audit fix: previously this exported only the flat watchlist
 * array (V1-compatible). Now it exports the full wrapped document
 * (version, library with watchlist + collections + presets + episode
 * progress) so nothing is lost.
 *
 * The wrapped format is backward-compatible with the parser in
 * normalizeBackup.ts (detectBackupFormat recognizes "wrapped-v2").
 */
export function exportBackup(doc: BackupDocument): void {
  const filename = `Cinelog_Vault_Backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}.json`;
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: "application/json"
  });
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
export function parseBackupFile(file: File): Promise<ParsedBackup> {
  return new Promise((resolve, reject) => {
    // 0. Validate file size BEFORE reading (prevents memory exhaustion).
    if (file.size > MAX_BACKUP_FILE_SIZE) {
      reject(
        new Error(
          `Backup file is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed is ${MAX_BACKUP_FILE_SIZE / 1024 / 1024} MB.`
        )
      );
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
          reject(
            new Error(
              "Unrecognized backup format. Expected a JSON array of titles or a CineLog backup document."
            )
          );
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
          reject(
            new Error(
              `Backup contains ${rawItems.length} titles — maximum allowed is ${MAX_BACKUP_ITEMS}. Please split your backup into smaller files.`
            )
          );
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
          document:
            format === "wrapped-v2" ? (parsed as BackupDocument) : undefined
        });
      } catch {
        reject(
          new Error(
            "Could not read backup file. Make sure it's a valid JSON file."
          )
        );
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
export function previewBackup(
  parsed: ParsedBackup,
  existingWatchlist: WatchlistItem[]
): BackupPreview {
  const items = parsed.items;
  const existingByTmdb = new Set(existingWatchlist.map((w) => String(w.id)));
  const existingByTitle = new Set(
    existingWatchlist
      .map((w) => (w.title || w.name || "").toLowerCase().trim())
      .filter(Boolean)
  );

  let duplicates = 0;
  for (const item of items) {
    const tmdbId = String(item.id);
    const titleKey = (item.title || item.name || "").toLowerCase().trim();
    if (
      existingByTmdb.has(tmdbId) ||
      (titleKey && existingByTitle.has(titleKey))
    ) {
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
    planned: items.filter(
      (i) => i.status === "Planned" || i.status === "Plan to Watch"
    ).length,
    collections: parsed.document?.library?.collections?.length ?? 0,
    duplicates,
    // With upsert strategy, ALL items get written — duplicates are UPDATED,
    // not skipped. So willImport = total titles.
    willImport: items.length,
    repaired: parsed.repairedCount,
    failed: parsed.failures.length
  };
}
