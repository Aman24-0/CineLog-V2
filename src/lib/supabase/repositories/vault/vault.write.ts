/**
 * CineLog V2 — Vault Repository: Write Operations
 * ---------------------------------------------------------------------
 * Create, update, soft-delete, and restore operations.
 *
 * RLS: owner only (user_id = auth.uid()).
 * updated_at: auto-managed by set_updated_at() trigger (Bible §91).
 */

import type {
  CreateVaultItemPayload,
  TypedSupabaseClient,
  VaultIdentity,
  VaultItemResult,
  VaultStatus,
  VaultUpdate
} from "./vault.types";
import {
  toVaultInsert,
  validateRating,
  validateProgressMinutes,
  toError,
  isMissingColumnError
} from "./vault.utils";

const TABLE = "vault" as const;

/**
 * Create a new vault item. Relies on DB UNIQUE constraint for dedup.
 */
export async function createVaultItem(
  supabase: TypedSupabaseClient,
  payload: CreateVaultItemPayload
): Promise<VaultItemResult> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(toVaultInsert(payload))
    .select()
    .single();
  return { data, error: toError(error) };
}

/**
 * Upsert a vault item — insert if not present, UPDATE if it already exists.
 *
 * Used by the backup Restore flow so that importing a V1 backup over an
 * existing V2 vault doesn't fail on items that were already added manually.
 * The unique key is (user_id, tmdb_id, media_type) — same as the composite
 * identity used everywhere else.
 *
 * On conflict, ALL user-owned fields are overwritten with the incoming
 * values (status, rating, notes, dates, re-watch tracking, season dates).
 * This is the desired behavior for a restore: the backup is the source of
 * truth.
 *
 * RESILIENCE: If the first attempt fails because the user's database
 * hasn't run the v2.2/v2.3 migrations (missing `rewatch_dates`,
 * `season_dates`, `season_rewatch_count`, `season_rewatch_dates`
 * columns), we retry with `includeExtendedFields: false` — using only
 * the base columns that have existed since v1.0 of the schema. This
 * lets imports succeed even before the user runs the migration scripts.
 */
export async function upsertVaultItem(
  supabase: TypedSupabaseClient,
  payload: CreateVaultItemPayload
): Promise<VaultItemResult> {
  let { data, error } = await supabase
    .from(TABLE)
    .upsert(toVaultInsert(payload), {
      onConflict: "user_id,tmdb_id,media_type",
      ignoreDuplicates: false
    })
    .select()
    .single();

  // If the error is "column does not exist", retry without extended fields.
  if (error && isMissingColumnError(error)) {
    console.warn(
      "[upsertVaultItem] Extended columns missing — retrying without season_dates/rewatch_dates. " +
        "Run scripts/add_season_dates_columns.sql + scripts/add_rewatch_dates_column.sql in the Supabase SQL editor to enable full tracking.",
      error
    );
    const retry = await supabase
      .from(TABLE)
      .upsert(toVaultInsert(payload, { includeExtendedFields: false }), {
        onConflict: "user_id,tmdb_id,media_type",
        ignoreDuplicates: false
      })
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  return { data, error: toError(error) };
}

/**
 * BATCH upsert — insert/update many vault items in a SINGLE Supabase request.
 *
 * This is the SCALE fix for the restore flow. Restoring 1000+ items one at a
 * time hits Supabase's free-tier rate limit (~2 req/sec sustained, 500/min
 * burst) and produces hundreds of 429 failures. By chunking into batches of
 * `BATCH_SIZE` rows per request, we turn 1029 individual upserts into ~11
 * network calls — well within any rate limit, and ~100x faster end-to-end.
 *
 * The unique key for conflict resolution is the same as single upsert:
 * (user_id, tmdb_id, media_type). On conflict, ALL user-owned fields are
 * overwritten with the incoming values from the batch.
 *
 * Returns the count of successfully written rows. Individual row-level
 * errors are surfaced as a single error returned from the batch (Supabase
 * treats the entire batch as atomic — either all rows succeed or the
 * whole batch fails).
 *
 * NOTE: Supabase's PostgREST supports up to 1000 rows per insert/upsert
 * call, but we use 100 to keep memory + request payload reasonable.
 */
export const VAULT_BATCH_SIZE = 100;

export async function upsertVaultItemsBatch(
  supabase: TypedSupabaseClient,
  payloads: CreateVaultItemPayload[]
): Promise<{ count: number; error: Error | null }> {
  if (payloads.length === 0) return { count: 0, error: null };
  const rows = payloads.map((p) => toVaultInsert(p));
  let { data, error } = await supabase.from(TABLE).upsert(rows, {
    onConflict: "user_id,tmdb_id,media_type",
    ignoreDuplicates: false,
    count: "exact"
  });

  // If the error is "column does not exist" (missing v2.2/v2.3 columns),
  // retry the entire batch WITHOUT extended fields. This lets imports
  // succeed even before the user runs the migration scripts.
  if (error && isMissingColumnError(error)) {
    console.warn(
      "[upsertVaultItemsBatch] Extended columns missing — retrying batch without season_dates/rewatch_dates. " +
        "Run scripts/add_season_dates_columns.sql + scripts/add_rewatch_dates_column.sql in the Supabase SQL editor to enable full tracking.",
      error
    );
    const bareRows = payloads.map((p) =>
      toVaultInsert(p, { includeExtendedFields: false })
    );
    const retry = await supabase.from(TABLE).upsert(bareRows, {
      onConflict: "user_id,tmdb_id,media_type",
      ignoreDuplicates: false,
      count: "exact"
    });
    data = retry.data;
    error = retry.error;
  }

  if (error) return { count: 0, error: toError(error) };
  // `data` is typed as `never[]` when no `.select()` is chained, but at
  // runtime Supabase returns the inserted rows when count: "exact" is set.
  // Fall back to rows.length when data is null/empty so the count is
  // always accurate.
  const returnedRows = (data as unknown[] | null) ?? [];
  const count = returnedRows.length > 0 ? returnedRows.length : rows.length;
  return { count, error: null };
}

/**
 * Partially update a vault item by composite key. Excludes soft-deleted.
 */
export async function updateVaultItem(
  supabase: TypedSupabaseClient,
  identity: VaultIdentity,
  update: VaultUpdate
): Promise<VaultItemResult> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(update)
    .eq("user_id", identity.userId)
    .eq("tmdb_id", identity.tmdbId)
    .eq("media_type", identity.mediaType)
    .is("deleted_at", null)
    .select()
    .single();
  return { data, error: toError(error) };
}

