// src/features/sync/backup/fetchers.ts
//
// Library fetchers — read the user's collections, presets, and episode
// progress from Supabase for inclusion in a backup snapshot.
//
// Extracted from BackupService.ts (Phase 8 Chunk 3) so the fetch logic
// can be unit-tested in isolation and updated without touching the main
// service file.
//
// All fetchers are async + tolerant of partial failure — a single failed
// fetch returns an empty array rather than throwing, so a backup of just
// the watchlist can still proceed if one subsystem is unavailable.

import type { WatchlistItem } from "~/shared/types";
import type {
  BackupCollection,
  BackupEpisodeProgress,
  BackupPreset
} from "./types";

/**
 * Fetch the user's collections + their entries, formatted for backup.
 *
 * For each collection, we fetch its entries and resolve each entry's
 * vault_id → (tmdb_id, media_type) by joining against the vault table.
 * The vault_id itself is NOT preserved in the backup — it will be
 * different on the restore side.
 */
export async function fetchCollectionsForBackup(
  // RLS auto-filters by auth.uid(); userId is kept in the signature for
  // symmetry with fetchPresetsForBackup. The _-prefix also satisfies
  // the @typescript-eslint/no-unused-vars argsIgnorePattern rule.
  _userId: string
): Promise<BackupCollection[]> {
  const { getCollectionRepository } = await import(
    "~/lib/supabase/repositories/collection"
  );
  const { getClient } = await import("~/lib/supabase/repositories/shared");

  // getCollectionRepository() picks up the singleton browser client
  // internally — no need to pass one.
  const repo = getCollectionRepository();
  const { data: collections, error } = await repo.getCollections({
    includeArchived: true // include archived collections too — full backup
  });

  if (error || !collections || collections.length === 0) return [];

  // Fetch entries for each collection in parallel.
  const result = await Promise.all(
    collections.map(async (col): Promise<BackupCollection> => {
      const { data: entries, error: entriesError } = await repo.getItems(
        col.id
      );

      const backupEntries: BackupCollection["entries"] = [];
      if (!entriesError && entries) {
        for (const entry of entries) {
          // Resolve vault_id → (tmdb_id, media_type) by fetching the
          // vault row. This is N+1 but acceptable for a backup operation
          // (users typically have <500 entries total).
          const { data: vaultRow } = await getClient()
            .from("vault")
            .select("tmdb_id, media_type")
            .eq("id", entry.vault_id)
            .maybeSingle();

          if (vaultRow) {
            backupEntries.push({
              tmdb_id: String(vaultRow.tmdb_id),
              media_type: vaultRow.media_type as "movie" | "tv",
              position: entry.position ?? entry.order_index ?? 0,
              note: null, // collection_entries has no note column
              added_at: entry.created_at ?? new Date().toISOString()
            });
          }
        }
      }

      return {
        name: col.name,
        description: col.description ?? null,
        collection_type: col.collection_type ?? "user",
        // collections has cover_url + banner_url, no poster_url — use cover_url
        poster_url: col.cover_url ?? col.banner_url ?? null,
        is_public: false, // collections are owner-only by RLS, no is_public column
        archived_at: col.archived_at ?? null,
        entries: backupEntries
      };
    })
  );

  return result;
}

/**
 * Fetch the user's saved vault-filter presets.
 */
export async function fetchPresetsForBackup(
  userId: string
): Promise<BackupPreset[]> {
  const { listPresets } = await import(
    "~/lib/supabase/repositories/preset/preset.read"
  );
  const { getClient } = await import("~/lib/supabase/repositories/shared");

  const { data, error } = await listPresets(getClient(), userId);
  if (error || !data) return [];

  return data.map((p) => ({
    name: p.name,
    filters: p.filters
  }));
}

/**
 * Fetch episode-level watch progress for all TV items in the watchlist.
 *
 * We use the vault_id from the watchlist to query episode_progress.
 * The vault_id is preserved in the backup so the restore can match
 * progress to the re-imported vault row (the restore looks up the
 * new vault row by tmdb_id, then attaches the progress to it).
 */
export async function fetchEpisodeProgressForBackup(
  userId: string,
  watchlist: WatchlistItem[]
): Promise<BackupEpisodeProgress[]> {
  // Only TV items have episode progress.
  const tvItems = watchlist.filter((w) => w.media_type === "tv");
  if (tvItems.length === 0) return [];

  const { getEpisodeProgressForVaultItem } = await import(
    "~/lib/supabase/repositories/episodeProgress/episodeProgress.read"
  );
  const { getClient } = await import("~/lib/supabase/repositories/shared");

  // We need the vault_id for each TV item. The watchlist item doesn't
  // carry it directly, so we look it up by (user_id, tmdb_id, media_type).
  const supabase = getClient();
  const { data: vaultRows, error: vaultErr } = await supabase
    .from("vault")
    .select("id, tmdb_id")
    .eq("user_id", userId)
    .eq("media_type", "tv");

  if (vaultErr || !vaultRows) return [];

  // Build a map tmdb_id → vault_id for quick lookup.
  const vaultIdByTmdb = new Map(
    vaultRows.map((v) => [String(v.tmdb_id), v.id as string])
  );

  // Fetch episode progress for each TV item in parallel.
  const results = await Promise.all(
    tvItems.map(async (item) => {
      const vaultId = vaultIdByTmdb.get(String(item.id));
      if (!vaultId) return [];

      const { data: progress, error } = await getEpisodeProgressForVaultItem(
        supabase,
        vaultId
      );
      if (error || !progress) return [];

      return progress.map(
        (p): BackupEpisodeProgress => ({
          vault_id: vaultId,
          season: p.season_number ?? null,
          episode: p.episode_number ?? null,
          is_completed: p.is_completed ?? false,
          progress_minutes: p.progress_minutes ?? null,
          watched_at: p.watched_at ?? null,
          notes: null // episode_progress has no notes column
        })
      );
    })
  );

  // Flatten the array-of-arrays.
  return results.flat();
}
