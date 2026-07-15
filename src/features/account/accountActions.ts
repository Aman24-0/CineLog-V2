// src/features/account/accountActions.ts
//
// Extended auth/account actions — built on top of the foundation in
// `~/lib/supabase/auth.ts` and `~/shared/hooks/useAuthActions.ts`.
//
// This module wraps the lower-level Supabase Auth calls that the
// upgraded Account page needs:
//
//   • updateEmail           — change the user's email (sends confirmation)
//   • changePassword        — change the user's password (optional reauth)
//   • getUserIdentities     — list all linked OAuth identities
//   • linkProvider          — link a new OAuth provider (google/apple/github)
//   • unlinkProvider        — unlink an OAuth identity by its id
//   • sendPasswordResetEmail — forgot-password flow
//   • signOutGlobal         — revoke every session for this user
//
// All actions show a toast on success/failure and return an AuthResult
// so the caller can branch on success without re-parsing.
//
// SECURITY NOTES
// --------------
//   • Email changes: Supabase sends a confirmation email to the NEW
//     address when `double_confirm_changes = true`. The user's email
//     only changes after they click that link. The current session
//     keeps using the old email until the link is confirmed.
//   • Password changes: `secure_password_change = false` in this
//     project's config — so `current_password` is NOT required. We
//     still accept it and pass it through (Supabase ignores it if the
//     project setting is off).
//   • Linking: `enable_manual_linking = false` — but `linkIdentity`
//     still works because it's an explicit user-initiated action.
//   • Unlinking: Supabase refuses to unlink the LAST identity on an
//     account (you'd be locked out). We surface that error to the user.

import { getClient } from "~/lib/supabase/client";
import { useToast } from "~/shared/hooks/useToast";
import { refreshUserFromServer } from "~/shared/hooks/useAuth";
import type { UserIdentity } from "@supabase/supabase-js";

export interface AccountActionResult {
  success: boolean;
  error?: string;
}

/**
 * Build a friendly error message from a Supabase AuthError or unknown error.
 * Falls back to the error's `.message` if no friendly mapping exists.
 */
