/**
 * CineLog V2 — Episode Progress Repository: Write Operations
 * ---------------------------------------------------------------------
 * UPSERT + mark-completed operations over the `episode_progress` table.
 *
 * UNIQUE(vault_id, season_number, episode_number) — the DB constraint
 * enables ON CONFLICT DO UPDATE for idempotent upserts (Database Bible
 * §06: "The application should use UPSERT for episode progress updates").
 */

import type {
  EpisodeProgressResult,
  EpisodeProgressRow,
  EpisodeProgressWriteResult,
  TypedSupabaseClient,
  UpsertEpisodeProgressPayload
} from "./episodeProgress.types";
import { toCompletedUpdate, toError, toInsert } from "./episodeProgress.utils";

const TABLE = "episode_progress" as const;

/**
 * Upsert an episode progress record.
 *
 * If a record with the same (vault_id, season_number, episode_number)
 * already exists, it is updated; otherwise a new record is inserted.
 * This is the recommended pattern per Database Bible §06.
 *
 * @returns The upserted row, or `null` + `error`.
 */
export async function upsertEpisodeProgress(
  supabase: TypedSupabaseClient,
  payload: UpsertEpisodeProgressPayload
): Promise<EpisodeProgressResult<EpisodeProgressRow>> {
  const insert = toInsert(payload);
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(insert, { onConflict: "vault_id,season_number,episode_number" })
    .select()
    .single();

  return { data, error: toError(error) };
}

/**
 * Mark a specific episode as completed.
 *
 * Sets `is_completed = true` and `watched_at = now()` on the matching
 * record. If the record doesn't exist, this is a no-op (returns error).
 */
export async function markEpisodeCompleted(
  supabase: TypedSupabaseClient,
  vaultId: string,
  seasonNumber: number,
  episodeNumber: number
): Promise<EpisodeProgressWriteResult> {
  const { error } = await supabase
    .from(TABLE)
    .update(toCompletedUpdate())
    .eq("vault_id", vaultId)
    .eq("season_number", seasonNumber)
    .eq("episode_number", episodeNumber);

  return { error: toError(error) };
}

/**
 * Delete all episode progress records for a vault item.
 *
 * Called when a vault item is permanently deleted (cascade cleanup).
 * Soft-deleted vault items keep their progress so it can be restored.
 */
export async function clearEpisodeProgress(
  supabase: TypedSupabaseClient,
  vaultId: string
): Promise<EpisodeProgressWriteResult> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("vault_id", vaultId);

  return { error: toError(error) };
}
