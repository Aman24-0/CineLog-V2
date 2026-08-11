/**
 * CineLog V2 — Dashboard Repository
 * ---------------------------------------------------------------------
 * READ-ONLY aggregation layer for the CineLog dashboard. Composes the
 * functions in `dashboard.read.ts` into a single class with a clean
 * public API. This is the only file callers should import directly
 * (via the barrel at `repositories/dashboard/index.ts`).
 *
 * ⚠️  This repository contains NO write operations. It exists solely
 *     to aggregate dashboard data from `vault`, `collections`,
 *     `collection_entries`, and `episode_progress`. All mutations go
 *     through the Vault / Collection repositories.
 *
 * The class holds a typed Supabase client and delegates every method
 * to the corresponding function in `dashboard.read.ts`. This keeps the
 * class thin (Single Responsibility: orchestration) while the query
 * logic lives in testable, stateless functions.
 *
 * Pattern (Supabase Integration Guide §05):
 *
 *     Component → DashboardRepository → Supabase → Database (read-only)
 *
 * Phase scope
 * -----------
 * Foundation only. NOT wired into the application — the existing
 * Firebase-backed `recommendationEngine.ts` and `DashboardPage.tsx`
 * remain the sole source of dashboard truth until the migration
 * explicitly cuts over (Integration Guide §07, Phase 4–5).
 */

import { getClient } from "../../client";
import type { TypedSupabaseClient } from "./dashboard.types";
import {
  getCollectionCounts,
  getDashboardStats,
  getVaultCounts
} from "./dashboard.stats";
import { getContinueWatching } from "./dashboard.continue";
import {
  getAllVaultItems,
  getCompletedRecently,
  getFavorites,
  getPinnedItems,
  getRecentlyAdded,
  getRecentlyUpdated,
  getWatchingNow
} from "./dashboard.read";
import type {
  CollectionCounts,
  ContinueWatchingItem,
  DashboardListResult,
  DashboardPagination,
  DashboardResult,
  DashboardStats,
  VaultCounts,
  VaultRow
} from "./dashboard.types";

// ---------------------------------------------------------------------------
// DashboardRepository
// ---------------------------------------------------------------------------

export class DashboardRepository {
  private readonly supabase: TypedSupabaseClient;

  /**
   * @param client  Optional Supabase client. Defaults to the
   *                environment-aware `getClient()` (browser singleton
   *                or SSR per-request client). Pass an explicit client
   *                for tests or per-request isolation.
   */
  constructor(client: TypedSupabaseClient = getClient()) {
    this.supabase = client;
  }

  // ---- Stats ----------------------------------------------------------

  /** Full dashboard stats: vault counts + collection counts (one call). */
  getDashboardStats(userId: string): Promise<DashboardResult<DashboardStats>> {
    return getDashboardStats(this.supabase, userId);
  }

  /** Vault-only counts: total, by status, favorites, pinned. */
  getVaultCounts(userId: string): Promise<DashboardResult<VaultCounts>> {
    return getVaultCounts(this.supabase, userId);
  }

  /** Collection counts by type (user / curated / smart). */
  getCollectionCounts(
    userId: string
  ): Promise<DashboardResult<CollectionCounts>> {
    return getCollectionCounts(this.supabase, userId);
  }

  // ---- All vault items (single source for dashboard derivation) --------

  /** Fetch ALL non-deleted vault items for the dashboard (single source). */
  getAllVaultItems(
    userId: string,
    abortSignal?: AbortSignal
  ): Promise<DashboardListResult<VaultRow>> {
    return getAllVaultItems(this.supabase, userId, abortSignal);
  }

  // ---- Continue Watching (Bible §03 rules) ----------------------------

  /** Continue Watching items with latest episode progress (TV/Anime). */
  getContinueWatching(
    userId: string,
    pagination?: DashboardPagination
  ): Promise<DashboardListResult<ContinueWatchingItem>> {
    return getContinueWatching(this.supabase, userId, pagination);
  }

  // ---- Vault shelves --------------------------------------------------

  /** Recently added vault items (created_at desc). */
  getRecentlyAdded(
    userId: string,
    pagination?: DashboardPagination
  ): Promise<DashboardListResult<VaultRow>> {
    return getRecentlyAdded(this.supabase, userId, pagination);
  }

  /** Recently updated vault items (updated_at desc). */
  getRecentlyUpdated(
    userId: string,
    pagination?: DashboardPagination
  ): Promise<DashboardListResult<VaultRow>> {
    return getRecentlyUpdated(this.supabase, userId, pagination);
  }

  /** Pinned vault items (is_pinned = true). */
  getPinnedItems(
    userId: string,
    pagination?: DashboardPagination
  ): Promise<DashboardListResult<VaultRow>> {
    return getPinnedItems(this.supabase, userId, pagination);
  }

  /** Favorite vault items (is_favorite = true). */
  getFavorites(
    userId: string,
    pagination?: DashboardPagination
  ): Promise<DashboardListResult<VaultRow>> {
    return getFavorites(this.supabase, userId, pagination);
  }

  /** Items currently being watched (status = "watching"). */
  getWatchingNow(
    userId: string,
    pagination?: DashboardPagination
  ): Promise<DashboardListResult<VaultRow>> {
    return getWatchingNow(this.supabase, userId, pagination);
  }

  /** Items completed recently (status = "completed", completed_at desc). */
  getCompletedRecently(
    userId: string,
    pagination?: DashboardPagination
  ): Promise<DashboardListResult<VaultRow>> {
    return getCompletedRecently(this.supabase, userId, pagination);
  }
}

// ---------------------------------------------------------------------------
// Default singleton — browser caches; SSR is always fresh
// ---------------------------------------------------------------------------

let _defaultInstance: DashboardRepository | null = null;

/**
 * Get the default DashboardRepository instance.
 *
 * Browser: lazily-initialised singleton sharing the singleton browser
 * client. SSR: fresh instance per call (auth state isolation).
 */
export function getDashboardRepository(): DashboardRepository {
  if (typeof window === "undefined") {
    return new DashboardRepository();
  }
  if (!_defaultInstance) {
    _defaultInstance = new DashboardRepository();
  }
  return _defaultInstance;
}
