/**
 * CineLog V2 — Dashboard Repository: Stats (Count Aggregation)
 * ---------------------------------------------------------------------
 * READ-ONLY count queries for the dashboard stats cards. Uses
 * PostgREST's `head: true` + `count: "exact"` to avoid transferring
 * any row data (Database Bible §12: "Select only needed columns").
 *
 * Split out from `dashboard.read.ts` to keep both files under 250
 * lines and to give the count-aggregation logic its own focused home.
 */

import type {
  CollectionCounts,
  DashboardResult,
  DashboardStats,
  TypedSupabaseClient,
  VaultCounts,
  VaultStatusCounts
} from "./dashboard.types";
import { toError } from "./dashboard.utils";

// ---------------------------------------------------------------------------
// Table name constants
// ---------------------------------------------------------------------------

const VAULT_TABLE = "vault" as const;
const COLLECTIONS_TABLE = "collections" as const;

// ---------------------------------------------------------------------------
// Internal: count helper — awaits a head-only count promise
// ---------------------------------------------------------------------------

/**
 * Result of a PostgREST `head: true` + `count: "exact"` query.
 * The builder's `.select("id", { count, head })` resolves to this.
 */
interface CountResult {
  count: number | null;
  error: unknown;
}

/**
 * Run a head-only count query and normalise the result.
 *
 * The caller passes a builder that already has the desired filters
 * applied and is configured with `{ count: "exact", head: true }`.
 */
async function runCount(promise: PromiseLike<CountResult> | CountResult): Promise<{ count: number; error: Error | null }> {
  // `PromiseLike` covers both the awaited and unawaited shapes.
  const result = await (promise as Promise<CountResult>);
  return { count: result.count ?? 0, error: toError(result.error) };
}

// ---------------------------------------------------------------------------
// Vault counts
// ---------------------------------------------------------------------------

/**
 * Count the user's vault items grouped by status, plus favorites and
 * pinned counts. Returns zero-filled counts on error.
 *
 * Issues 8 count queries in parallel (total + 5 statuses + favorites +
 * pinned). Each uses `head: true` so no row data is transferred.
 */
export async function getVaultCounts(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<DashboardResult<VaultCounts>> {
  const baseVault = () =>
    supabase.from(VAULT_TABLE).select("id", { count: "exact", head: true }).eq("user_id", userId).is("deleted_at", null);

  const [total, planned, watching, completed, onHold, dropped, favorites, pinned] = await Promise.all([
    runCount(baseVault()),
    runCount(baseVault().eq("status", "planned")),
    runCount(baseVault().eq("status", "watching")),
    runCount(baseVault().eq("status", "completed")),
    runCount(baseVault().eq("status", "on_hold")),
    runCount(baseVault().eq("status", "dropped")),
    runCount(baseVault().eq("is_favorite", true)),
    runCount(baseVault().eq("is_pinned", true))
  ]);

  const firstError =
    total.error ?? planned.error ?? watching.error ?? completed.error ??
    onHold.error ?? dropped.error ?? favorites.error ?? pinned.error;
  if (firstError) return { data: null, error: firstError };

  const byStatus: VaultStatusCounts = {
    planned: planned.count,
    watching: watching.count,
    completed: completed.count,
    onHold: onHold.count,
    dropped: dropped.count
  };

  return {
    data: { total: total.count, byStatus, favorites: favorites.count, pinned: pinned.count },
    error: null
  };
}

// ---------------------------------------------------------------------------
// Collection counts
// ---------------------------------------------------------------------------

/**
 * Count the user's collections grouped by type. Returns zero-filled
 * counts on error.
 *
 *   - USER collections: owned by this user (user_id = userId).
 *   - CURATED collections: global (user_id IS NULL), readable by all.
 *   - SMART collections: also user-owned in the live schema.
 */
export async function getCollectionCounts(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<DashboardResult<CollectionCounts>> {
  const baseCollections = () =>
    supabase.from(COLLECTIONS_TABLE).select("id", { count: "exact", head: true }).is("deleted_at", null);

  const [userCount, curatedCount, smartCount] = await Promise.all([
    runCount(baseCollections().eq("user_id", userId).eq("collection_type", "user")),
    runCount(baseCollections().is("user_id", null).eq("collection_type", "curated")),
    runCount(baseCollections().eq("user_id", userId).eq("collection_type", "smart"))
  ]);

  const firstError = userCount.error ?? curatedCount.error ?? smartCount.error;
  if (firstError) return { data: null, error: firstError };

  const user = userCount.count;
  const curated = curatedCount.count;
  const smart = smartCount.count;

  return {
    data: { total: user + curated + smart, user, curated, smart },
    error: null
  };
}

// ---------------------------------------------------------------------------
// Combined dashboard stats
// ---------------------------------------------------------------------------

/**
 * Get the full dashboard stats payload — vault counts + collection
 * counts — in a single call. Runs the two aggregation queries in
 * parallel.
 */
export async function getDashboardStats(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<DashboardResult<DashboardStats>> {
  const [vault, collections] = await Promise.all([
    getVaultCounts(supabase, userId),
    getCollectionCounts(supabase, userId)
  ]);

  if (vault.error) return { data: null, error: vault.error };
  if (collections.error) return { data: null, error: collections.error };

  return {
    data: { vault: vault.data!, collections: collections.data! },
    error: null
  };
}
