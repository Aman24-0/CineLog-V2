// src/core/firebase/auth.ts
//
// Phase 6.1 — Auth Provider Integration
// ---------------------------------------
// This file previously exported `login` (Firebase Google popup) and
// `logout` (Firebase signOut). It now routes both through the Supabase
// Authentication Foundation so the application's auth provider uses
// Supabase instead of Firebase.
//
// The PUBLIC API is IDENTICAL:
//   • login()  — initiates Google sign-in (now via Supabase OAuth)
//   • logout() — signs the user out (now via Supabase signOut)
//   • onAuthStateChanged — re-exported from firebase/auth for backward
//     compatibility (still importable by existing code; Firebase auth
//     is initialised but no user signs in through it anymore)
//
// Existing consumers (DashboardPage, WatchlistView, SearchPage,
// DiscoverPage, AppHeader) call `await login()` / `await logout()`
// inside try/catch blocks without capturing the return value, so the
// return type change (from Firebase UserCredential to Supabase OAuth
// response) is transparent to them.
//
// Architecture:
//   Application → login()/logout() (this file) → Supabase Auth
//
// Firebase code note
// ------------------
// Firebase Auth is still initialised in `./config.ts` (for Firestore),
// but `login()` no longer calls `signInWithPopup`. The `onAuthStateChanged`
// re-export remains so existing imports don't break, though it will
// only ever emit `null` since no Firebase user signs in.

import { onAuthStateChanged } from "firebase/auth";
import { getClient } from "~/lib/supabase/client";

/**
 * Sign in with Google via Supabase OAuth.
 *
 * Replaces the previous Firebase `signInWithPopup(auth, googleProvider)`.
 * Uses Supabase's `signInWithOAuth` with the `google` provider and
 * PKCE flow (matching the browser client's `flowType: "pkce"` config).
 *
 * The redirect URL defaults to the current origin so the user returns
 * to the same page after the OAuth flow.
 *
 * @throws Error if the Supabase client cannot be initialised or the
 *         OAuth redirect fails to start.
 */
export const login = async (): Promise<void> => {
  const supabase = getClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined
    }
  });
  if (error) {
    throw error;
  }
  // signInWithOAuth redirects the browser to Google's consent screen.
  // The Promise resolves before the redirect happens, so callers' toast
  // messages ("Signed in successfully!") may fire prematurely — but the
  // existing UI pattern (await login() → toast) is preserved as-is.
  // The actual session is established when the browser returns from
  // Google and onSessionChange fires.
};

/**
 * Sign out the current user via Supabase.
 *
 * Replaces the previous Firebase `signOut(auth)`. Uses Supabase's
 * `signOut` with the default `"local"` scope (revokes only the current
 * session).
 *
 * @throws Error if the Supabase client cannot be initialised or the
 *         sign-out fails.
 */
export const logout = async (): Promise<void> => {
  const supabase = getClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
};

// Re-exported for backward compatibility. Existing code that imports
// `onAuthStateChanged` from this module (e.g. useVault.tsx,
// useCollections.tsx) will continue to compile. Firebase auth is still
// initialised in config.ts, so the function is callable — it will
// simply emit `null` since no Firebase user signs in anymore.
export { onAuthStateChanged };
