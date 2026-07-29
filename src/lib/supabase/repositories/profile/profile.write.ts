/**
 * CineLog V2 — Profile Repository: Write Operations
 * ---------------------------------------------------------------------
 * Pure, stateless write functions over the `profiles` and
 * `user_preferences` tables. Mirrors the design of `profile.read.ts`:
 * each function takes a typed Supabase client as its first argument.
 *
 * Account-lifecycle operations (scheduleDeletion, restoreProfile,
 * permanentlyDeleteProfile) live in `./profile.lifecycle.ts`.
 *
 * RLS compliance (Database Bible §90)
 * -----------------------------------
 *   • `profiles` RLS allows SELECT/UPDATE where `id = auth.uid()`.
 *     INSERT is typically allowed for the user's own id (the auth
 *     trigger creates the row, but the repository also supports
 *     explicit creation for migrations).
 *   • `user_preferences` RLS allows read/write where
 *     `user_id = auth.uid()`.
 *
 * Trigger compliance (Database Bible §91)
 * ---------------------------------------
 *   • `updated_at` is auto-maintained by the `set_updated_at()`
 *     trigger — the repository NEVER writes it manually.
 *   • `created_at` is auto-defaulted — never written manually.
 *   • The auth trigger (`auth.users INSERT → profiles →
 *     user_preferences`) creates both rows on signup. The
 *     repository's `createProfile` is for migrations / tests / manual
 *     provisioning where the trigger has not run.
 */

import type {
  CreateProfilePayload,
  PreferencesRow,
  ProfileResult,
  ProfileRow,
  TypedSupabaseClient,
  UpdatePreferencesPayload,
  UpdateProfilePayload
} from "./profile.types";
import {
  toError,
  toPreferencesUpdate,
  toProfileInsert,
  toProfileUpdate,
  validateBio,
  validateCountry
} from "./profile.utils";

// ---------------------------------------------------------------------------
// Table name constants
// ---------------------------------------------------------------------------

const PROFILES_TABLE = "profiles" as const;
const PREFERENCES_TABLE = "user_preferences" as const;

// ---------------------------------------------------------------------------
// Creates
// ---------------------------------------------------------------------------

/**
 * Create a new profile row.
 *
 * In normal operation the auth trigger (Database Bible §91) creates
 * this row automatically on signup. This method exists for:
 *   - Migrating existing Firebase users into Supabase.
 *   - Tests / dev seeding.
 *   - Recovery if the trigger failed.
 *
 * @returns The newly created profile row, or `null` + `error`.
 */
export async function createProfile(
  supabase: TypedSupabaseClient,
  payload: CreateProfilePayload
): Promise<ProfileResult<ProfileRow>> {
  const bioError = validateBio(payload.bio);
  if (bioError) return { data: null, error: bioError };

  const countryError = validateCountry(payload.country);
  if (countryError) return { data: null, error: countryError };

  const insert = toProfileInsert(payload);
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .insert(insert)
    .select()
    .single();

  return { data, error: toError(error) };
}

// ---------------------------------------------------------------------------
// Updates — targeted + general
// ---------------------------------------------------------------------------

/**
 * Partially update a profile by user id.
 *
 * Validates bio (≤160 chars) and country (2-char ISO) before hitting
 * the DB. Does NOT touch `id`, `created_at`, `updated_at` (trigger),
 * or the soft-delete columns.
 *
 * @returns The updated profile row, or `null` + `error`.
 */
export async function updateProfile(
  supabase: TypedSupabaseClient,
  userId: string,
  payload: UpdateProfilePayload
): Promise<ProfileResult<ProfileRow>> {
  const bioError = validateBio(payload.bio);
  if (bioError) return { data: null, error: bioError };

  const countryError = validateCountry(payload.country);
  if (countryError) return { data: null, error: countryError };

  const update = toProfileUpdate(payload);
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .update(update)
    .eq("id", userId)
    .is("deleted_at", null)
    .select()
    .single();

  return { data, error: toError(error) };
}

/**
 * Update only the avatar URL. Convenience wrapper around
 * {@link updateProfile}.
 *
 * @returns The updated profile row, or `null` + `error`.
 */
export async function updateAvatar(
  supabase: TypedSupabaseClient,
  userId: string,
  avatarUrl: string | null
): Promise<ProfileResult<ProfileRow>> {
  return updateProfile(supabase, userId, { avatarUrl });
}

/**
 * Update only the bio. Validates the 160-char limit first.
 *
 * @returns The updated profile row, or `null` + `error`.
 */
export async function updateBio(
  supabase: TypedSupabaseClient,
  userId: string,
  bio: string | null
): Promise<ProfileResult<ProfileRow>> {
  return updateProfile(supabase, userId, { bio });
}

/**
 * Update profile metadata for the Profile redesign (social links,
 * avatar/banner URL overrides, bio, display name, and visibility).
 *
 * Convenience wrapper around {@link updateProfile} that takes the
 * Profile-redesign payload shape (camelCase) and forwards the
 * camelCase → snake_case mapping to `toProfileUpdate`.
 *
 * All fields are optional — pass only what you want to change.
 *
 * @returns The updated profile row, or `null` + `error`.
 */
export async function updateProfileMetadata(
  supabase: TypedSupabaseClient,
  userId: string,
  payload: {
    displayName?: string;
    bio?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    socialLinks?: Record<string, string> | null;
  }
): Promise<ProfileResult<ProfileRow>> {
  return updateProfile(supabase, userId, payload);
}

/**
 * Toggle profile visibility (public / private).
 *
 * @returns The updated profile row, or `null` + `error`.
 */
export async function toggleProfileVisibility(
  supabase: TypedSupabaseClient,
  userId: string,
  isPublic: boolean
): Promise<ProfileResult<ProfileRow>> {
  return updateProfile(supabase, userId, { isPublic });
}

// ---------------------------------------------------------------------------
// Preferences — upsert on the 1:1 user_preferences table
// ---------------------------------------------------------------------------

/**
 * Update (or insert) the user's preferences row.
 *
 * The `user_preferences` table is 1:1 with `profiles` via
 * `user_preferences_user_fk` (Database Bible §02). This method does
 * an upsert: if a row exists it is updated; if not, it is inserted
 * with the supplied fields plus defaults from the DB schema.
 *
 * @returns The preferences row after the upsert, or `null` + `error`.
 */
export async function updatePreferences(
  supabase: TypedSupabaseClient,
  userId: string,
  payload: UpdatePreferencesPayload
): Promise<ProfileResult<PreferencesRow>> {
  const update = toPreferencesUpdate(payload);

  // Upsert: on conflict over the unique user_id, update. The
  // `user_id` is always set so a missing row is created with the
  // correct owner.
  const { data, error } = await supabase
    .from(PREFERENCES_TABLE)
    .upsert({ user_id: userId, ...update }, { onConflict: "user_id" })
    .select()
    .single();

  return { data, error: toError(error) };
}

// ---------------------------------------------------------------------------
// Account lifecycle — scheduleDeletion / restoreProfile /
// permanentlyDeleteProfile live in `./profile.lifecycle.ts` to keep this
// module under 250 lines and give the lifecycle flow its own auditable
// home.
// ---------------------------------------------------------------------------
