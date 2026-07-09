/**
 * CineLog V2 — Supabase Repositories (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the Supabase repository layer. Application code
 * should import repositories and their types from here, not from the
 * individual submodules, so the internal folder layout can evolve
 * without touching call-sites.
 *
 * Pattern (Supabase Integration Guide §05):
 *
 *     Component → Repository → Supabase → Database
 *
 * Repositories are the SOLE place that issues Supabase queries.
 * Components, hooks, and route loaders should never call
 * `supabase.from(...)` directly.
 *
 * Phase scope
 * -----------
 * This is the repository FOUNDATION only. The repositories are NOT
 * wired into the application — the existing Firebase-backed services
 * (`watchlistService.ts`, `useVault.tsx`, …) remain the sole source
 * of truth until the migration explicitly cuts over (Integration
 * Guide §07, Phase 4–5).
 */

// ---- VaultRepository (Phase 4) --------------------------------------------
export { VaultRepository, getVaultRepository } from "./vaultRepository";

export type {
  VaultRow,
  VaultInsert,
  VaultUpdate,
  MediaType,
  VaultStatus,
  VaultIdentity,
  CreateVaultItemPayload,
  VaultSortField,
  SortDirection,
  VaultPagination,
  VaultSort,
  VaultSearchQuery
} from "./vaultRepository";
