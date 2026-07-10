/**
 * CineLog V2 — Profile Repository: Account Lifecycle Operations
 * ---------------------------------------------------------------------
 * Account-deletion lifecycle functions. Split out from
 * `profile.write.ts` to keep every module under ~250 lines and to
 * give the lifecycle flow its own auditable home.
 *
 * Lifecycle (Database Bible §00 + §01)
 * -----------------------------------
 *
 *     scheduleDeletion   →   sets scheduled_deletion_at = now + 7d
 *                             (row stays readable so the user can cancel)
 *               │
 *               ▼
 *     restoreProfile     →   clears scheduled_deletion_at
 *                             (cancels within the 7-day window)
 *               │
 *               ▼  (after 7 days, via pg_cron + admin edge function)
 *
 *     permanentlyDeleteProfile → hard DELETE the row
 *                                 (requires service-role client — RLS
 *                                  blocks DELETE for regular users)
 *
 * RLS compliance (Database Bible §90)
 * -----------------------------------
 *   • `profiles` RLS: `SELECT/UPDATE: id = auth.uid()`.
 *   • `scheduleDeletion` and `restoreProfile` are UPDATEs — allowed
 *     for the user's own profile.
 *   • `permanentlyDeleteProfile` is a DELETE — NOT in the standard
 *     RLS policy. It requires an elevated-privilege client (service
 *     role key or admin edge function). See the method's docstring.
 */

import type {
  ProfileResult,
  ProfileRow,
  ProfileWriteResult,
  TypedSupabaseClient
} from "./profile.types";
import { computeScheduledDeletionAt, toError } from "./profile.utils";
import {
  sanitizeUsername,
  generateUsernameCandidates,
  displayNameFromMetadata,
} from "~/shared/utils/username";

// ---------------------------------------------------------------------------
// Table name constant
// ---------------------------------------------------------------------------

const PROFILES_TABLE = "profiles" as const;

// ---------------------------------------------------------------------------
// Lifecycle operations
// ---------------------------------------------------------------------------

/**
 * Schedule the account for deletion.
 *
 * Sets `scheduled_deletion_at` to `now + 7 days` (Database Bible §00:
 * "Account Delete → 7-day Recovery → Permanent Delete"). The row
 * remains readable so the user can cancel during the recovery window.
 *
 * Only schedules if not already scheduled (the `.is("scheduled_deletion_at", null)`
 * guard prevents overwriting an existing schedule).
 *
 * @param deletionAt  Optional override for the deletion timestamp
 *                    (e.g. for tests). Defaults to `now + 7 days`.
 * @returns The updated profile row, or `null` + `error`.
 */
export async function scheduleDeletion(
  supabase: TypedSupabaseClient,
  userId: string,
  deletionAt?: string
): Promise<ProfileResult<ProfileRow>> {
  const scheduledAt = deletionAt ?? computeScheduledDeletionAt();
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .update({ scheduled_deletion_at: scheduledAt })
    .eq("id", userId)
    .is("deleted_at", null)
    .is("scheduled_deletion_at", null)
    .select()
    .single();

  return { data, error: toError(error) };
}

/**
 * Restore a profile that was scheduled for deletion.
 *
 * Clears `scheduled_deletion_at`. Only works while the profile has
 * not been permanently deleted. The `.not("scheduled_deletion_at", "is", null)`
 * guard ensures the restore is a no-op if no deletion was scheduled.
 *
 * @returns The restored profile row, or `null` + `error`.
 */
