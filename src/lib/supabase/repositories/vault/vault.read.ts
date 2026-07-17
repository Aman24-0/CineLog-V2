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
import { dedupRequest } from "~/shared/utils/requestDedup";

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
  return dedupRequest(
    `vault:status:${userId}:${status}:${JSON.stringify(options)}`,
    async () => {
      let query = supabase.from(TABLE).select()
        .eq("user_id", userId).eq("status", status).is("deleted_at", null);
      query = applySort(query, options?.sort);
      query = applyPagination(query, options?.pagination);
      const { data, error } = await query;
      return { data: data ?? [], error: toError(error) };
    }
  );
}

/**
 * Get the user's favorites (is_favorite = true). Excludes soft-deleted.
 */
export async function getFavorites(
  supabase: TypedSupabaseClient,
  userId: string,
  options?: { sort?: VaultSort; pagination?: VaultPagination }
): Promise<VaultListResult> {
  let query = supabase.from(TABLE).select()
    .eq("user_id", userId).eq("is_favorite", true).is("deleted_at", null);
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
  let query = supabase.from(TABLE).select()
    .eq("user_id", userId).eq("is_pinned", true).is("deleted_at", null);
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
  let query = supabase.from(TABLE).select()
    .eq("user_id", userId).is("deleted_at", null)
    .order("updated_at", { ascending: false });
  query = applyPagination(query, pagination);
  const { data, error } = await query;
  return { data: data ?? [], error: toError(error) };
}

/**
 * Search vault by notes (ilike). Excludes soft-deleted.
 */
/**
 * Escape SQL LIKE wildcard characters (% and _) so they are treated
 * as literals rather than pattern-matching operators.
 *
 * Without this, a user searching for "100%" would match any row
 * containing "1" followed by any characters, not just literal "100%".
 */
function escapeLikeWildcard(s: string): string {
  return s.replace(/%/g, "\%").replace(/_/g, "\_");
}

/**
 * Search vault by notes (ilike). Excludes soft-deleted.
 *
 * Wildcard characters (% and _) in the search term are escaped so
 * they are treated as literals, preventing unexpected pattern matches.
 */
export async function searchVault(
  supabase: TypedSupabaseClient,
  query: VaultSearchQuery
): Promise<VaultListResult> {
  const pattern = `%${escapeLikeWildcard(query.searchTerm)}%`;
  let dbQuery = supabase.from(TABLE).select()
    .eq("user_id", query.userId)
    .ilike("notes", pattern)
    .is("deleted_at", null);
  dbQuery = applySort(dbQuery, query.sort);
  dbQuery = applyPagination(dbQuery, query.pagination);
  const { data, error } = await dbQuery;
  return { data: data ?? [], error: toError(error) };
}
