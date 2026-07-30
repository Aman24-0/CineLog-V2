/**
 * CineLog V2 — Episode Progress Adapter
 * ---------------------------------------------------------------------
 * Phase 7.3 — Episode Progress Migration
 *
 * Bridges the application's `WatchlistItem` episode fields (season,
 * episode, watchProgress) to the Supabase `episode_progress` table.
 *
 * Architecture:
 *   UI → useVault() → episodeProgressAdapter → EpisodeProgressRepository → Supabase
 *
 * Key challenge: `episode_progress` uses `vault_id` (the vault row's
 * UUID), but `WatchlistItem.id` is the `tmdb_id` (string). This adapter
 * resolves the vault UUID from the TMDB identity via VaultRepository
 * before calling EpisodeProgressRepository.
 */

import { getVaultRepository } from "~/lib/supabase/repositories";
import { getEpisodeProgressRepository } from "~/lib/supabase/repositories";
import type { VaultRow } from "~/lib/supabase/repositories";
import type { WatchlistItem, WatchProgress } from "~/shared/types";

// ---------------------------------------------------------------------------
// READ: Enrich WatchlistItem[] with episode progress
// ---------------------------------------------------------------------------

/**
 * Enrich a list of WatchlistItems (mapped from VaultRows) with their
 * latest episode progress. TV items get `season`, `episode`, and
 * `watchProgress` populated from the `episode_progress` table; movies
 * are left unchanged (they don't use episode progress).
 *
 * This is a BATCH operation — one query fetches the latest episode
 * progress for ALL TV vault items, avoiding N+1 queries.
 *
 * @param items   The vault items to enrich (modified in place).
 * @param vaultRows  The raw VaultRows (needed for their UUID `id`).
 * @returns The enriched items (same array, with episode data merged in).
 */
export function enrichWithEpisodeProgress(
  items: WatchlistItem[],
  vaultRows: VaultRow[]
): WatchlistItem[] {
  // Build a lookup: tmdb_id (string) → vault UUID
  const vaultIdByTmdbId = new Map<string, string>();
  for (const row of vaultRows) {
    vaultIdByTmdbId.set(String(row.tmdb_id), row.id);
  }

  // Collect TV item vault UUIDs for the batch fetch
  const tvVaultIds: string[] = [];
  for (const item of items) {
    if (item.media_type !== "tv") continue;
    const vaultId = vaultIdByTmdbId.get(item.id);
    if (vaultId) tvVaultIds.push(vaultId);
  }

  // If no TV items, return as-is (no async needed)
  if (tvVaultIds.length === 0) return items;

  // We can't do async inside .map(), so we return a Promise.
  // The caller awaits this function.
  return items; // placeholder — see enrichWithEpisodeProgressAsync below
}

/**
 * Async version of {@link enrichWithEpisodeProgress}. Performs the
 * batch fetch of episode progress and merges the results.
 *
 * This is the function the vault read path actually calls.
 */
export async function enrichWithEpisodeProgressAsync(
  items: WatchlistItem[],
  vaultRows: VaultRow[]
): Promise<WatchlistItem[]> {
  // Build a lookup: tmdb_id (string) → vault UUID
  const vaultIdByTmdbId = new Map<string, string>();
  for (const row of vaultRows) {
    vaultIdByTmdbId.set(String(row.tmdb_id), row.id);
  }

  // Collect TV item vault UUIDs for the batch fetch
  const tvVaultIds: string[] = [];
  for (const item of items) {
    if (item.media_type !== "tv") continue;
    const vaultId = vaultIdByTmdbId.get(item.id);
    if (vaultId) tvVaultIds.push(vaultId);
  }

  if (tvVaultIds.length === 0) return items;

  // Batch-fetch the latest episode progress for all TV vault items
  const repo = getEpisodeProgressRepository();
  const { data: progressMap, error } =
    await repo.getLatestEpisodeProgressBatch(tvVaultIds);
  if (error) {
    console.error("[episodeProgressAdapter] Batch fetch error:", error);
    return items; // return unenriched on error — partial data is better than none
  }

  // Merge episode progress into the WatchlistItems
  return items.map((item): WatchlistItem => {
    if (item.media_type !== "tv") return item;
    const vaultId = vaultIdByTmdbId.get(item.id);
    if (!vaultId) return item;

    const progress = progressMap.get(vaultId);
    if (!progress) return item;

    // Populate the WatchlistItem's episode fields from the latest
    // episode_progress row. The progress engine reads these to compute
    // series-wide completion percentage and Continue Watching ordering.
    const watchProgress: WatchProgress = {
      currentTime: 0,
      duration: 0,
      server: null,
      updatedAt: progress.watched_at ?? progress.updated_at,
      season: progress.season_number,
      episode: progress.episode_number
    };

    return {
      ...item,
      season: progress.season_number,
      episode: progress.episode_number,
      watchProgress
    };
  });
}

// ---------------------------------------------------------------------------
// WRITE: Persist episode progress to Supabase
// ---------------------------------------------------------------------------

