// src/shared/hooks/useAuth.ts
//
// CineLog V2 — Authentication Provider
// ---------------------------------------
// This hook is the application's authentication provider. It is backed
// by the Supabase Auth via `src/lib/supabase/session.ts`.
//
// The PUBLIC API:
//   { user, authReady, isSignedIn }
//
// `user` has the shape:
//   { uid, displayName, email, photoURL }
//
// Architecture:
//   Application → useAuth (this file) → onSessionChange → Supabase Auth
//                                  → getSession() (explicit initial check)
//
// SSR safety
// ----------
// The `onSessionChange` subscription is registered inside `onMount`
// (client-only) and cleaned up in `onCleanup`. The module-level signals
// stay null/false during SSR and resolve after hydration, avoiding
// hydration mismatches.
//
// CRITICAL: OAuth redirect handling
// ---------------------------------
// When the browser returns from Google OAuth, the Supabase client's
// `detectSessionInUrl: true` parses the PKCE code from the URL and
// exchanges it for a session. This triggers an `onAuthStateChange`
// event. BUT there is a race condition: if the `onAuthStateChange`
// listener is registered AFTER the URL has already been parsed, the
// initial event is missed and the app stays in the signed-out state.
//
// To fix this, we explicitly call `supabase.auth.getSession()` on
// mount. This returns the current session (if any) regardless of
// whether the listener caught the event. We set `authReady(true)` and
// `user(...)` from this explicit check, then the listener handles all
// subsequent changes.

import { createSignal, onMount, onCleanup } from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import type { User } from "~/shared/types";

// ---------------------------------------------------------------------------
// Module-level signals — shared across ALL components. Every component that
// calls `useAuth()` reads from the same `user` / `authReady` signals, so
// auth state is consistent across the app.
// ---------------------------------------------------------------------------
const [user, setUser] = createSignal<User | null>(null);
const [authReady, setAuthReady] = createSignal(false);

// Ref-counted subscription: only one `onSessionChange` listener is ever
// active, regardless of how many components call `useAuth()`. The listener
// is cleaned up when the last consumer unmounts.
let unsub: (() => void) | null = null;
let listenerCount = 0;

// Guard to ensure the explicit getSession() check only runs once per
// browser session (not once per component mount).
// NOTE: This is intentionally module-level and is NOT reset on HMR
// to avoid re-running the session check on every hot reload.
// For test isolation, call resetAuthState() in test setup/teardown.
let initialSessionChecked = false;

/**
 * Reset module-level auth state. Used in tests to ensure isolation
 * between test runs. NOT for production use.
 * @internal
 */
export function _resetAuthStateForTesting(): void {
  initialSessionChecked = false;
  listenerCount = 0;
  if (unsub) { unsub(); unsub = null; }
}

/**
 * Map a Supabase `Session.user` to the application's `User` shape.
 *
 * The app's `User` type has `{ uid, displayName, email, photoURL }` —
 * a subset of the Supabase user fields. `uid` maps from Supabase's
 * `user.id`; the others map from `user_metadata` / `user.email` /
 * `user.user_metadata.avatar_url`.
 */
function mapSupabaseUser(session: Session | null): User | null {
  if (!session?.user) return null;
  const supabaseUser = session.user;
  return mapRawSupabaseUser(supabaseUser);
}

/**
 * Map a raw Supabase User object (not wrapped in a Session) to the
 * application's `User` shape. Used by `setUserFromSupabaseUser()` when
 * we have the user from `updateUser()` or `getUser()` responses but
 * not a full Session.
 */
function mapRawSupabaseUser(supabaseUser: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  created_at?: string;
}): User {
  return {
    uid: supabaseUser.id,
    displayName: (supabaseUser.user_metadata?.full_name as string)
      ?? (supabaseUser.user_metadata?.name as string)
      ?? (supabaseUser.user_metadata?.display_name as string)
      ?? null,
    email: supabaseUser.email ?? null,
    photoURL: (supabaseUser.user_metadata?.avatar_url as string)
      ?? (supabaseUser.user_metadata?.picture as string)
      ?? null,
    // Extract linked auth providers from Supabase app_metadata.
    // This is the SINGLE source of truth for which providers are connected
    // (google, email, github, apple, etc.). The Account page reads this
    // array to show "Connected" vs "Available" — NOT hardcoded values.
    // NOTE: Some Supabase versions/configurations may not include "email"
    // in app_metadata.providers even after updateUser({password}) adds a
    // password. We handle this in the Account page by ALSO checking
    // getUserIdentities() for an "email" identity as a fallback.
    providers: (supabaseUser.app_metadata?.providers as string[]) ?? [],
    createdAt: supabaseUser.created_at ?? "",
  };
}

