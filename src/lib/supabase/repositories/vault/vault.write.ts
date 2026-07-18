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
import { toVaultInsert, validateRating, validateProgressMinutes, toError, isMissingColumnError } from "./vault.utils";
import { getVaultByTmdbId } from "./vault.read";

const TABLE = "vault" as const;

function isDuplicateVaultError(err: unknown): boolean {
  if (err === null || err === undefined || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; details?: unknown };
  const code = String(e.code ?? "").toLowerCase();
  const message = `${String(e.message ?? "")} ${String(e.details ?? "")}`.toLowerCase();
  return (
    code === "23505" ||
    message.includes("duplicate key value violates unique constraint") ||
    message.includes("already exists")
  );
}

/**
 * Create a new vault item. Relies on DB UNIQUE constraint for dedup.
 */
export async function createVaultItem(
  supabase: TypedSupabaseClient,
  payload: CreateVaultItemPayload
): Promise<VaultItemResult> {
  let { data, error } = await supabase
    .from(TABLE)
    .insert(toVaultInsert(payload))
    .select()
    .single();

  if (error && isMissingColumnError(error)) {
    const retry = await supabase
      .from(TABLE)
      .insert(toVaultInsert(payload, { includeExtendedFields: false, includeMetadataFields: false }))
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error && isDuplicateVaultError(error)) {
    const existing = await getVaultByTmdbId(
      supabase,
      payload.userId,
      payload.tmdbId,
      payload.mediaType,
    );
    if (existing.data) return existing;
  }

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
      ignoreDuplicates: false,
    })
    .select()
    .single();

  // If the error is "column does not exist", retry without extended fields.
  if (error && isMissingColumnError(error)) {
    console.warn(
      "[upsertVaultItem] Schema drift detected — column(s) season_dates, rewatch_dates, " +
      "season_rewatch_count, season_rewatch_dates, or display metadata columns do not exist in the database. " +
      "Retrying WITHOUT extended fields or display metadata. Data for those fields WILL BE LOST. " +
      "Run the vault migration scripts in the Supabase SQL editor to fix.",
      error,
    );
    const retry = await supabase
      .from(TABLE)
      .upsert(toVaultInsert(payload, { includeExtendedFields: false, includeMetadataFields: false }), {
        onConflict: "user_id,tmdb_id,media_type",
        ignoreDuplicates: false,
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

/**
 * Result of a batch upsert, including per-chunk outcomes for
 * transactional safety. When the batch is split into sub-batches,
 * callers can determine exactly which chunks succeeded and which failed.
 */
export interface BatchUpsertResult {
  /** Total number of successfully written rows across all chunks. */
  count: number;
  /** Number of rows that failed to write. */
  failedCount: number;
  /** Overall error (null if all chunks succeeded). */
  error: Error | null;
  /** Per-chunk details for debugging and retry logic. */
  chunks: Array<{
    startIndex: number;
    count: number;
    success: boolean;
    error?: Error | null;
  }>;
}

/**
 * BATCH upsert with chunked sub-batches for transactional safety.
 *
 * Large batches (e.g. 1000+ items during a backup restore) are split
 * into sub-batches of `CHUNK_SIZE`. If one chunk fails, the remaining
 * chunks still execute — the caller receives a detailed result showing
 * exactly which chunks succeeded and which failed. This prevents a
 * single bad row from causing a full-batch failure and losing all
 * progress.
 *
 * The unique key for conflict resolution is the same as single upsert:
 * (user_id, tmdb_id, media_type). On conflict, ALL user-owned fields are
 * overwritten with the incoming values from the batch.
 */
export const VAULT_BATCH_SIZE = 100;
const CHUNK_SIZE = 100; // rows per sub-batch (Supabase PostgREST supports up to 1000)

export async function upsertVaultItemsBatch(
  supabase: TypedSupabaseClient,
  payloads: CreateVaultItemPayload[],
): Promise<BatchUpsertResult> {
  if (payloads.length === 0) return { count: 0, failedCount: 0, error: null, chunks: [] };

  const chunks: BatchUpsertResult["chunks"] = [];
  let totalCount = 0;
  let failedCount = 0;
  let lastError: Error | null = null;

  for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
    const chunkPayloads = payloads.slice(i, i + CHUNK_SIZE);
    const rows = chunkPayloads.map((p) => toVaultInsert(p));

    let { data, error } = await supabase
      .from(TABLE)
      .upsert(rows, {
        onConflict: "user_id,tmdb_id,media_type",
        ignoreDuplicates: false,
        count: "exact",
      });

    // If the error is "column does not exist" (missing v2.2/v2.3 columns),
    // retry this chunk WITHOUT extended fields.
    if (error && isMissingColumnError(error)) {
      console.warn(
        "[upsertVaultItemsBatch] Schema drift detected — column(s) season_dates, rewatch_dates, " +
        "season_rewatch_count, season_rewatch_dates, or display metadata columns do not exist in the database. " +
        "Retrying this chunk WITHOUT extended fields or display metadata. " +
        "Data for those fields will be LOST for this chunk. " +
        "Run the vault migration scripts in the Supabase SQL editor to fix.",
      );
      const bareRows = chunkPayloads.map((p) =>
        toVaultInsert(p, { includeExtendedFields: false, includeMetadataFields: false })
      );
      const retry = await supabase
        .from(TABLE)
        .upsert(bareRows, {
          onConflict: "user_id,tmdb_id,media_type",
          ignoreDuplicates: false,
          count: "exact",
        });
      data = retry.data;
      error = retry.error;
    }

    const returnedRows = (data as unknown[] | null) ?? [];
    const chunkCount = returnedRows.length > 0 ? returnedRows.length : rows.length;

    if (error) {
      const err = toError(error);
      failedCount += chunkPayloads.length;
      lastError = err;
      chunks.push({ startIndex: i, count: chunkPayloads.length, success: false, error: err });
    } else {
      totalCount += chunkCount;
      chunks.push({ startIndex: i, count: chunkCount, success: true });
    }
  }

  return {
    count: totalCount,
    failedCount,
    error: lastError,
    chunks,
  };
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
