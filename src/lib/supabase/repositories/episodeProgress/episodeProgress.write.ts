/**
 * CineLog V2 — Episode Progress Repository: Write Operations
 * ---------------------------------------------------------------------
 * UPSERT + mark-completed + delete operations over the `episode_progress`
 * table.
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
 * Delete ALL episode progress records for a vault item.
 *
 * Called when a vault item is permanently deleted (cascade cleanup).
 * Soft-deleted vault items keep their progress so it can be restored.
 */
export async function clearEpisodeProgress(
  supabase: TypedSupabaseClient,
  vaultId: string
): Promise<EpisodeProgressWriteResult> {
  const { error } = await supabase.from(TABLE).delete().eq("vault_id", vaultId);

  return { error: toError(error) };
}

/**
 * Delete all episode progress records at or AFTER a given position
 * (season/episode) — used when the user unmarks an episode they
 * previously watched.
 *
 * v2.6 — added to support the bidirectional episode toggle. When the
 * user taps "unwatch" on S2E5, the application rewinds the tracker to
 * S2E4 and must also delete the episode_progress records for S2E5 and
 * everything after (S2E6, S2E7, ..., S3, S4, ...). Otherwise the
 * `getLatestEpisodeProgress` query (which orders by watched_at desc)
 * would still see the later records on the next vault refresh and
 * re-pick them as the "latest watched", silently undoing the rewind.
 *
 * The predicate is: season_number > fromSeason, OR
 * (season_number = fromSeason AND episode_number >= fromEpisode).
 * Translated to Supabase filter chains: an OR of two conditions.
 *
 * NOTE: We use `gte` on episode_number (not `gt`) because the user
 * is unmarking the clicked episode itself — that record must go too.
 *
 * @returns { error } — null on success, Error on failure.
 */
export async function deleteEpisodeProgressFrom(
  supabase: TypedSupabaseClient,
  vaultId: string,
  fromSeason: number,
  fromEpisode: number
): Promise<EpisodeProgressWriteResult> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("vault_id", vaultId)
    .or(
      `season_number.gt.${fromSeason},and(season_number.eq.${fromSeason},episode_number.gte.${fromEpisode})`
    );

  return { error: toError(error) };
}

/**
 * Phase 6 Task 2 — Update the rating on a specific episode_progress
 * record.
 *
 * If the record doesn't exist (the user hasn't marked the episode as
 * watched yet), this is a no-op — the function returns `{ error: null }`
 * but no rows are updated. The caller should call `upsertEpisodeProgress`
 * first if it wants to ensure the row exists before setting the rating.
 *
 * Passing `null` for the rating clears it (sets the column to NULL).
 * The app validates the rating range (1-10 or 1-5 depending on the
 * user's ratingScale preference) before calling this function — the
 * DB column has no CHECK constraint.
 *
 * @returns { error } — null on success, Error on failure.
 */
export async function updateEpisodeRating(
  supabase: TypedSupabaseClient,
  vaultId: string,
  seasonNumber: number,
  episodeNumber: number,
  rating: number | null
): Promise<EpisodeProgressWriteResult> {
  const { error } = await supabase
    .from(TABLE)
    .update({ rating })
    .eq("vault_id", vaultId)
    .eq("season_number", seasonNumber)
    .eq("episode_number", episodeNumber);

  return { error: toError(error) };
}
