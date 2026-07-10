/**
 * CineLog V2 — Profile Repository: Read Operations
 * ---------------------------------------------------------------------
 * Pure, stateless read functions over the `profiles` and
 * `user_preferences` tables. Each function takes a typed Supabase
 * client as its first argument so the main repository class can pass
 * its configured client (and tests can pass a mock).
 *
 * RLS compliance (Database Bible §90)
 * -----------------------------------
 *   • `profiles` RLS: "User can read/update own profile" — policy
 *     is `id = auth.uid()`. The functions do NOT add a client-side
 *     `user_id` filter because the PK *is* the user id; RLS handles
 *     the access control.
 *   • `user_preferences` RLS: "Owner can read/write only own
 *     preferences" — policy is `user_id = auth.uid()`.
 *   • The functions never use the service role key.
 *
 * Soft-delete handling
 * --------------------
 *   • `getProfile` excludes soft-deleted rows (`deleted_at IS NULL`)
 *     so a trashed profile is invisible to normal reads.
 *   • A separate `getTrashedProfile` could be added if the UI ever
 *     needs a "recently deleted" view; for now the repository stays
 *     minimal.
 */

import type {
  PreferencesRow,
  ProfileResult,
  ProfileRow,
  TypedSupabaseClient
} from "./profile.types";
import { toError } from "./profile.utils";

// ---------------------------------------------------------------------------
// Table name constants — single source of truth for this module
// ---------------------------------------------------------------------------

const PROFILES_TABLE = "profiles" as const;
const PREFERENCES_TABLE = "user_preferences" as const;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Get a single profile by its id (= `auth.users.id`).
 *
 * Excludes soft-deleted rows (`deleted_at IS NULL`).
 *
 * @returns The profile row, or `null` if not found / error.
 */
export async function getProfile(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<ProfileResult<ProfileRow>> {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select()
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  return { data, error: toError(error) };
}

/**
 * Get a single profile by its (unique) username.
 *
 * Username lookups are case-insensitive because the `username` column
 * is `citext` (Database Bible §01). PostgREST `eq` on a `citext`
 * column is already case-insensitive, so no `ilike` is needed.
 *
 * Excludes soft-deleted rows.
 *
 * @returns The profile row, or `null` if not found / error.
 */
export async function getProfileByUsername(
  supabase: TypedSupabaseClient,
  username: string
): Promise<ProfileResult<ProfileRow>> {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select()
    .eq("username", username)
    .is("deleted_at", null)
    .maybeSingle();

  return { data, error: toError(error) };
}

/**
 * Get the preferences row for a user (1:1 with profiles).
 *
 * Exposed as a read helper because {@link updatePreferences} in the
 * write module needs to know whether a row already exists (insert vs
 * update). Also useful for callers who want the current preferences
 * alongside the profile.
 *
 * @returns The preferences row, or `null` if not found / error.
 */
export async function getPreferences(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<ProfileResult<PreferencesRow>> {
  const { data, error } = await supabase
    .from(PREFERENCES_TABLE)
    .select()
    .eq("user_id", userId)
    .maybeSingle();

  return { data, error: toError(error) };
}

/**
 * Check whether a profile exists with the given id (excluding
 * soft-deleted rows). Cheaper than {@link getProfile} when the caller
 * only needs a boolean.
 */
export async function profileExists(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<{ exists: boolean; error: Error | null }> {
  // .select("id") + .limit(1) + .maybeSingle() — minimal column read.
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select("id")
    .eq("id", userId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  return { exists: data !== null, error: toError(error) };
}