/**
 * Update status + bump last_activity_at.
 */
export async function updateStatus(
  supabase: TypedSupabaseClient,
  identity: VaultIdentity,
  status: VaultStatus
): Promise<VaultItemResult> {
  return updateVaultItem(supabase, identity, {
    status,
    last_activity_at: new Date().toISOString()
  });
}

/**
 * Update rating (validates 0.5–10). Bumps last_activity_at.
 */
export async function updateRating(
  supabase: TypedSupabaseClient,
  identity: VaultIdentity,
  rating: number
): Promise<VaultItemResult> {
  const err = validateRating(rating);
  if (err) return { data: null, error: err };
  return updateVaultItem(supabase, identity, {
    rating,
    last_activity_at: new Date().toISOString()
  });
}

/**
 * Update notes. Bumps last_activity_at.
 */
export async function updateNotes(
  supabase: TypedSupabaseClient,
  identity: VaultIdentity,
  notes: string
): Promise<VaultItemResult> {
  return updateVaultItem(supabase, identity, {
    notes,
    last_activity_at: new Date().toISOString()
  });
}

/**
 * Update movie progress minutes (validates >= 0). Bumps last_activity_at.
 */
export async function updateProgress(
  supabase: TypedSupabaseClient,
  identity: VaultIdentity,
  progressMinutes: number
): Promise<VaultItemResult> {
  const err = validateProgressMinutes(progressMinutes);
  if (err) return { data: null, error: err };
  return updateVaultItem(supabase, identity, {
    progress_minutes: progressMinutes,
    last_activity_at: new Date().toISOString()
  });
}

/**
 * Soft-delete by setting deleted_at. Only if not already trashed.
 */
export async function deleteVaultItem(
  supabase: TypedSupabaseClient,
  identity: VaultIdentity
): Promise<VaultItemResult> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", identity.userId)
    .eq("tmdb_id", identity.tmdbId)
    .eq("media_type", identity.mediaType)
    .is("deleted_at", null)
    .select()
    .single();
  return { data, error: toError(error) };
}

/**
 * Restore a soft-deleted item by clearing deleted_at.
 */
export async function restoreVaultItem(
  supabase: TypedSupabaseClient,
  identity: VaultIdentity
): Promise<VaultItemResult> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ deleted_at: null })
    .eq("user_id", identity.userId)
    .eq("tmdb_id", identity.tmdbId)
    .eq("media_type", identity.mediaType)
    .not("deleted_at", "is", null)
    .select()
    .single();
  return { data, error: toError(error) };
}
