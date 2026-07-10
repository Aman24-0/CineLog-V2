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
import { toVaultInsert, validateRating, validateProgressMinutes, toError } from "./vault.utils";

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