/**
 * Resolve the vault row's UUID from a TMDB identity.
 *
 * The `episode_progress` table uses `vault_id` (UUID), but the UI works
 * with `tmdb_id` (string). This helper bridges the gap by looking up
 * the vault row via VaultRepository.getVaultByTmdbId.
 *
 * @returns The vault UUID, or null if the vault item doesn't exist.
 */
async function resolveVaultId(
  userId: string,
  tmdbId: string,
  mediaType: WatchlistItem["media_type"]
): Promise<string | null> {
  const repo = getVaultRepository();
  const { data, error } = await repo.getVaultByTmdbId(
    userId,
    Number(tmdbId),
    mediaType
  );
  if (error || !data) return null;
  return data.id;
}

/**
 * Update the user's current episode position (season + episode) in
 * the `episode_progress` table.
 *
 * Upserts a record for (vault_id, season_number, episode_number) with
 * `watched_at = now()` so it becomes the "latest watched" episode.
 * This is the record the progress engine and Continue Watching use to
 * determine the current position.
 *
 * If the item is currently "Planned" or "Plan to Watch", the caller
 * should first upgrade the status to "Watching" (handled by useVault).
 *
 * @returns true on success, false on failure.
 */
export async function updateSeasonEpisodeInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  season: number,
  episode: number
): Promise<boolean> {
  const vaultId = await resolveVaultId(userId, itemId, mediaType);
  if (!vaultId) {
    console.error(
      "[episodeProgressAdapter] Could not resolve vaultId for item:",
      itemId
    );
    return false;
  }

  const repo = getEpisodeProgressRepository();
  const { error } = await repo.upsertEpisodeProgress({
    vaultId,
    seasonNumber: season,
    episodeNumber: episode,
    isCompleted: false,
    progressMinutes: 0,
    watchedAt: new Date().toISOString()
  });

  if (error) {
    console.error("[episodeProgressAdapter] Upsert error:", error);
    return false;
  }
  return true;
}

/**
 * Update watch progress for an episode. In V2 this is primarily a
 * compatibility wrapper — the V2 progress engine derives state from
 * the latest episode_progress row, not from streaming playback fields.
 *
 * This function persists the season/episode from the `WatchProgress`
 * object to the `episode_progress` table, then the enrichment path
 * picks it up on the next vault refresh.
 *
 * @returns true on success, false on failure.
 */
export async function updateWatchProgressInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  progress: WatchProgress
): Promise<boolean> {
  const season = progress.season ?? 1;
  const episode = progress.episode ?? 1;
  return updateSeasonEpisodeInSupabase(
    userId,
    itemId,
    mediaType,
    season,
    episode
  );
}

/**
 * Mark a specific episode as completed in the `episode_progress` table.
 *
 * Sets `is_completed = true` and `watched_at = now()` on the matching
 * record. Used when the user finishes an episode.
 *
 * @returns true on success, false on failure.
 */
export async function markEpisodeCompletedInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  season: number,
  episode: number
): Promise<boolean> {
  const vaultId = await resolveVaultId(userId, itemId, mediaType);
  if (!vaultId) return false;

  const repo = getEpisodeProgressRepository();
  const { error } = await repo.markEpisodeCompleted(vaultId, season, episode);
  if (error) {
    console.error("[episodeProgressAdapter] markCompleted error:", error);
    return false;
  }
  return true;
}

/**
 * Unmark an episode — delete the `episode_progress` record for this
 * episode AND all records at or after this position. Used by the
 * bidirectional episode toggle when the user taps the filled-check
 * toggle on a watched episode.
 *
 * v2.6 — added to support the unmark direction of the episode toggle.
 *
 * Why delete from this position FORWARD (not just the single record):
 * the `episode_progress` table tracks per-episode watched records, and
 * `getLatestEpisodeProgress` picks the most recently watched one
 * (ordered by watched_at desc) as the "current tracker position". If
 * we only deleted the clicked episode's record but left later records
 * (e.g. S1E5, S1E6) intact, the next vault refresh would re-pick S1E6
 * as "latest watched" and silently undo the rewind. Deleting forward
 * guarantees the tracker stays at the rewound position.
 *
 * The caller is responsible for ALSO updating the vault row's
 * season/episode to the new (rewound) tracker position — this function
 * ONLY cleans up the episode_progress table.
 *
 * @returns true on success, false on failure.
 */
export async function unmarkEpisodeInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  fromSeason: number,
  fromEpisode: number
): Promise<boolean> {
  const vaultId = await resolveVaultId(userId, itemId, mediaType);
  if (!vaultId) {
    console.error(
      "[episodeProgressAdapter] Could not resolve vaultId for item:",
      itemId
    );
    return false;
  }

  const repo = getEpisodeProgressRepository();
  const { error } = await repo.deleteEpisodeProgressFrom(
    vaultId,
    fromSeason,
    fromEpisode
  );
  if (error) {
    console.error(
      "[episodeProgressAdapter] deleteEpisodeProgressFrom error:",
      error
    );
    return false;
  }
  return true;
}