/**
 * setUserFromSupabaseUser — directly update the user signal from a raw
 * Supabase User object (e.g., the user returned by updateUser() or
 * getUser() responses).
 *
 * This is the IMMEDIATE update path — it doesn't wait for a full
 * session refresh. Used by accountActions after mutations like
 * updateUser({ email, password }) that return a fresh user object
 * with updated app_metadata.providers.
 *
 * Safe to call outside a Solid component (the signal is module-level).
 */
export function setUserFromSupabaseUser(supabaseUser: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  created_at?: string;
}): void {
  setUser(mapRawSupabaseUser(supabaseUser));
}

/**
 * useAuth — the application's authentication provider hook.
 *
 * Returns:
 *   • user()        — the current user `{ uid, displayName, email, photoURL }` or null
 *   • authReady()   — true once the initial session check has completed
 *   • isSignedIn()  — convenience: true when user() is non-null
 *
 * Call inside a Solid component. The hook registers an auth-state
 * listener on mount and cleans it up on unmount.
 *
 * On the first mount in a browser session, it also explicitly calls
 * `getSession()` to ensure the session is detected even if the
 * `onAuthStateChange` listener missed the initial event (which
 * happens after OAuth redirects).
 */
export function useAuth() {
  onMount(() => {
    listenerCount++;

    // Register the onAuthStateChange listener (handles all future
    // sign-in / sign-out events).
    if (!unsub) {
      try {
        const subscription = onSessionChange((_event, session) => {
          setUser(mapSupabaseUser(session));
          setAuthReady(true);
          // Auto-populate display_name + username on sign-in.
          // This runs in the background — the UI doesn't wait for it.
          if (session?.user) {
            void ensureProfileForUser(session.user);
          }
        });
        unsub = () => subscription.unsubscribe();
      } catch (err) {
        console.error("[useAuth] Auth subscription failed:", err);
        setAuthReady(true); // Mark as ready so UI doesn't hang
      }
    }

    // Explicit initial session check — runs ONCE per browser session.
    // This catches the case where the page loaded with an existing
    // session (e.g., after OAuth redirect, or on refresh) but the
    // onAuthStateChange listener hasn't fired yet.
    if (!initialSessionChecked) {
      initialSessionChecked = true;
      checkInitialSession();
    }
  });

  onCleanup(() => {
    listenerCount--;
    if (listenerCount <= 0 && unsub) {
      unsub();
      unsub = null;
      listenerCount = 0;
    }
  });

  return {
    user,
    authReady,
    isSignedIn: () => user() !== null
  };
}

/**
 * Explicitly check the current session via getSession().
 *
 * This is the safety net for OAuth redirects and page refreshes. The
 * Supabase client with `detectSessionInUrl: true` parses the PKCE
 * code from the URL and stores the session in localStorage. But the
 * `onAuthStateChange` event might fire before our listener is
 * registered. By calling `getSession()` explicitly, we read the
 * current session state directly and update the signals.
 *
 * This function is async but we don't await it — it updates the
 * module-level signals when it resolves, and the reactive system
 * picks up the change.
 */
async function checkInitialSession() {
  try {
    const { getBrowserSession } = await import("~/lib/supabase/session");
    const session = await getBrowserSession();
    setUser(mapSupabaseUser(session));
    setAuthReady(true);
    // Auto-populate display_name + username on initial session detection.
    if (session?.user) {
      void ensureProfileForUser(session.user);
    }
  } catch (err) {
    console.error("[useAuth] Initial session check failed:", err);
    setAuthReady(true); // Mark as ready so UI doesn't hang
  }
}

/**
 * Ensure the user's profile exists and has a display_name + username.
 *
 * Called when a session is detected (both from onSessionChange and
 * checkInitialSession). Runs in the background — the UI doesn't wait
 * for it. Uses dynamic import to avoid circular dependencies and keep
 * the auth hook lightweight.
 *
 * If the profile already has a display_name and username (i.e., the
 * user has set them or they were auto-populated on a previous login),
 * this is a no-op. The ensureProfile function only auto-populates
 * fields that are empty or still set to the UUID default.
 */
