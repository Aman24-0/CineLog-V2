/**
 * CineLog V2 — Supabase Vault Hook
 * ---------------------------------------------------------------------
 * Wraps {@link VaultRepository} into a Solid-friendly hook. Each
 * repository method is exposed as an async operation tracked by the
 * shared `loading` / `error` signals.
 *
 * No business logic. No UI logic. No Firebase interaction. The hook
 * is a thin reactive adapter over the repository — it does NOT cache
 * results, dedupe requests, or manage a vault list signal. Those
 * concerns belong to the consuming component (or a future
 * `createResource`-based hook) during the migration cutover.
 *
 * SSR safety
 * ----------
 * `getVaultRepository()` returns a fresh per-request server client on
 * SSR and the singleton browser client on the client. The hook
 * resolves the repository lazily on each call, so SSR renders without
 * touching the browser singleton.
 */

import { getVaultRepository } from "../repositories";
import type {
  CreateVaultItemPayload,
  MediaType,
  VaultIdentity,
  VaultRow,
  VaultSort,
  VaultStatus,
  VaultSearchQuery,
  VaultPagination
} from "../repositories";
import { createAsyncState } from "./_shared";

/**
 * Result type for single-row vault operations.
 */
type VaultItemResult = { data: VaultRow | null; error: Error | null };
/**
 * Result type for list vault operations.
 */
type VaultListResult = { data: VaultRow[]; error: Error | null };

/**
 * The return type of {@link useVault}.
 */
export interface UseVaultReturn {
  readonly loading: () => boolean;
  readonly error: () => Error | null;
  readonly clearError: () => void;

  // ---- Writes ----
  readonly createVaultItem: (payload: CreateVaultItemPayload) => Promise<VaultItemResult>;
  readonly updateVaultItem: (identity: VaultIdentity, update: Partial<VaultRow>) => Promise<VaultItemResult>;
  readonly updateStatus: (identity: VaultIdentity, status: VaultStatus) => Promise<VaultItemResult>;
  readonly updateRating: (identity: VaultIdentity, rating: number) => Promise<VaultItemResult>;
  readonly updateNotes: (identity: VaultIdentity, notes: string) => Promise<VaultItemResult>;
  readonly updateProgress: (identity: VaultIdentity, progressMinutes: number) => Promise<VaultItemResult>;
  readonly deleteVaultItem: (identity: VaultIdentity) => Promise<VaultItemResult>;
  readonly restoreVaultItem: (identity: VaultIdentity) => Promise<VaultItemResult>;

  // ---- Reads ----
  readonly getVaultItem: (identity: VaultIdentity) => Promise<VaultItemResult>;
  readonly getVaultByTmdbId: (userId: string, tmdbId: number, mediaType: MediaType) => Promise<VaultItemResult>;
  readonly getVaultByStatus: (
    userId: string,
    status: VaultStatus,
    options?: { sort?: VaultSort; pagination?: VaultPagination }
  ) => Promise<VaultListResult>;
  readonly getFavorites: (
    userId: string,
    options?: { sort?: VaultSort; pagination?: VaultPagination }
  ) => Promise<VaultListResult>;
  readonly getPinned: (
    userId: string,
    options?: { sort?: VaultSort; pagination?: VaultPagination }
  ) => Promise<VaultListResult>;
  readonly getRecentlyUpdated: (userId: string, pagination?: VaultPagination) => Promise<VaultListResult>;
  readonly searchVault: (query: VaultSearchQuery) => Promise<VaultListResult>;
}

/**
 * useVault — reactive adapter over {@link VaultRepository}.
 *
 * Each method delegates to the repository and is tracked by the
 * shared `loading` / `error` signals. Repository methods return
 * `{ data, error }` tuples for expected business errors; the `error`
 * signal only captures unexpected throws.
 */
export function useVault(): UseVaultReturn {
  const { loading, error, run, clearError } = createAsyncState();

  // Resolve the repository lazily so SSR gets a fresh server client
  // and the browser gets the singleton.
  const repo = () => getVaultRepository();

  return {
    loading,
    error,
    clearError,

    // ---- Writes ----
    createVaultItem: (payload) => run(() => repo().createVaultItem(payload)),
    updateVaultItem: (identity, update) => run(() => repo().updateVaultItem(identity, update)),
    updateStatus: (identity, status) => run(() => repo().updateStatus(identity, status)),
    updateRating: (identity, rating) => run(() => repo().updateRating(identity, rating)),
    updateNotes: (identity, notes) => run(() => repo().updateNotes(identity, notes)),
    updateProgress: (identity, progressMinutes) => run(() => repo().updateProgress(identity, progressMinutes)),
    deleteVaultItem: (identity) => run(() => repo().deleteVaultItem(identity)),
    restoreVaultItem: (identity) => run(() => repo().restoreVaultItem(identity)),

    // ---- Reads ----
    getVaultItem: (identity) => run(() => repo().getVaultItem(identity)),
    getVaultByTmdbId: (userId, tmdbId, mediaType) => run(() => repo().getVaultByTmdbId(userId, tmdbId, mediaType)),
    getVaultByStatus: (userId, status, options) => run(() => repo().getVaultByStatus(userId, status, options)),
    getFavorites: (userId, options) => run(() => repo().getFavorites(userId, options)),
    getPinned: (userId, options) => run(() => repo().getPinned(userId, options)),
    getRecentlyUpdated: (userId, pagination) => run(() => repo().getRecentlyUpdated(userId, pagination)),
    searchVault: (query) => run(() => repo().searchVault(query))
  };
}
