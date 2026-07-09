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
