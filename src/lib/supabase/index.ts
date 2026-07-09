/**
 * CineLog V2 — Supabase Integration Layer (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the Supabase SDK integration. Application code
 * should import from here, not from the individual submodules, so
 * the internal folder layout can evolve without touching call-sites.
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
 * Database types (Phase 2 — CLI-generated, do not hand-edit)
 *   Database (type)          — generated database schema types
 *   Tables, TablesInsert,
 *   TablesUpdate             — per-table helper types for repositories
 *   Enums, CompositeTypes    — schema-level helper types
 *   Constants                — runtime constant map of enum values
 *   Json                     — JSON value type used by jsonb columns
 *
 * Auth wrappers (Phase 3 — authentication foundation)
 *   signUp, signIn, signOut,
 *   getCurrentUser,
 *   getCurrentSession,
 *   refreshSession,
 *   resetPassword,
 *   updatePassword           — imperative auth actions
 *   + input/output types     — EmailPasswordCredentials, SignOutScope,
 *                              UpdatePasswordPayload, etc.
 *
 * Session helpers (Phase 3 — authentication foundation)
 *   onSessionChange          — subscribe to auth-state events
 *   getServerSession         — SSR-only session reader
 *   getBrowserSession        — browser-only session reader
 *   requireSession           — guard: throw if no session
 *   requireUser              — guard: validated server-side user
 *   SessionRequiredError     — error class for guard failures
 *
 * Repositories (Phase 4 — repository foundation)
 *   VaultRepository (class)  — type-safe data-access layer for `vault`
 *   getVaultRepository()     — default instance accessor
 *   + vault types            — VaultRow, VaultIdentity, VaultStatus,
 *                              MediaType, CreateVaultItemPayload, etc.
 *
 * Phase scope
 * -----------
 * The auth, session, and repository modules are the *foundation*
 * only. They are NOT wired into the application — `useAuth`,
 * `src/core/firebase/auth.ts`, `watchlistService.ts`, and `useVault.tsx`
 * remain the sole source of truth until the migration explicitly cuts
 * over (Integration Guide §07, Phase 4–5).
 *
 * `database.types.ts` is the OFFICIAL output of the Supabase CLI
 * `gen types typescript` command, generated directly from the live
 * Supabase project. It is committed UNMODIFIED — do not hand-edit;
 * regenerate instead:
 *
 *     npx supabase login
 *     npx supabase gen types typescript \
 *         --project-id <your-project-ref> \
 *         > src/lib/supabase/database.types.ts
 */

// ---- Client accessors (Phase 1) -------------------------------------------
export { getBrowserClient, createBrowserClient } from "./browser";
export type { SupabaseClient } from "./browser";

export { createServerClient } from "./server";

export { getClient } from "./client";

// ---- Database types (Phase 2) ---------------------------------------------
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

// ---- Auth wrappers (Phase 3) ----------------------------------------------
// Functions are runtime values; types are re-exported as type-only.
export {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  getCurrentSession,
  refreshSession,
  resetPassword,
  updatePassword
} from "./auth";

export type {
  EmailPasswordCredentials,
  SignUpMetadata,
  EmailRedirectOptions,
  UpdatePasswordPayload,
  SignOutScope,
  GetSessionResult,
  SignOutResult,
  ResetPasswordResult,
  // SDK types re-exported via ./auth for caller convenience.
  AuthError,
  AuthResponse,
  AuthTokenResponsePassword,
  Session,
  User,
  UserResponse
} from "./auth";

// ---- Session helpers (Phase 3) --------------------------------------------
export {
  onSessionChange,
  getServerSession,
  getBrowserSession,
  requireSession,
  requireUser,
  SessionRequiredError
} from "./session";

export type {
  SessionChangeCallback,
  SessionSubscription
} from "./session";

// ---- Repositories (Phase 4) -----------------------------------------------
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

export { ProfileRepository, getProfileRepository } from "./repositories";

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



