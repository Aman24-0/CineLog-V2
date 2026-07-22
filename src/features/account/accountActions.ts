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
//   • linkProvider          — link a new OAuth provider (google/apple)
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
import { setUserFromSupabaseUser } from "~/shared/hooks/useAuth";
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
 * Update the signed-in user's email address, and optionally unlink
 * OAuth providers whose email no longer matches the new address.
 *
 * When the user changes their email and has an OAuth provider (e.g. Google)
 * linked with the OLD email, that provider's login will reference the old
 * address. After the email change is confirmed, the user should reconnect
 * Google with their new Gmail address.
 *
 * This function:
 *   1. Calls Supabase updateUser({ email }) to initiate the email change
 *   2. If the user has Google linked AND email/password is also linked,
 *      auto-unlinks Google so the user can reconnect with their new Gmail
 *   3. Refreshes the local user state
 *
 * Safety: Google is ONLY unlinked if email/password is also linked, ensuring
 * the user still has a working sign-in method. If email/password is NOT linked,
 * Google is kept connected and a warning message is shown instead.
 */
export async function updateEmailAndUnlinkStaleOAuth(
  newEmail: string,
  googleIdentity?: UserIdentity | null,
): Promise<AccountActionResult> {
  const { showToast } = useToast();
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    showToast("Please enter a valid email address.", "error");
    return { success: false, error: "Invalid email" };
  }

  try {
    const supabase = getClient();

    // Step 1: Initiate the email change.
    const { data: updateData, error } = await supabase.auth.updateUser({ email: trimmed });
    if (error) throw error;

    // Immediately update the user signal from the updateUser response.
    if (updateData.user) {
      setUserFromSupabaseUser(updateData.user);
    }

    // Also refresh the stored session for future reads.
    await refreshUserFromServer();

    // Step 2: If Google is linked with the old email and email/password
    // is also linked, auto-unlink Google so the user can reconnect
    // with their new Gmail.
    if (googleIdentity) {
      // Safety check: only unlink Google if email/password is linked
      // (so the user still has a way to sign in).
      const providers = updateData.user?.app_metadata?.providers as string[] ?? [];
      const hasEmailAndPassword = providers.includes("email");
      if (hasEmailAndPassword) {
        try {
          const { error: unlinkError } = await supabase.auth.unlinkIdentity(googleIdentity);
          if (unlinkError) {
            console.warn("[accountActions] Failed to unlink Google after email change:", unlinkError);
            showToast("Email change initiated. Google couldn't be auto-disconnected — disconnect it manually from Account settings.", "success", 5000);
          } else {
            await refreshUserFromServer();
            showToast("Confirmation email sent. Google was disconnected — reconnect it with your new Gmail after confirming your email change.", "success", 5000);
          }
        } catch (unlinkErr) {
          console.warn("[accountActions] unlinkIdentity failed:", unlinkErr);
          showToast("Confirmation email sent — check your new inbox. You may need to manually disconnect Google from Account settings.", "success", 5000);
        }
      } else {
        // Email/password not linked — can't disconnect Google (user would be locked out).
        showToast("Confirmation email sent — check your new inbox. Your Google login still uses the old email. Add email+password first, then disconnect Google.", "success", 6000);
      }
    } else {
      showToast("Confirmation email sent — check your new inbox.", "success", 4000);
    }

    return { success: true };
  } catch (err) {
    const msg = friendlyError(err);
    showToast(msg, "error");
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Link Email + Password (OAuth-only users adding email/password sign-in)
// ---------------------------------------------------------------------------

/**
 * Link an email + password to the signed-in user's account.
 *
 * This is used by OAuth-only users (e.g. signed in via Google) who
 * want to ALSO be able to sign in with email + password. It calls
 * `supabase.auth.updateUser({ email, password })`:
 *
 *   • If `email` is the SAME as the user's current email (the common
 *     case — the user keeps their OAuth email), Supabase simply sets
 *     the password and adds `email` to the user's `providers` array.
 *     No confirmation email is sent.
 *
 *   • If `email` is DIFFERENT from the current email, Supabase sends
 *     a confirmation email to the NEW address AND sets the password.
 *     The email change only finalises once the user clicks the link
 *     in the confirmation email. The password is usable immediately
 *     with the OLD email until the new email is confirmed.
 *
 * After a successful call, we refresh the local user state so the
 * Account page instantly reflects the newly-linked "email" provider.
 *
 * @returns AccountActionResult with `success: true` on success, plus
 *   an `emailChangePending` flag the UI can use to show a different
 *   success message ("check your inbox") when the email was changed.
 */
export interface LinkEmailPasswordResult extends AccountActionResult {
  /** True when Supabase sent a confirmation email for a NEW address. */
  emailChangePending?: boolean;
}

export async function linkEmailPassword(
  email: string,
  newPassword: string,
): Promise<LinkEmailPasswordResult> {
  const { showToast } = useToast();

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    showToast("Please enter a valid email address.", "error");
    return { success: false, error: "Invalid email" };
  }
  if (!newPassword || newPassword.length < 8) {
    showToast("Password must be at least 8 characters.", "error");
    return { success: false, error: "Password too short" };
  }

  try {
    const supabase = getClient();

    // Read the current user's email to detect whether we're also
    // changing the email (which triggers a confirmation flow).
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      throw userErr ?? new Error("No active session");
    }
    const currentEmail = (userData.user.email ?? "").toLowerCase();
    const emailChanged = currentEmail !== trimmedEmail;

    // updateUser() returns the FRESH user object with updated
    // app_metadata.providers (including "email" if just linked).
    // We use this immediately to update the UI signal, bypassing
    // the stale-session issue where getSession()/getUser() reads
    // from the old JWT claims.
    const { data: updateData, error } = await supabase.auth.updateUser({
      email: trimmedEmail,
      password: newPassword,
    });
    if (error) throw error;

    // Immediately update the user signal from the updateUser response
    // — this is the FRESH data directly from Supabase's Auth server,
    // including the updated app_metadata.providers with "email" added.
    // This avoids the race condition where getUser() would still read
    // from the old JWT access token.
    if (updateData.user) {
      setUserFromSupabaseUser(updateData.user);
    }

    // Also refresh the stored session so future getSession() calls
    // return updated data. This runs in parallel — the UI already
    // reflects the fresh state from setUserFromSupabaseUser above.
    await refreshUserFromServer();

    if (emailChanged) {
      showToast(
        "Password set. We also sent a confirmation link to your new email — click it to finish switching.",
        "success",
        6000,
      );
    } else {
      showToast("Email + password linked. You can now sign in with either method.", "success", 4000);
    }

    return { success: true, emailChangePending: emailChanged };
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
  provider: "google" | "apple",
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
