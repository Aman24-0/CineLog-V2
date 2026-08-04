/**
 * CineLog V2 — Vault Repository: Read Operations
 * ---------------------------------------------------------------------
 * READ-ONLY queries over the `vault` table.
 *
 * RLS: owner only (user_id = auth.uid()). Soft-deleted rows excluded.
 */

import type {
  MediaType,
  TypedSupabaseClient,
  VaultIdentity,
  VaultItemResult,
  VaultListResult,
  VaultPagination,
  VaultSearchQuery,
  VaultSort,
  VaultStatus
} from "./vault.types";
import { applySort, applyPagination, toError } from "./vault.utils";

const TABLE = "vault" as const;

/**
 * Get a single vault item by its composite key. Excludes soft-deleted.
 */
export async function getVaultItem(
  supabase: TypedSupabaseClient,
  identity: VaultIdentity
): Promise<VaultItemResult> {
  const { data, error } = await supabase
    .from(TABLE)
    .select()
    .eq("user_id", identity.userId)
    .eq("tmdb_id", identity.tmdbId)
    .eq("media_type", identity.mediaType)
    .is("deleted_at", null)
    .maybeSingle();
  return { data, error: toError(error) };
}

/**
 * Alias of getVaultItem with positional signature.
 */
export async function getVaultByTmdbId(
  supabase: TypedSupabaseClient,
  userId: string,
  tmdbId: number,
  mediaType: MediaType
): Promise<VaultItemResult> {
  return getVaultItem(supabase, { userId, tmdbId, mediaType });
}

/**
 * Get all vault items for a user with a given status. Excludes soft-deleted.
 */
export async function getVaultByStatus(
  supabase: TypedSupabaseClient,
  userId: string,
  status: VaultStatus,
  options?: { sort?: VaultSort; pagination?: VaultPagination }
): Promise<VaultListResult> {
  let query = supabase
    .from(TABLE)
    .select()
    .eq("user_id", userId)
    .eq("status", status)
    .is("deleted_at", null);
  query = applySort(query, options?.sort);
  query = applyPagination(query, options?.pagination);
  const { data, error } = await query;
  return { data: data ?? [], error: toError(error) };
}

/**
 * Get all vault items for a user across MULTIPLE statuses in a SINGLE
 * query. Excludes soft-deleted.
 *
 * Phase 5 Task 5: This replaces the pattern of calling `getVaultByStatus`
 * N times in parallel (once per status) with a single query that uses
 * an `IN (...)` filter. For the vault adapter's 5-status fetch
 * (planned, watching, completed, on_hold, dropped), this reduces 5
 * round-trips to 1 — eliminating N+1 query risk and cutting latency
 * by ~4x (5 sequential network RTTs → 1).
 *
 * The `in` filter is supported by PostgREST (the Supabase REST API)
 * and translates to a SQL `WHERE status IN (...)` clause, which is
 * efficiently indexed by Postgres.
 *
 * @param statuses  Array of statuses to include. Duplicates are
 *                  de-duplicated internally to avoid sending the same
 *                  status twice in the IN clause.
 */
export async function getVaultByStatuses(
  supabase: TypedSupabaseClient,
  userId: string,
  statuses: VaultStatus[],
  options?: { sort?: VaultSort; pagination?: VaultPagination }
): Promise<VaultListResult> {
  // De-duplicate statuses (defensive — a duplicate in the IN clause
  // is harmless but wasteful).
  const uniqueStatuses = Array.from(new Set(statuses));
  let query = supabase
    .from(TABLE)
    .select()
    .eq("user_id", userId)
    .in("status", uniqueStatuses)
    .is("deleted_at", null);
  query = applySort(query, options?.sort);
  query = applyPagination(query, options?.pagination);
  const { data, error } = await query;
  return { data: data ?? [], error: toError(error) };
}

/**
 * Get the user's favorites (is_favorite = true). Excludes soft-deleted.
 */
export async function getFavorites(
  supabase: TypedSupabaseClient,
  userId: string,
  options?: { sort?: VaultSort; pagination?: VaultPagination }
): Promise<VaultListResult> {
  let query = supabase
    .from(TABLE)
    .select()
    .eq("user_id", userId)
    .eq("is_favorite", true)
    .is("deleted_at", null);
  query = applySort(query, options?.sort);
  query = applyPagination(query, options?.pagination);
  const { data, error } = await query;
  return { data: data ?? [], error: toError(error) };
}

/**
 * Get the user's pinned items (is_pinned = true). Excludes soft-deleted.
 */
export async function getPinned(
  supabase: TypedSupabaseClient,
  userId: string,
  options?: { sort?: VaultSort; pagination?: VaultPagination }
): Promise<VaultListResult> {
  let query = supabase
    .from(TABLE)
    .select()
    .eq("user_id", userId)
    .eq("is_pinned", true)
    .is("deleted_at", null);
  query = applySort(query, options?.sort);
  query = applyPagination(query, options?.pagination);
  const { data, error } = await query;
  return { data: data ?? [], error: toError(error) };
}

/**
 * Get vault items ordered by updated_at desc. Excludes soft-deleted.
 */
export async function getRecentlyUpdated(
  supabase: TypedSupabaseClient,
  userId: string,
  pagination?: VaultPagination
): Promise<VaultListResult> {
  let query = supabase
    .from(TABLE)
    .select()
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  query = applyPagination(query, pagination);
  const { data, error } = await query;
  return { data: data ?? [], error: toError(error) };
}

/**
 * Search vault by notes (ilike). Excludes soft-deleted.
 */
export async function searchVault(
  supabase: TypedSupabaseClient,
  query: VaultSearchQuery
): Promise<VaultListResult> {
  const pattern = `%${query.searchTerm}%`;
  let dbQuery = supabase
    .from(TABLE)
    .select()
    .eq("user_id", query.userId)
    .ilike("notes", pattern)
    .is("deleted_at", null);
  dbQuery = applySort(dbQuery, query.sort);
  dbQuery = applyPagination(dbQuery, query.pagination);
  const { data, error } = await dbQuery;
  return { data: data ?? [], error: toError(error) };
}
