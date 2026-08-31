/**
 * CineLog V2 — Profile Repository: Shared Types
 * ---------------------------------------------------------------------
 * Type definitions shared across the profile repository modules
 * (read, write, utils, repository). Keeping them in one place avoids
 * circular imports and gives callers a single import surface for the
 * public contract.
 *
 * Every type here is derived from the official CLI-generated
 * `database.types.ts` — no hand-rolled shapes, no `any`.
 */

import type {
  Database,
  Enums,
  Tables,
  TablesInsert,
  TablesUpdate
} from "../../database.types";

// ---------------------------------------------------------------------------
// Row / Insert / Update types — direct aliases to the generated types
// ---------------------------------------------------------------------------

/** A single row from the `profiles` table. */
export type ProfileRow = Tables<"profiles">;

/** A single row from the `user_preferences` table (1:1 with profiles). */
export type PreferencesRow = Tables<"user_preferences">;

/** Insert payload for the `profiles` table. */
export type ProfileInsert = TablesInsert<"profiles">;

/** Update payload for the `profiles` table. */
export type ProfileUpdate = TablesUpdate<"profiles">;

/** Insert payload for the `user_preferences` table. */
export type PreferencesInsert = TablesInsert<"user_preferences">;

/** Update payload for the `user_preferences` table. */
export type PreferencesUpdate = TablesUpdate<"user_preferences">;

// ---------------------------------------------------------------------------
// Enum aliases — re-exported so callers do not need to know the enum names
// ---------------------------------------------------------------------------

export type ThemeType = Enums<"theme_type">;
export type DensityType = Enums<"density_type">;
export type PreferredContentType = Enums<"preferred_content_type">;
export type VaultViewType = Enums<"vault_view_type">;
export type DiscoverViewType = Enums<"discover_view_type">;
export type CollectionViewType = Enums<"collection_view_type">;
export type SortModeType = Enums<"sort_mode_type">;
export type SpoilerLevelType = Enums<"spoiler_level_type">;
export type AdultContentType = Enums<"adult_content_type">;

// ---------------------------------------------------------------------------
// Input payload types — narrow, documented subsets of Insert/Update
// ---------------------------------------------------------------------------

/**
 * Payload for {@link createProfile}.
 *
 * `id` is required because it mirrors `auth.users.id` (the profile row
 * is created by an auth trigger — see Database Bible §91 — but the
 * repository exposes a manual create for migrations / tests).
 *
 * `username` and `display_name` are NOT NULL in the live schema.
 * `country` is NOT NULL (ISO 2-char). Everything else is optional.
 */
export interface CreateProfilePayload {
  /** Must equal the authenticated user's `auth.users.id`. */
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
  /** Max 160 characters (Database Bible §01 constraint). */
  readonly bio?: string | null;
  /** ISO 3166-1 alpha-2 country code, e.g. "IN", "US". */
  readonly country: string;
  readonly languageCode?: string;
  readonly timezone?: string;
}

/**
 * Payload for {@link updateProfile}. Every field is optional.
 *
 * Excludes `id` (immutable), `created_at` / `updated_at` (auto-managed
 * by the `set_updated_at()` trigger, Bible §91), and the soft-delete
 * columns `deleted_at` / `scheduled_deletion_at` (use the dedicated
 * `scheduleDeletion` / `restoreProfile` / `permanentlyDeleteProfile`
 * methods instead).
 *
 * Profile favorites (Phase: Profile page):
 *   • favoriteMovieId   — TMDB movie id (text) or null to clear
 *   • favoriteSeriesId  — TMDB tv id (text) or null to clear
 *   • favoriteDirectorId — TMDB person id (text) or null to clear
 *   • favoriteGenre     — genre display name (e.g. "Sci-Fi") or null
 *   • bannerOverridePath — optional TMDB backdrop path or null (legacy)
 *   • bannerType        — 'upload' | 'url' | 'favorite_movie' | 'default'
 *   • bannerUrl         — image URL for upload/url types, null otherwise
 *
 * Social fields removed — socialLinks and isPublic are no longer used
 * in the application (social module removed).
 */
export interface UpdateProfilePayload {
  readonly username?: string;
  readonly displayName?: string;
  readonly avatarUrl?: string | null;
  readonly bio?: string | null;
  readonly country?: string;
  /**
   * State / province — ISO 3166-2 subdivision code OR a human-readable
   * name. Nullable so existing profiles (which have no state) load
   * without breaking. The app validates against the country's
   * subdivision list before writing.
   */
  readonly state?: string | null;
  /**
   * City name. Nullable so existing profiles (which have no city)
   * load without breaking. The app validates against the
   * state's city list before writing.
   */
  readonly city?: string | null;
  readonly languageCode?: string;
  readonly timezone?: string;
  readonly favoriteMovieId?: string | null;
  readonly favoriteSeriesId?: string | null;
  readonly favoriteDirectorId?: string | null;
  readonly favoriteGenre?: string | null;
  readonly bannerOverridePath?: string | null;
  readonly bannerType?: "upload" | "url" | "favorite_movie" | "default";
  readonly bannerUrl?: string | null;
  // socialLinks and isPublic removed — social module removed
}

/**
 * Payload for {@link updatePreferences}. Every field is optional.
 * Operates on the `user_preferences` table (1:1 with profiles).
 */
export interface UpdatePreferencesPayload {
  readonly theme?: ThemeType;
  readonly accentColor?: string;
  readonly density?: DensityType;
  readonly country?: string;
  readonly languageCode?: string;
  readonly timezone?: string;
  readonly preferredContent?: PreferredContentType;
  readonly vaultView?: VaultViewType;
  readonly discoverView?: DiscoverViewType;
  readonly collectionView?: CollectionViewType;
  readonly defaultSort?: SortModeType;
  readonly spoilerLevel?: SpoilerLevelType;
  readonly adultContent?: AdultContentType;
}

// ---------------------------------------------------------------------------
// Result types — uniform `{ data, error }` shape across all methods
// ---------------------------------------------------------------------------

/**
 * Result of a single-row read or write. `data` is `null` when the row
 * is not found or when an error occurred.
 */
export interface ProfileResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
}

/**
 * Result of a write that has no meaningful return value (e.g. delete).
 */
export interface ProfileWriteResult {
  readonly error: Error | null;
}

// ---------------------------------------------------------------------------
// Internal: typed Supabase client used by all repository modules
// ---------------------------------------------------------------------------

/**
 * The Supabase client generic over the CineLog `Database` schema.
 * Shared by all read/write functions so they get full type inference
 * on `.from("profiles")`, `.eq("id", …)`, etc.
 */
export type TypedSupabaseClient =
  import("@supabase/supabase-js").SupabaseClient<Database>;
