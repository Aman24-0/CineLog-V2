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

// ---- ProfileRepository (Phase 4) ------------------------------------------
// Modular: profile/ subfolder with types, utils, read, write, repository.
export { ProfileRepository, getProfileRepository } from "./profile";

export type {
  ProfileRow,
  PreferencesRow,
  ProfileInsert,
  ProfileUpdate,
  PreferencesInsert,
  PreferencesUpdate,
  ThemeType,
  DensityType,
  PreferredContentType,
  VaultViewType,
  DiscoverViewType,
  CollectionViewType,
  SortModeType,
  SpoilerLevelType,
  AdultContentType,
  CreateProfilePayload,
  UpdateProfilePayload,
  UpdatePreferencesPayload,
  ProfileResult,
  ProfileWriteResult
} from "./profile";

// ---- CollectionRepository (Phase 4) ---------------------------------------
// Modular: collection/ subfolder covering both `collections` and
// `collection_entries` tables (Database Bible §04 + §05).
// NOTE: SortModeType / CollectionViewType / SortDirection are NOT
// re-exported here from the collection barrel — they are already
// exported from the profile / vault barrels (they alias the same
// generated enums). Re-exporting them again would cause duplicate
// identifier errors.
export { CollectionRepository, getCollectionRepository } from "./collection";

export type {
  CollectionRow,
  CollectionEntryRow,
  CollectionInsert,
  CollectionUpdate,
  CollectionEntryInsert,
  CollectionEntryUpdate,
  CollectionType,
  CreateCollectionPayload,
  UpdateCollectionPayload,
  CollectionEntryIdentity,
  AddItemPayload,
  MoveItemPayload,
  CollectionSortField,
  CollectionSort,
  CollectionPagination,
  CollectionListFilter,
  CollectionSearchQuery,
  CollectionResult,
  CollectionWriteResult
} from "./collection";

// ---- DashboardRepository (Phase 4) ----------------------------------------
// Modular: dashboard/ subfolder. READ-ONLY aggregation layer over
// vault / collections / collection_entries / episode_progress.
// NOTE: VaultRow / CollectionRow / CollectionEntryRow are NOT
// re-exported here from the dashboard barrel — they are already
// exported from the vault / collection barrels (same generated types).
export { DashboardRepository, getDashboardRepository } from "./dashboard";

export type {
  EpisodeProgressRow,
  DashboardPagination,
  VaultStatusCounts,
  VaultCounts,
  CollectionCounts,
  DashboardStats,
  ContinueWatchingItem,
  DashboardResult,
  DashboardListResult
} from "./dashboard";

// ---- DiscoverRepository (Phase 4) -----------------------------------------
// Modular: discover/ subfolder. READ-ONLY layer that answers "what is
// this media's relationship to the user's library?".
// NOTE: VaultRow / CollectionRow / CollectionEntryRow / MediaType are
// NOT re-exported here from the discover barrel — they are already
// exported from the vault / collection barrels (same generated types).
export { DiscoverRepository, getDiscoverRepository } from "./discover";

export type {
  CuratedUniverseRow,
  CuratedUniverseEntryRow,
  UserUniverseSubscriptionRow,
  MediaIdentity,
  UserMediaIdentity,
  VaultState,
  CollectionMembership,
  UniverseMembership,
  DiscoverMetadata,
  UserMediaContext,
  DiscoverResult,
  DiscoverListResult,
  DiscoverBooleanResult
} from "./discover";
