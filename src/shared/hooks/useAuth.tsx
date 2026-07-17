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
// Auth state is managed via a Solid context provider (`AuthProvider`).
// On the server, each SSR request gets a fresh provider instance with
// its own signals and listener state — no mutable state leaks between
// requests. On the browser, the provider is mounted once and all
// components share the same auth signals via the context.
//
// Non-reactive accessors (getCurrentUid, getCurrentUser, etc.) read
// from module-level signals that are synced by the AuthProvider. These
// work outside component trees (event handlers, services) and are
// safe because they're only called on the browser.
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

import {
  createContext,
  createEffect,
  createSignal,
  on,
  onMount,
  onCleanup,
  useContext,
  type ParentComponent,
} from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import type { User } from "~/shared/types";

// ---------------------------------------------------------------------------
// Auth context — request-scoped on the server, singleton on the browser.
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: () => User | null;
  authReady: () => boolean;
  isSignedIn: () => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: () => null,
  authReady: () => false,
  isSignedIn: () => false,
});

// ---------------------------------------------------------------------------
// Module-level signals for non-reactive accessors.
//
// These are synced by the AuthProvider via createEffect. They allow
// getCurrentUid(), getCurrentUser(), and refreshUserFromServer() to
// work outside of component trees (event handlers, services, etc.).
//
// On the server, these stay at their default values (null/false),
// which is correct — the server has no persisted session.
// ---------------------------------------------------------------------------

const [moduleUser, setModuleUser] = createSignal<User | null>(null);
const [moduleAuthReady, setModuleAuthReady] = createSignal(false);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `Session.user` to the application's `User` shape.
 */
function mapSupabaseUser(session: Session | null): User | null {
  if (!session?.user) return null;
  const supabaseUser = session.user;
  return {
    uid: supabaseUser.id,
    displayName: supabaseUser.user_metadata?.full_name
      ?? supabaseUser.user_metadata?.name
      ?? supabaseUser.user_metadata?.display_name
      ?? null,
    email: supabaseUser.email ?? null,
    photoURL: supabaseUser.user_metadata?.avatar_url
      ?? supabaseUser.user_metadata?.picture
      ?? null,
    providers: supabaseUser.app_metadata?.providers ?? [],
    createdAt: supabaseUser.created_at,
  };
}

/**
 * Ensure the user's profile exists and has a display_name + username.
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
    console.error("[useAuth] ensureProfile failed:", err);
  }
}

// ---------------------------------------------------------------------------
// AuthProvider — wraps the app root and manages auth lifecycle.
// ---------------------------------------------------------------------------

/**
 * AuthProvider — manages authentication state for the entire app.
 *
 * All mutable auth state (listener, session check flag) lives inside
 * this component — never at module scope. On the server, each SSR
 * request creates a fresh provider instance. On the browser, the
 * provider is mounted once and persists for the session.
 *
 * The provider syncs its signals to module-level signals so that
 * non-reactive accessors (getCurrentUid, etc.) work outside components.
 */
export const AuthProvider: ParentComponent = (props) => {
  const [user, setUser] = createSignal<User | null>(null);
  const [authReady, setAuthReady] = createSignal(false);

  // Per-provider mutable state — scoped to this component instance.
  // On the server, each SSR request gets a fresh instance.
  let unsub: (() => void) | null = null;
  let initialSessionChecked = false;

  // Sync provider signals → module-level signals for non-reactive access.
  createEffect(on(user, (u) => setModuleUser(u)));
  createEffect(on(authReady, (r) => setModuleAuthReady(r)));

  onMount(() => {
    // Register the onAuthStateChange listener (handles all future
    // sign-in / sign-out events).
    try {
      const subscription = onSessionChange((_event, session) => {
        setUser(mapSupabaseUser(session));
        setAuthReady(true);
        if (session?.user) {
          void ensureProfileForUser(session.user);
        }
      });
      unsub = () => subscription.unsubscribe();
    } catch (err) {
      console.error("[useAuth] Failed to register session listener:", err);
    }

    // Explicit initial session check — catches OAuth redirects and
    // page refreshes where the onAuthStateChange listener missed
    // the initial event.
    if (!initialSessionChecked) {
      initialSessionChecked = true;
      checkInitialSession(setUser, setAuthReady);
    }
  });

  onCleanup(() => {
    if (unsub) {
      unsub();
      unsub = null;
    }
  });

  const value: AuthContextValue = {
    user,
    authReady,
    isSignedIn: () => user() !== null,
  };

  return (
    <AuthContext.Provider value={value}>
      {props.children}
    </AuthContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Session check
// ---------------------------------------------------------------------------

async function checkInitialSession(
  setUser: (u: User | null) => void,
  setAuthReady: (r: boolean) => void,
) {
  try {
    const { getBrowserSession } = await import("~/lib/supabase/session");
    const session = await getBrowserSession();
    setUser(mapSupabaseUser(session));
    setAuthReady(true);
    if (session?.user) {
      void ensureProfileForUser(session.user);
    }
  } catch (err) {
    console.error("[useAuth] Initial session check failed:", err);
    setAuthReady(true); // Mark as ready so UI doesn't hang
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * useAuth — the application's authentication provider hook.
 *
 * Returns:
 *   • user()        — the current user or null
 *   • authReady()   — true once the initial session check has completed
 *   • isSignedIn()  — convenience: true when user() is non-null
 *
 * Must be called inside a component wrapped by `AuthProvider`.
 */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/**
 * getCurrentUid — synchronous accessor for the current user's uid.
 *
 * Reads from module-level signals that are synced by the AuthProvider.
 * Returns `null` when no user is signed in (or before the first
 * auth-state event fires).
 *
 * Safe to call outside a Solid component.
 */
export function getCurrentUid(): string | null {
  return moduleUser()?.uid ?? null;
}

/**
 * getCurrentUser — synchronous accessor for the full current user
 * object. Same source as getCurrentUid but returns the complete
 * `{ uid, displayName, email, photoURL }` shape.
 */
export function getCurrentUser(): User | null {
  return moduleUser();
}

/**
 * refreshUserFromServer — force a re-fetch of the user from the
 * Supabase Auth server and update the local signal.
 */
export async function refreshUserFromServer(): Promise<void> {
  try {
    const { getBrowserSession } = await import("~/lib/supabase/session");
    const session = await getBrowserSession();
    setModuleUser(mapSupabaseUser(session));
  } catch (err) {
    console.error("[useAuth] refreshUserFromServer failed:", err);
  }
}
