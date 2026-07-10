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
  password: string,
): Promise<AuthResult> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
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
  password: string,
): Promise<AuthResult> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
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
 */
export async function signOut(): Promise<AuthResult> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const { error } = await supabase.auth.signOut();
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
 * which then redirects to the app's origin.
 *
 * If the user already has an email/password account with the same
 * verified email, Supabase automatically links the Google identity
 * to the existing account (same user ID, same vault).
 */
export async function signInWithGoogle(): Promise<void> {
  const { showToast } = useToast();
  try {
    const supabase = getClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    if (error) throw error;
    // The browser will redirect — no toast needed, the page will reload
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Google sign in failed.";
    showToast(msg, "error");
  }
}