function friendlyError(err: unknown): string {
  if (!err) return "Unknown error.";
  const msg = err instanceof Error ? err.message : String(err);
  // Map common Supabase auth error messages to user-facing copy.
  if (/same email/i.test(msg) || /email already in use/i.test(msg)) {
    return "That email is already in use.";
  }
  if (/password should be at least/i.test(msg)) {
    return "Password must be at least 8 characters.";
  }
  if (/invalid credentials/i.test(msg)) {
    return "Incorrect current password.";
  }
  if (/user already registered/i.test(msg)) {
    return "An account with that email already exists.";
  }
  if (/identity already exists/i.test(msg)) {
    return "That provider is already linked to your account.";
  }
  if (/cannot unlink the last identity/i.test(msg) || /last identity/i.test(msg)) {
    return "You can't unlink your last sign-in method. Add another method first.";
  }
  if (/email not confirmed/i.test(msg)) {
    return "Please confirm your email first — check your inbox.";
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Update the signed-in user's email address.
 *
 * Supabase sends a confirmation email to the NEW address when
 * `double_confirm_changes = true` (currently enabled). The user must
 * click the link in that email for the change to take effect.
 *
 * Until the link is clicked, the user's `email` field still shows
 * the OLD address — that's expected Supabase behavior, not a bug.
 */
export async function updateEmail(newEmail: string): Promise<AccountActionResult> {
  const { showToast } = useToast();
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    showToast("Please enter a valid email address.", "error");
    return { success: false, error: "Invalid email" };
  }
  try {
    const supabase = getClient();
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    if (error) throw error;
    showToast("Confirmation email sent — check your new inbox.", "success", 4000);
    return { success: true };
  } catch (err) {
    const msg = friendlyError(err);
    showToast(msg, "error");
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

/**
 * Change the signed-in user's password.
 *
 * `currentPassword` is optional — pass it when the Supabase project
 * has `secure_password_change = true` (currently OFF, so it's ignored).
 *
 * After a successful change, the user's other sessions are NOT
 * automatically revoked — call `signOutGlobal` from the UI if you
 * want that behaviour.
 */
export async function changePassword(
  newPassword: string,
  currentPassword?: string,
): Promise<AccountActionResult> {
  const { showToast } = useToast();
  if (!newPassword || newPassword.length < 8) {
    showToast("Password must be at least 8 characters.", "error");
    return { success: false, error: "Password too short" };
  }
  try {
    const supabase = getClient();
    const attrs: { password: string; current_password?: string } = { password: newPassword };
    if (currentPassword) attrs.current_password = currentPassword;
    const { error } = await supabase.auth.updateUser(attrs);
    if (error) throw error;
    showToast("Password updated.", "success");
    return { success: true };
  } catch (err) {
    const msg = friendlyError(err);
    showToast(msg, "error");
    return { success: false, error: msg };
  }
}

/**
 * Send a password-reset email to the given address.
 * Used by the "Forgot password?" link on the change-password sheet.
 */
export async function sendPasswordResetEmail(email: string): Promise<AccountActionResult> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/settings/account`
        : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    if (error) throw error;
    showToast("Reset link sent — check your inbox.", "success", 4000);
    return { success: true };
  } catch (err) {
    const msg = friendlyError(err);
    showToast(msg, "error");
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// OAuth identities
// ---------------------------------------------------------------------------

/**
 * Fetch every OAuth identity linked to the current user.
 *
 * Returns `UserIdentity[]` — each entry has `identity_id`, `provider`,
 * `identity_data` (email, name, avatar). The `providers` field on
 * the app's `User` type is derived from this list, but here we need
 * the full identities for the unlink call (which takes identity_id,
 * NOT provider name).
 */
export async function getUserIdentities(): Promise<UserIdentity[] | null> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) throw error;
    return data?.identities ?? [];
  } catch (err) {
    console.error("[accountActions] getUserIdentities failed:", err);
    return null;
  }
}

/**
 * Link a new OAuth provider to the signed-in user's account.
 *
 * This redirects the browser to the provider's consent screen —
 * the page will reload on return, so no toast is shown on success
 * (the redirect itself is the success indicator).
 *
 * The redirect target should be a page the user can land on after
 * the OAuth dance finishes. We default to the Account page so they
 * land back here and see the newly-linked provider.
 */
export async function linkProvider(
  provider: "google" | "apple" | "github",
): Promise<AccountActionResult> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/settings/account`
        : undefined;
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo },
    });
    if (error) throw error;
    // The browser will redirect — no toast, the page will reload.
    return { success: true };
  } catch (err) {
    const msg = friendlyError(err);
    showToast(msg, "error");
    return { success: false, error: msg };
  }
}

/**
 * Unlink an OAuth identity from the signed-in user's account.
 *
 * `identity` is the full `UserIdentity` object (as returned by
 * `getUserIdentities`). Supabase's `unlinkIdentity` requires the
 * whole object — passing just the `identity_id` string is a type
 * error.
 *
 * Supabase refuses to unlink the LAST identity (you'd be locked out).
 * We surface that error as a friendly toast.
 *
 * After a successful unlink, we refresh the local user state so the
 * Account page instantly reflects the change.
 */
export async function unlinkProvider(identity: UserIdentity): Promise<AccountActionResult> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (error) throw error;
    // Refresh the local user object so the providers list updates.
    await refreshUserFromServer();
    showToast("Provider unlinked.", "success");
    return { success: true };
  } catch (err) {
    const msg = friendlyError(err);
    showToast(msg, "error");
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Sign out EVERYWHERE — revokes all sessions for this user across
 * every device. The current session is also revoked, so the user is
 * returned to the signed-out state.
 *
 * Used by "Sign out everywhere" in the session-management section.
 */
export async function signOutGlobal(): Promise<AccountActionResult> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) throw error;
    showToast("Signed out everywhere.", "success");
    return { success: true };
  } catch (err) {
    const msg = friendlyError(err);
    showToast(msg, "error");
    return { success: false, error: msg };
  }
}