async function ensureProfileForUser(supabaseUser: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  try {
    const { getBrowserClient } = await import("~/lib/supabase/browser");
    const { ensureProfile } = await import("~/lib/supabase/repositories");
    const client = getBrowserClient();
    await ensureProfile(client, supabaseUser.id, {
      email: supabaseUser.email ?? null,
      userMetadata: supabaseUser.user_metadata ?? null,
    });
  } catch (err) {
    // Non-fatal — the profile might already exist from the Supabase trigger.
    // Log but don't crash the auth flow.
    console.error("[useAuth] ensureProfile failed:", err);
  }
}

/**
 * getCurrentUid — synchronous accessor for the current user's uid.
 *
 * Reads from the same module-level `user` signal that `useAuth()`
 * exposes, so it is always consistent with the reactive auth state.
 * Returns `null` when no user is signed in (or before the first
 * auth-state event fires).
 *
 * This is the SINGLE source of truth for the current user's identity
 * outside of Solid components — service functions, event handlers,
 * and non-reactive code should call this instead of reading
 * `auth.currentUser?.uid` (which was the old Firebase path).
 *
 * The signal is module-level, so this function works WITHOUT a
 * reactive context (it does not need `createRoot` or a component).
 */
export function getCurrentUid(): string | null {
  return user()?.uid ?? null;
}

/**
 * getCurrentUser — synchronous accessor for the full current user
 * object. Same source as {@link getCurrentUid} but returns the
 * complete `{ uid, displayName, email, photoURL }` shape.
 *
 * Returns `null` when no user is signed in.
 */
export function getCurrentUser(): User | null {
  return user();
}

/**
 * refreshUserFromServer — force a re-fetch of the user from the
 * Supabase Auth server and update the local signal.
 *
 * Used after operations that mutate the user object OUTSIDE of the
 * normal session-change event flow — for example, after linking
 * email/password (`supabase.auth.updateUser` updates `app_metadata.providers`
 * on the server but doesn't always fire an `onAuthStateChange` event)
 * or after unlinking an OAuth identity (`supabase.auth.unlinkIdentity`
 * doesn't fire an `onAuthStateChange` event either).
 *
 * IMPORTANT: uses `supabase.auth.getUser()` (which makes a fresh network
 * call to the Auth server) instead of `getSession()` (which reads from the
 * local cache and may not reflect server-side `app_metadata` changes yet).
 * This ensures `providers`, `email`, and other server-side fields are
 * always up-to-date after mutations.
 *
 * Safe to call outside a Solid component (the signal is module-level).
 */
export async function refreshUserFromServer(): Promise<void> {
  try {
    // Use getUser() (network call) instead of getSession() (local cache)
    // so that app_metadata.providers reflects server-side changes like
    // newly-linked email/password or unlinked OAuth identities.
    const { getBrowserClient } = await import("~/lib/supabase/browser");
    const supabase = getBrowserClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      // Fallback: if getUser() fails (e.g. network error), try getSession()
      // so we at least have the cached session rather than nothing.
      console.warn("[useAuth] getUser() failed, falling back to getSession():", userError);
      const { getBrowserSession } = await import("~/lib/supabase/session");
      const session = await getBrowserSession();
      setUser(mapSupabaseUser(session));
      return;
    }
    // We have the fresh user from the server, but getUser() doesn't return
    // a full Session object. We still need the session for the access token,
    // so we merge: fresh user data + existing session for continuity.
    // mapSupabaseUser expects a Session (or null), so we construct one.
    const { getBrowserSession } = await import("~/lib/supabase/session");
    const session = await getBrowserSession();
    if (!session) {
      // No session at all — user is effectively signed out.
      setUser(null);
      return;
    }
    // Replace the session's user with the fresh server-side user,
    // keeping the rest of the session (access_token, refresh_token, etc.)
    // intact so downstream code that reads the session still works.
    const freshSession = { ...session, user: userData.user };
    setUser(mapSupabaseUser(freshSession));
  } catch (err) {
    console.error("[useAuth] refreshUserFromServer failed:", err);
  }
}
