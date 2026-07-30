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
  validateUsername,
  generateUsernameCandidates,
  displayNameFromMetadata
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
 * AUTO-POPULATION RULES (production-safe):
 *
 *   display_name is auto-populated ONLY ONCE — when:
 *   • The profile doesn't exist yet (first login)
 *   • display_name_initialized is false AND display_name matches a
 *     sentinel value ("CineLog User", "CINELOG USER", empty, null, or
 *     equals the UUID — all case-insensitive)
 *
 *   Once display_name_initialized is set to true, the display_name is
 *   NEVER overwritten again — even if the user signs in with a different
 *   provider, or the metadata changes. This protects user-edited names.
 *
 *   The display_name_initialized flag is also set to true when the user
 *   manually edits their name via the Profile page (the updateProfile
 *   function sets it).
 *
 * MIGRATION:
 *   Existing users with display_name = "CineLog User" (the trigger
 *   default) will have their name auto-populated on their next login,
 *   and display_name_initialized will be set to true. This is a one-time
 *   migration — once the flag is true, the name is never touched again.
 *
 * USERNAME GENERATION:
 *   1. Sanitize email local part → base username
 *   2. Check availability via checkUsernameAvailability
 *   3. If taken, try candidates: base24, base_24, base247, ...
 *   4. First available candidate wins
 *
 *   Username is also only auto-populated once (same sentinel check).
 *   If the user manually changes their username, it's never overwritten.
 *
 * @returns The profile row (existing or newly created).
 */
export async function ensureProfile(
  supabase: TypedSupabaseClient,
  userId: string,
  authUser: {
    email?: string | null;
    userMetadata?: Record<string, unknown> | null;
  } | null
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

    // AUTO-POPULATE DISPLAY NAME — only if NOT already initialized.
    //
    // The display_name_initialized flag is the SINGLE source of truth.
    // Once it's true, we NEVER overwrite the display_name — regardless
    // of what it contains. This protects user-edited names.
    //
    // For existing users (flag is false), we check if the current
    // display_name matches a sentinel value (case-insensitive). If it
    // does, we auto-populate from Google metadata / email and set the
    // flag to true. If it doesn't match a sentinel (user already set
    // a custom name), we just set the flag to true without changing
    // the name.
    const initialized =
      (existing as ProfileRow & { display_name_initialized?: boolean })
        .display_name_initialized ?? false;

    if (!initialized) {
      // Check if the current display_name is a sentinel value that
      // should be replaced. Case-insensitive check for "CineLog User"
      // and "CINELOG USER" (the trigger uses Title Case, but we check
      // both to be safe).
      const currentName = (existing.display_name ?? "").trim().toLowerCase();
      const isSentinel =
        !existing.display_name ||
        existing.display_name === userId ||
        currentName === "" ||
        currentName === "cinelog user" ||
        currentName === "cinephile" ||
        currentName === "new user";

      if (isSentinel) {
        // Auto-populate from Google metadata → email → fallback.
        updates.display_name = displayNameFromMetadata(metadata, email);
      }
      // Whether we changed the name or not, set the flag to true so
      // we never check again. If the user had a custom name (not a
      // sentinel), we preserve it and just mark as initialized.
      updates.display_name_initialized = true;
    }

    // AUTO-POPULATE USERNAME — only if NOT already initialized.
    // Uses the same flag logic. If the username is a sentinel
    // (empty, UUID, or "user_" prefix from the trigger), replace it.
    if (!initialized) {
      const currentUsername = (existing.username ?? "").trim();
      const isUsernameSentinel =
        !existing.username ||
        existing.username === userId ||
        currentUsername === "" ||
        currentUsername.startsWith("user_");

      if (isUsernameSentinel && email) {
        const baseUsername = sanitizeUsername(email);
        const availableUsername = await findAvailableUsername(
          supabase,
          baseUsername
        );
        if (availableUsername) {
          updates.username = availableUsername;
        }
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
  // This path runs if the Supabase trigger didn't fire (edge case).
  const email = authUser?.email ?? null;
  const metadata = authUser?.userMetadata ?? null;
  const displayName = displayNameFromMetadata(metadata, email);
  const baseUsername = email ? sanitizeUsername(email) : "cinephile";
  const username = email
    ? await findAvailableUsername(supabase, baseUsername)
    : baseUsername;

  const { data: created, error: createError } = await supabase
    .from(PROFILES_TABLE)
    .insert({
      id: userId,
      username: username ?? baseUsername,
      display_name: displayName,
      display_name_initialized: true, // Mark as initialized on creation
      country: "US" // default — user can change later
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
 *
 * This function does NOT validate the username format — it only checks
 * the database. Use validateUsername() first to check format rules,
 * then call this to check availability.
 *
 * @param supabase The Supabase client.
 * @param username The username to check (should be pre-sanitized).
 * @param excludeUserId If provided, exclude this user's current username
 *   from the check (so the user can "re-save" their own username).
 * @returns { available, error } — available is true if no other user
 *   has this username.
 */
export async function checkUsernameAvailability(
  supabase: TypedSupabaseClient,
  username: string,
  excludeUserId?: string
): Promise<{ available: boolean; error: Error | null }> {
  // Use the SECURITY DEFINER function `is_username_available` to bypass
  // RLS safely. The profiles table's RLS policy (profiles_select_own)
  // only allows SELECT where id = auth.uid(), so a direct query filtered
  // by username would return null for ANY other user's profile — making
  // taken usernames look "available" and causing constraint-violation
  // errors when the user tries to set them.
  //
  // The SECURITY DEFINER function returns only a boolean (never user
  // data), so it's safe to call from the client. If excludeUserId is
  // provided (user is checking their OWN username during profile edit),
  // the function returns true because the user already owns it.
  if (excludeUserId) {
    // User is editing their own profile — their current username is
    // "available" for them (they already have it).
    const { data: ownProfile, error: ownError } = await supabase
      .from(PROFILES_TABLE)
      .select("username")
      .eq("id", excludeUserId)
      .maybeSingle();
    if (ownError) return { available: false, error: toError(ownError) };
    if (ownProfile?.username?.toLowerCase() === username.toLowerCase()) {
      return { available: true, error: null };
    }
  }
  const { data, error } = await supabase.rpc("is_username_available", {
    p_username: username
  });
  if (error) return { available: false, error: toError(error) };
  return { available: data === true, error: null };
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
  baseUsername: string
): Promise<string | null> {
  const candidates = generateUsernameCandidates(baseUsername);
  for (const candidate of candidates) {
    // Skip candidates that fail validation (reserved, too short, etc.)
    const validation = validateUsername(candidate);
    if (!validation.valid) continue;

    const { available, error } = await checkUsernameAvailability(
      supabase,
      candidate
    );
    if (error) {
      console.error(
        "[ensureProfile] Username availability check failed:",
        error
      );
      continue;
    }
    if (available) return candidate;
  }
  // Fallback: append a random number to the base
  return `${baseUsername}${Math.floor(Math.random() * 99999)}`.slice(0, 20);
}
