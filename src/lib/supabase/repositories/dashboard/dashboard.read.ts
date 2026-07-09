/**
 * CineLog V2 — Dashboard Repository: List / Shelf Reads
 * ---------------------------------------------------------------------
 * READ-ONLY list queries for the dashboard shelves: Recently Added,
 * Recently Updated, Pinned, Favorites, Watching Now, Completed Recently.
 *
 * Continue Watching (which enriches vault rows with episode_progress)
 * lives in `./dashboard.continue.ts`. Count aggregation lives in
 * `./dashboard.stats.ts`.
 *
 * RLS compliance (Database Bible §90)
 * -----------------------------------
 *   • Every query filters by `user_id` client-side (defense in depth)
 *     in addition to the RLS policy that enforces `user_id = auth.uid()`.
 *
 * Soft-delete handling
 * --------------------
 *   • All `vault` reads exclude soft-deleted rows (`deleted_at IS NULL`)
 *     per Bible §03 partial index.
 *
 * Query optimisation (Database Bible §12)
 * ---------------------------------------
 *   • List queries select only the columns the dashboard needs (see
 *     `VAULT_DASHBOARD_COLUMNS`).
 *   • All list queries apply `.limit()` (via pagination) to bound payload size.
 */

import type {
  DashboardListResult,
  DashboardPagination,
  TypedSupabaseClient,
  VaultRow
} from "./dashboard.types";
import {
  applyPagination,
  toError,
  VAULT_DASHBOARD_COLUMNS
} from "./dashboard.utils";

// ---------------------------------------------------------------------------
// Table name constant
// ---------------------------------------------------------------------------

const VAULT_TABLE = "vault" as const;

// ===========================================================================
// Vault shelves — recently added / updated / pinned / favorites / watching
// ===========================================================================

/**
 * Get the user's most recently ADDED vault items (ordered by
 * `created_at` desc). Backs the "Recently Added" shelf (Bible §03).
 */
export async function getRecentlyAdded(
  supabase: TypedSupabaseClient,
  userId: string,
  pagination?: DashboardPagination
): Promise<DashboardListResult<VaultRow>> {
  const query = supabase
    .from(VAULT_TABLE)
    .select(VAULT_DASHBOARD_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const paginated = applyPagination(query, pagination);
  const { data, error } = await paginated;
  return { data: (data ?? []) as VaultRow[], error: toError(error) };
}

/**
 * Get the user's most recently UPDATED vault items (ordered by
 * `updated_at` desc). Backs the "Recently Updated" shelf.
 */
export async function getRecentlyUpdated(
  supabase: TypedSupabaseClient,
  userId: string,
  pagination?: DashboardPagination
): Promise<DashboardListResult<VaultRow>> {
  const query = supabase
    .from(VAULT_TABLE)
    .select(VAULT_DASHBOARD_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const paginated = applyPagination(query, pagination);
  const { data, error } = await paginated;
  return { data: (data ?? []) as VaultRow[], error: toError(error) };
}

/**
 * Get the user's pinned vault items (`is_pinned = true`), ordered by
 * `updated_at` desc. Backs the "Pinned" shelf (Bible §03).
 */
export async function getPinnedItems(
  supabase: TypedSupabaseClient,
  userId: string,
  pagination?: DashboardPagination
): Promise<DashboardListResult<VaultRow>> {
  const query = supabase
    .from(VAULT_TABLE)
    .select(VAULT_DASHBOARD_COLUMNS)
    .eq("user_id", userId)
    .eq("is_pinned", true)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const paginated = applyPagination(query, pagination);
  const { data, error } = await paginated;
  return { data: (data ?? []) as VaultRow[], error: toError(error) };
}

/**
 * Get the user's favorite vault items (`is_favorite = true`), ordered
 * by `updated_at` desc. Backs the "Favorites" shelf (Bible §03).
 */
export async function getFavorites(
  supabase: TypedSupabaseClient,
  userId: string,
  pagination?: DashboardPagination
): Promise<DashboardListResult<VaultRow>> {
  const query = supabase
    .from(VAULT_TABLE)
    .select(VAULT_DASHBOARD_COLUMNS)
    .eq("user_id", userId)
    .eq("is_favorite", true)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const paginated = applyPagination(query, pagination);
  const { data, error } = await paginated;
  return { data: (data ?? []) as VaultRow[], error: toError(error) };
}

/**
 * Get vault items the user is currently watching (`status = "watching"`),
 * ordered by `last_activity_at` desc.
 *
 * Unlike `getContinueWatching` (in `dashboard.continue.ts`), this does
 * NOT apply the `watched_on IS NULL OR completed_at IS NULL` filter —
 * it returns ALL watching items, including those already completed today.
 */
export async function getWatchingNow(
  supabase: TypedSupabaseClient,
  userId: string,
  pagination?: DashboardPagination
): Promise<DashboardListResult<VaultRow>> {
  const query = supabase
    .from(VAULT_TABLE)
    .select(VAULT_DASHBOARD_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "watching")
    .is("deleted_at", null)
    .order("last_activity_at", { ascending: false, nullsFirst: false });

  const paginated = applyPagination(query, pagination);
  const { data, error } = await paginated;
  return { data: (data ?? []) as VaultRow[], error: toError(error) };
}

/**
 * Get vault items the user completed recently (`status = "completed"`),
 * ordered by `completed_at` desc. Excludes rows with a null
 * `completed_at` (those were manually marked completed without a
 * timestamp).
 */
export async function getCompletedRecently(
  supabase: TypedSupabaseClient,
  userId: string,
  pagination?: DashboardPagination
): Promise<DashboardListResult<VaultRow>> {
  const query = supabase
    .from(VAULT_TABLE)
    .select(VAULT_DASHBOARD_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .is("deleted_at", null)
    .order("completed_at", { ascending: false });

  const paginated = applyPagination(query, pagination);
  const { data, error } = await paginated;
  return { data: (data ?? []) as VaultRow[], error: toError(error) };
}

// ===========================================================================
// All vault items — single fetch for dashboard derivation
// ===========================================================================

/**
 * Fetch ALL non-deleted vault items for a user, ordered by `created_at` desc.
 *
 * This is the SINGLE data source for the dashboard — shelves, stats, and
 * the recommendation engine are all derived from this array client-side,
 * avoiding duplicate fetches.
 *
 * @returns All vault rows (empty if none or error).
 */
export async function getAllVaultItems(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<DashboardListResult<VaultRow>> {
  const { data, error } = await supabase
    .from(VAULT_TABLE)
    .select(VAULT_DASHBOARD_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return { data: (data ?? []) as VaultRow[], error: toError(error) };
}
