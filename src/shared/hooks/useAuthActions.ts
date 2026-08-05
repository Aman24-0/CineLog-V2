// src/shared/hooks/useAuthActions.ts
//
// Centralized auth actions — replaces the 6 scattered signInWithOAuth
// calls with a single email/password-based flow.
//
// The app previously used Google OAuth exclusively, but the Supabase
// project only has Email auth enabled. This module provides:
//   - signInWithEmail: email + password login
//   - signUpWithEmail: email + password registration
//   - signOut: clear the session
//
// All components that previously called signInWithOAuth now use these
// helpers, keeping the auth flow consistent across the app.

import { getClient } from "~/lib/supabase/client";
import { useToast } from "~/shared/hooks/useToast";

export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Sign in with email + password.
 * Shows a toast on success/failure.
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (error) throw error;
    showToast("Signed in! 🎬", "success");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sign in failed.";
    showToast(msg, "error");
    return { success: false, error: msg };
  }
}

/**
 * Sign up with email + password.
 * If email confirmation is enabled, the user gets a confirmation email.
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password
    });
    if (error) throw error;
    if (data.session) {
      // Email confirmation is OFF — user is signed in immediately
      showToast("Account created! 🎬", "success");
    } else {
      // Email confirmation is ON — user needs to check email
      showToast("Check your email to confirm your account.", "success", 4000);
    }
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sign up failed.";
    showToast(msg, "error");
    return { success: false, error: msg };
  }
}

/**
 * Sign out the current user.
 *
 * Uses `scope: "local"` so only the CURRENT device's session is
 * revoked. The previous default (`global`) signed the user out of
 * ALL devices, which surprised users who clicked "Sign out" on one
 * device and lost their session on every other device too. The
 * explicit "Sign out everywhere" intent lives in `signOutGlobal()`
 * in `features/account/accountActions.ts`, which still uses
 * `scope: "global"`.
 */
export async function signOut(): Promise<AuthResult> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    showToast("Signed out", "info");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sign out failed.";
    showToast(msg, "error");
    return { success: false, error: msg };
  }
}

/**
 * Sign in with Google OAuth.
 *
 * Redirects the browser to Google's consent screen. After the user
 * authenticates, Google redirects back to Supabase's callback URL,
 * which then redirects to the app.
 *
 * The `redirectTo` URL must be in the Supabase project's allowed
 * Redirect URLs list. We use the current origin so it works in dev
 * (localhost:3000) and production (cinelogv2.vercel.app).
 *
 * After the redirect, the Supabase client's `detectSessionInUrl: true`
 * parses the PKCE code from the URL, exchanges it for a session
 * (reading the verifier from `localStorage` — see
 * `src/lib/supabase/browser.ts`), and fires `onAuthStateChange`.
 * The `/auth/callback` route component listens for `SIGNED_IN` and
 * navigates to `/discover`.
 *
 * If the user already has an email/password account with the same
 * verified email, Supabase automatically links the Google identity
 * to the existing account (same user ID, same vault).
 *
 * `returnPath` is accepted for backward compatibility with callers
 * (e.g. `admin/login.tsx`) but is NOT used — the callback always
 * navigates to `/discover`. See `src/routes/auth/callback.tsx` for
 * the rationale on dropping the `?next=` query param.
 */
export async function signInWithGoogle(_returnPath?: string): Promise<void> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    // CRITICAL — strict origin for `redirectTo`:
    //   The `redirectTo` URL MUST be exactly
    //   `${window.location.origin}/auth/callback` — no query string,
    //   no relative path. We NEVER pass `/auth/callback` (relative)
    //   because:
    //
    //     1. Supabase's redirect URL allowlist matches against FULL
    //        URLs — relative paths may be rejected, causing the OAuth
    //        flow to fail before it even starts.
    //     2. The PKCE verifier is now stored in `localStorage` (NOT
    //        a cookie — see `src/lib/supabase/browser.ts` Phase 7
    //        Task 15). `localStorage` is scoped to the EXACT origin
    //        that wrote it. If the user starts the OAuth flow on
    //        origin A but `redirectTo` resolves to origin B, the
    //        verifier in localStorage on origin A is unreachable from
    //        origin B → "PKCE code verifier not found".
    //
    //   Using `window.location.origin` guarantees the user returns to
    //   the EXACT origin they started on, where the verifier in
    //   localStorage is reachable.
    //
    //   We NO LONGER append `?next=<returnPath>` — the dumb callback
    //   component always navigates to `/discover` regardless. See
    //   `src/routes/auth/callback.tsx` header comment for rationale.
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo
      }
    });
    if (error) throw error;
    // The browser will redirect — no toast needed, the page will reload
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Google sign in failed.";
    showToast(msg, "error");
  }
}
