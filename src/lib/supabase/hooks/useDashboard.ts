/**
 * CineLog V2 — Supabase Dashboard Hook
 * ---------------------------------------------------------------------
 * Wraps {@link DashboardRepository} (read-only) into a Solid-friendly
 * hook.
 *
 * No business logic. No UI logic. No Firebase interaction. The hook
 * is a thin reactive adapter — it does NOT cache shelf results. The
 * consuming component owns result state (e.g. via `createResource`).
 */

import { getDashboardRepository } from "../repositories";
import type {
  CollectionCounts,
  ContinueWatchingItem,
  DashboardListResult,
  DashboardPagination,
  DashboardResult,
  DashboardStats,
  VaultCounts,
  VaultRow
} from "../repositories";
import { createAsyncState } from "./_shared";

/**
 * The return type of {@link useDashboard}.
 */
export interface UseDashboardReturn {
  readonly loading: () => boolean;
  readonly error: () => Error | null;
  readonly clearError: () => void;

  // ---- Stats ----
  readonly getDashboardStats: (userId: string) => Promise<DashboardResult<DashboardStats>>;
  readonly getVaultCounts: (userId: string) => Promise<DashboardResult<VaultCounts>>;
  readonly getCollectionCounts: (userId: string) => Promise<DashboardResult<CollectionCounts>>;

  // ---- Continue Watching ----
  readonly getContinueWatching: (
    userId: string,
    pagination?: DashboardPagination
  ) => Promise<DashboardListResult<ContinueWatchingItem>>;

  // ---- Vault shelves ----
  readonly getRecentlyAdded: (userId: string, pagination?: DashboardPagination) => Promise<DashboardListResult<VaultRow>>;
  readonly getRecentlyUpdated: (userId: string, pagination?: DashboardPagination) => Promise<DashboardListResult<VaultRow>>;
  readonly getPinnedItems: (userId: string, pagination?: DashboardPagination) => Promise<DashboardListResult<VaultRow>>;
  readonly getFavorites: (userId: string, pagination?: DashboardPagination) => Promise<DashboardListResult<VaultRow>>;
  readonly getWatchingNow: (userId: string, pagination?: DashboardPagination) => Promise<DashboardListResult<VaultRow>>;
  readonly getCompletedRecently: (userId: string, pagination?: DashboardPagination) => Promise<DashboardListResult<VaultRow>>;
}

/**
 * useDashboard — reactive adapter over {@link DashboardRepository}.
 *
 * The underlying repository is READ-ONLY, so this hook exposes no
 * write operations.
 */
export function useDashboard(): UseDashboardReturn {
  const { loading, error, run, clearError } = createAsyncState();
  const repo = () => getDashboardRepository();

  return {
    loading,
    error,
    clearError,

    // ---- Stats ----
    getDashboardStats: (userId) => run(() => repo().getDashboardStats(userId)),
    getVaultCounts: (userId) => run(() => repo().getVaultCounts(userId)),
    getCollectionCounts: (userId) => run(() => repo().getCollectionCounts(userId)),

    // ---- Continue Watching ----
    getContinueWatching: (userId, pagination) => run(() => repo().getContinueWatching(userId, pagination)),

    // ---- Vault shelves ----
    getRecentlyAdded: (userId, pagination) => run(() => repo().getRecentlyAdded(userId, pagination)),
    getRecentlyUpdated: (userId, pagination) => run(() => repo().getRecentlyUpdated(userId, pagination)),
    getPinnedItems: (userId, pagination) => run(() => repo().getPinnedItems(userId, pagination)),
    getFavorites: (userId, pagination) => run(() => repo().getFavorites(userId, pagination)),
    getWatchingNow: (userId, pagination) => run(() => repo().getWatchingNow(userId, pagination)),
    getCompletedRecently: (userId, pagination) => run(() => repo().getCompletedRecently(userId, pagination))
  };
}