export async function restoreProfile(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<ProfileResult<ProfileRow>> {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .update({ scheduled_deletion_at: null })
    .eq("id", userId)
    .not("scheduled_deletion_at", "is", null)
    .select()
    .single();

  return { data, error: toError(error) };
}

/**
 * Permanently delete a profile.
 *
 * ⚠️  ARCHITECTURE NOTE (Database Bible §90 + §00)
 * -----------------------------------------------
 * The standard `profiles` RLS policy is `SELECT/UPDATE: id = auth.uid()`.
 * DELETE is NOT included — a regular user JWT cannot delete their own
 * profile. This method therefore requires an elevated-privilege
 * client (service role key or an admin edge function) and will return
 * an RLS error if called with the standard anon-key client.
 *
 * The intended production flow is:
 *   1. User calls {@link scheduleDeletion} (sets `scheduled_deletion_at`).
 *   2. A pg_cron job (Bible §96) finds rows past the recovery window
 *      and invokes an admin edge function.
 *   3. The edge function calls this method with a service-role client.
 *
 * This repository does NOT ship a service-role client — that is the
 * caller's responsibility. The method is exposed here so the deletion
 * logic lives in one auditable place.
 *
 * @returns `{ error }` — null on success.
 */
export async function permanentlyDeleteProfile(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<ProfileWriteResult> {
  const { error } = await supabase
    .from(PROFILES_TABLE)
    .delete()
    .eq("id", userId);

  return { error: toError(error) };
}

// ---------------------------------------------------------------------------
// Profile initialization — auto-populate display name + username
// ---------------------------------------------------------------------------

/**
 * Ensure a profile exists and has a display_name + username.
 *
 * Called on auth state change when a user signs in. If the profile
 * doesn't exist, it's created with auto-generated display_name and
 * username from the auth user's metadata.
 *
 * If the profile exists but has no display_name (or the display_name
 * equals the UUID — the Supabase trigger default), it's auto-populated
 * from the auth user's metadata. Once the user manually edits their
 * display_name, it's never overwritten.
 *
 * Username generation:
 *   1. Sanitize email local part → base username
 *   2. Check availability via getProfileByUsername
 *   3. If taken, try candidates: base24, base_24, base247, ...
 *   4. First available candidate wins
 *
 * @returns The profile row (existing or newly created).
 */
export async function ensureProfile(
  supabase: TypedSupabaseClient,
  userId: string,
  authUser: {
    email?: string | null;
    userMetadata?: Record<string, unknown> | null;
  } | null,
): Promise<ProfileResult<ProfileRow>> {
  // 1. Check if the profile already exists.
  const { data: existing, error: fetchError } = await supabase
    .from(PROFILES_TABLE)
    .select()
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) {
    return { data: null, error: toError(fetchError) };
  }

  // 2. If profile exists, check if display_name or username need auto-populating.
  if (existing) {
    const updates: Partial<ProfileRow> = {};
    const email = authUser?.email ?? null;
    const metadata = authUser?.userMetadata ?? null;

    // Auto-populate display_name if it's empty or equals the UUID (trigger default).
    const needsDisplayName =
      !existing.display_name ||
      existing.display_name === userId ||
      existing.display_name === "CINELOG USER" ||
      existing.display_name.trim() === "";

    if (needsDisplayName) {
      updates.display_name = displayNameFromMetadata(metadata, email);
    }

    // Auto-populate username if it's empty or equals the UUID (trigger default).
    const needsUsername =
      !existing.username ||
      existing.username === userId ||
      existing.username.trim() === "";

    if (needsUsername && email) {
      const baseUsername = sanitizeUsername(email);
      const availableUsername = await findAvailableUsername(supabase, baseUsername);
      if (availableUsername) {
        updates.username = availableUsername;
      }
    }

    // Only update if there are changes to make.
    if (Object.keys(updates).length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from(PROFILES_TABLE)
        .update(updates)
        .eq("id", userId)
        .is("deleted_at", null)
        .select()
        .single();
      return { data: updated, error: toError(updateError) };
    }

    return { data: existing, error: null };
  }

  // 3. Profile doesn't exist — create it with auto-generated fields.
  const email = authUser?.email ?? null;
  const metadata = authUser?.userMetadata ?? null;
  const displayName = displayNameFromMetadata(metadata, email);
  const baseUsername = email ? sanitizeUsername(email) : "cinephile";
  const username = email ? await findAvailableUsername(supabase, baseUsername) : baseUsername;

  const { data: created, error: createError } = await supabase
    .from(PROFILES_TABLE)
    .insert({
      id: userId,
      username: username ?? baseUsername,
      display_name: displayName,
      country: "US", // default — user can change later
    })
    .select()
    .single();

  return { data: created, error: toError(createError) };
}

/**
 * Check if a username is available (not taken by any other user).
 *
 * Usernames are case-insensitive (citext column) so the check is
 * case-insensitive.
 */
export async function checkUsernameAvailability(
  supabase: TypedSupabaseClient,
  username: string,
  excludeUserId?: string,
): Promise<{ available: boolean; error: Error | null }> {
  let query = supabase
    .from(PROFILES_TABLE)
    .select("id")
    .eq("username", username)
    .is("deleted_at", null)
    .limit(1);

  if (excludeUserId) {
    query = query.neq("id", excludeUserId);
  }

  const { data, error } = await query.maybeSingle();
  return { available: data === null, error: toError(error) };
}

/**
 * Find an available username by trying candidates in order.
 *
 * @param supabase The Supabase client.
 * @param baseUsername The sanitized base username (from email).
 * @returns The first available username, or null if all candidates are taken.
 */
async function findAvailableUsername(
  supabase: TypedSupabaseClient,
  baseUsername: string,
): Promise<string | null> {
  const candidates = generateUsernameCandidates(baseUsername);
  for (const candidate of candidates) {
    const { available, error } = await checkUsernameAvailability(supabase, candidate);
    if (error) {
      console.error("[ensureProfile] Username availability check failed:", error);
      continue;
    }
    if (available) return candidate;
  }
  // Fallback: append a random number to the base
  return `${baseUsername}${Math.floor(Math.random() * 99999)}`.slice(0, 20);
}
