/**
 * CineLog V2 — Supabase Integration Layer (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the Supabase SDK integration.
 *
 * NOTE: This top-level barrel is not the primary import path. Most
 * consumers import directly from the sub-modules (`~/lib/supabase/client`,
 * `~/lib/supabase/session`, `~/lib/supabase/repositories`, etc.).
 * The barrel is kept for backwards compatibility with the few callers
 * that still import from `~/lib/supabase`.
 *
 * Re-exports
 * ----------
 * Client accessors
 *   getClient()              — environment-aware accessor (PRIMARY API)
 *   getBrowserClient()       — singleton, browser only
 *   createBrowserClient()    — factory, browser only
 *   createServerClient()     — factory, server only (per-request)
 *   SupabaseClient (type)    — for typed consumers (repositories etc.)
 *
 * Database types (CLI-generated, do not hand-edit)
 *   Database (type)          — generated database schema types
 *   Tables, TablesInsert,
 *   TablesUpdate             — per-table helper types for repositories
 *   Enums, CompositeTypes    — schema-level helper types
 *   Constants                — runtime constant map of enum values
 *   Json                     — JSON value type used by jsonb columns
 *
 * Session helpers
 *   onSessionChange          — subscribe to auth-state events
 *   getServerSession         — SSR-only session reader
 *   getBrowserSession        — browser-only session reader
 *   requireSession           — guard: throw if no session
 *   requireUser              — guard: validated server-side user
 *   SessionRequiredError     — error class for guard failures
 *
 * Repositories
 *   VaultRepository, CollectionRepository, DashboardRepository,
 *   DiscoverRepository, EpisodeProgressRepository, PresetRepository,
 *   ProfileRepository  — type-safe data-access layers
 *   + their types
 *
 * Hooks
 *   useProfile — reactive adapter over ProfileRepository
 */

// ---- Client accessors ---------------------------------------------------
export { getBrowserClient, createBrowserClient } from "./browser";
export type { SupabaseClient } from "./browser";

export { createServerClient } from "./server";

export { getClient } from "./client";

// ---- Database types -----------------------------------------------------
// Type-only re-exports because tsconfig.json has `isolatedModules: true`.
// `Constants` is a runtime value so it uses a normal `export`.
export type {
  Json,
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes
} from "./database.types";

export { Constants } from "./database.types";

// ---- Session helpers ----------------------------------------------------
export {
  onSessionChange,
  getServerSession,
  getBrowserSession,
  requireSession,
  requireUser,
  SessionRequiredError
} from "./session";

export type { SessionChangeCallback, SessionSubscription } from "./session";

// ---- Repositories -------------------------------------------------------
// Re-exported from the repositories barrel so the internal folder
// layout (one file per table) can evolve without touching call-sites.
export { VaultRepository, getVaultRepository } from "./repositories";

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
} from "./repositories";

export {
  ProfileRepository,
  getProfileRepository,
  ensureProfile,
  checkUsernameAvailability
} from "./repositories";

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
} from "./repositories";

export { CollectionRepository, getCollectionRepository } from "./repositories";

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
} from "./repositories";

export { DashboardRepository, getDashboardRepository } from "./repositories";

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
} from "./repositories";

export { DiscoverRepository, getDiscoverRepository } from "./repositories";

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
} from "./repositories";

// ---- Hooks --------------------------------------------------------------
// UI components import hooks from here. Repositories are NEVER used
// directly by components — the hooks are the sole bridge:
//
//     Component → Hook → Repository → Supabase → Database
//
export { useProfile } from "./hooks";
export type { UseProfileReturn } from "./hooks";
