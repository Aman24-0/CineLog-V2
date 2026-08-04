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
 * Phase 6 Task 2 — Set the rating on a specific episode_progress record,
 * creating the row if it doesn't already exist.
 *
 * BUG FIX (rating persistence): the previous implementation was a plain
 * UPDATE, which is a **no-op when the episode_progress row doesn't
 * exist**. That scenario is common: when the user advances the tracker
 * from e.g. S1E1 directly to S1E5 (by tapping the watched toggle on E5),
 * `handleEpisodeChange` only upserts a row for E5 — the episodes in
 * between (E2, E3, E4) are marked "watched" by the UI (because the
 * tracker is past them) but have NO episode_progress row. So rating E3
 * silently disappeared: the optimistic local Map showed the star, but
 * the server-side UPDATE matched zero rows. On the next page load,
 * `hydrateEpisodeRatings` fetched all rows (E1 + E5, neither rated) and
 * E3's rating was gone.
 *
 * The fix: two-step upsert.
 *   Step 1 — UPDATE only the `rating` column on the matching row, if it
 *     exists. This preserves `is_completed`, `watched_at`,
 *     `progress_minutes` on existing rows (so we don't clobber the
 *     "latest watched" ordering by resetting watched_at).
 *   Step 2 — If Step 1 affected zero rows (the row didn't exist), INSERT
 *     a new row with the rating and sensible defaults for a watched
 *     episode (`is_completed: true`, `watched_at: now()`). The UI only
 *     shows the rating row for episodes marked `isWatched` (tracker is
 *     past them), so we can safely treat a rating action as evidence
 *     the episode was watched.
 *
 * Passing `null` for the rating clears it (sets the column to NULL) on
 * an existing row. If the row doesn't exist, passing `null` is a no-op
 * (there's nothing to clear — we don't insert a row just to store NULL).
 *
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
  // Step 1: Try a plain UPDATE scoped to the target row. This only
  // touches the `rating` column, leaving is_completed / watched_at /
  // progress_minutes untouched on existing rows. We use the PostgREST
  // `count: 'exact'` option to learn how many rows were affected.
  const { count, error: updateErr } = await supabase
    .from(TABLE)
    .update({ rating }, { count: "exact" })
    .eq("vault_id", vaultId)
    .eq("season_number", seasonNumber)
    .eq("episode_number", episodeNumber);

  if (updateErr) return { error: toError(updateErr) };

  // Step 2: If Step 1 updated zero rows, the episode_progress row
  // doesn't exist yet (the user is rating an episode the tracker jumped
  // past without creating intermediate rows). INSERT it now with the
  // rating + watched-episode defaults. We skip the insert when rating
  // is null — there's no value in creating a row just to store NULL.
  if (count === 0 && rating !== null) {
    const { error: insertErr } = await supabase
      .from(TABLE)
      .upsert(
        {
          vault_id: vaultId,
          season_number: seasonNumber,
          episode_number: episodeNumber,
          rating,
          is_completed: true,
          progress_minutes: 0,
          watched_at: new Date().toISOString()
        },
        { onConflict: "vault_id,season_number,episode_number" }
      );

    if (insertErr) return { error: toError(insertErr) };
  }

  return { error: null };
}
