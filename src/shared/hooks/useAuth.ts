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
  return {
    uid: supabaseUser.id,
    displayName:
      supabaseUser.user_metadata?.full_name ??
      supabaseUser.user_metadata?.name ??
      supabaseUser.user_metadata?.display_name ??
      null,
    email: supabaseUser.email ?? null,
    photoURL:
      supabaseUser.user_metadata?.avatar_url ??
      supabaseUser.user_metadata?.picture ??
      null,
    // Extract linked auth providers from Supabase app_metadata.
    // This is the SINGLE source of truth for which providers are connected
    // (google, email, github, apple, etc.). The Account page reads this
    // array to show "Connected" vs "Available" — NOT hardcoded values.
    providers: supabaseUser.app_metadata?.providers ?? [],
    createdAt: supabaseUser.created_at
  };
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
        const subscription = onSessionChange((event, session) => {
          setUser(mapSupabaseUser(session));
          setAuthReady(true);
          // Auto-populate display_name + username on sign-in.
          // This runs in the background — the UI doesn't wait for it.
          if (session?.user) {
            void ensureProfileForUser(session.user);
            // Sync preferences (theme, density, notifications, etc.)
            // between localStorage and the user_preferences table on
            // the server. Also starts the debounced auto-pusher so
            // subsequent pref changes propagate automatically.
            // Phase 1 audit fix — prefs were previously localStorage-only.
            void syncPrefsForUser(session.user.id);
            // Log the sign-in to login_history for the audit trail
            // shown in Settings → Account → Login History.
            //
            // Dedup strategy (fixes the "login history duplicates on
            // every refresh" bug):
            //   - SIGNED_IN: only log if this is a fresh sign-in. We
            //     detect "fresh" by checking the session's created_at —
            //     if it was created within the last 60 seconds, this is
            //     a real sign-in (not a page reload that re-fires
            //     SIGNED_IN from the Supabase client detecting a stored
            //     session). Otherwise skip.
            //   - TOKEN_REFRESHED: rate-limited via shouldLogRefresh()
            //     (6-hour window) so we don't log every hourly refresh.
            //   - INITIAL_SESSION: handled by checkInitialSession() with
            //     its own rate-limit.
            //   - All other events (SIGNED_OUT, USER_UPDATED, etc.) are
            //     ignored — they're not sign-ins.
            if (event === "SIGNED_IN") {
              if (isFreshSignIn(session)) {
                void logLoginForUser(session.user.id);
              }
            } else if (event === "TOKEN_REFRESHED") {
              if (shouldLogRefresh()) {
                void logLoginForUser(session.user.id);
              }
            }
          } else if (event === "SIGNED_OUT") {
            // Stop the debounced preference auto-pusher so we don't
            // keep writing to a user_preferences row we no longer own.
            void stopPrefsSync();
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
 *
 * COLD-START TIMEOUT (Phase 14 Chunk 8 fix):
 *   On the first load of the day, Supabase's auth.getSession() can
 *   hang for a long time (DNS lookup slow, supabase.co cold start,
 *   flaky 3G, service worker intercepting the request, etc.). When
 *   that happens `authReady` never becomes true, the top-level
 *   <Suspense> in app.tsx keeps rendering the GlassLoadingState
 *   spinner forever, and the user is forced to manually refresh.
 *
 *   To fix this, we race getBrowserSession() against an 8-second
 *   timeout. Whichever resolves first wins:
 *     • If the session resolves first → normal happy path.
 *     • If the timeout fires first → we treat the user as signed-out
 *       (set user(null) + authReady(true)). The onAuthStateChange
 *       listener (registered in onMount) will still fire later if
 *       Supabase eventually resolves, which updates the signals
 *       again — so a slow session is recovered transparently
 *       without the user ever seeing a stuck loader.
 *
 *   8 seconds is chosen because: it's long enough that a normal
 *   warm session check (typically <500ms) never trips it; it's
 *   short enough that a user staring at a stuck loader doesn't
 *   give up and abandon the app. A11y testing shows sighted users
 *   perceive anything >10s as "broken"; 8s reads as "slow but
 *   working".
 */
async function checkInitialSession() {
  // 8-second cold-start timeout. See the doc comment above for the
  // rationale. The race is implemented with Promise.race + a custom
  // timeout promise (rather than AbortController) because
  // supabase.auth.getSession() doesn't accept an AbortSignal — we
  // can't actually cancel the underlying fetch, we just stop waiting
  // for it. The dangling fetch will eventually settle in the
  // background; if it succeeds, the onAuthStateChange listener will
  // pick it up and update the signals.
  const COLD_START_TIMEOUT_MS = 8000;

  // Track whether the timeout has already fired so the real session
  // resolution (if it arrives late) knows whether to bail out. This
  // is NOT for correctness — the signals are idempotent — but it
  // avoids a confusing double-log if a late session arrives after
  // we've already declared "signed out".
  let timedOut = false;

  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve(null);
    }, COLD_START_TIMEOUT_MS);
  });

  try {
    const { getBrowserSession } = await import("~/lib/supabase/session");
    // Race the session fetch against the cold-start timeout.
    const session = await Promise.race([
      getBrowserSession(),
      timeoutPromise
    ]);

    if (timedOut) {
      // The timeout fired before the session fetch resolved. Treat
      // the user as signed-out so the UI unblocks. If the real
      // session arrives later, onAuthStateChange will update the
      // signals transparently.
      console.warn(
        `[useAuth] Initial session check timed out after ${COLD_START_TIMEOUT_MS / 1000}s — treating as signed-out. The onAuthStateChange listener will recover if Supabase resolves later.`
      );
      setUser(null);
      setAuthReady(true);
      return;
    }

    setUser(mapSupabaseUser(session));
    setAuthReady(true);
    // Auto-populate display_name + username on initial session detection.
    if (session?.user) {
      void ensureProfileForUser(session.user);
      // Sync prefs from server → local (or push local → server) and
      // start the auto-pusher. This covers the page-reload case where
      // SIGNED_IN doesn't fire but we still have a valid session.
      void syncPrefsForUser(session.user.id);
      // Only log a sign-in on initial session check if it's actually
      // fresh (session created within the last 60 seconds). Without
      // this guard, every page reload would insert a new login_history
      // row, polluting the audit trail with "user opened the app" rows
      // instead of "user signed in" rows.
      //
      // The shouldLogRefresh() rate-limiter (6h window) provides a
      // backstop: even if the fresh-sign-in check is wrong, we never
      // log more than once per 6 hours from this code path.
      if (isFreshSignIn(session) && shouldLogRefresh()) {
        void logLoginForUser(session.user.id);
      }
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
      userMetadata: supabaseUser.user_metadata ?? null
    });
  } catch (err) {
    // Non-fatal — the profile might already exist from the Supabase trigger.
    // Log but don't crash the auth flow.
    console.error("[useAuth] ensureProfile failed:", err);
  }
}

/**
 * Sync the user's preferences between localStorage and the
 * user_preferences.prefs_json column on the server.
 *
 * Called on sign-in / initial session detection. The function:
 *   1. Reads the server's prefs_json + updated_at.
 *   2. If the server is newer than the last local sync, applies
 *      the server snapshot to the local preference signals.
 *   3. Otherwise (local is newer or equal), pushes local → server.
 *
 * This is best-effort — failures are logged but don't break the auth
 * flow. The user always has their localStorage prefs regardless.
 *
 * Also starts the debounced auto-pusher so subsequent pref changes
 * propagate to the server without requiring a manual "sync" button.
 */
async function syncPrefsForUser(uid: string): Promise<void> {
  try {
    const { syncPreferencesFromSupabase, startPreferenceSync } =
      await import("~/core/preferences/preferencesSync");
    await syncPreferencesFromSupabase(uid);
    startPreferenceSync(uid);
  } catch (err) {
    // Non-fatal — preferences sync is a nice-to-have, not a critical
    // auth step. The user's localStorage prefs still work.
    console.error("[useAuth] syncPrefsForUser failed:", err);
  }
}

/**
 * Stop the preference auto-pusher. Called on sign-out so we don't
 * keep writing to a user row we no longer own.
 */
async function stopPrefsSync(): Promise<void> {
  try {
    const { stopPreferenceSync } = await import(
      "~/core/preferences/preferencesSync"
    );
    stopPreferenceSync();
  } catch {
    // Module not loaded yet — nothing to stop.
  }
}

/**
 * Determine if a session represents a "fresh" sign-in (i.e. the user
 * actually just signed in within the last 60 seconds), as opposed to
 * a page reload that re-detects an existing stored session.
 *
 * Supabase's `onAuthStateChange` fires a SIGNED_IN event in BOTH cases,
 * which caused the login_history table to gain a new row on every page
 * reload. This helper distinguishes the two by inspecting the session's
 * `created_at` timestamp:
 *
 *   - If created_at is within the last 60 seconds → fresh sign-in → log it.
 *   - If created_at is older than 60 seconds → page reload → skip.
 *
 * The 60-second window is generous enough to absorb clock skew and the
 * time it takes for the onAuthStateChange event to actually fire after
 * the redirect, but tight enough that a reload 2 minutes after sign-in
 * won't trigger a duplicate log.
 *
 * Edge case: if the session or its created_at is missing (shouldn't
 * happen in practice, but Supabase's types allow it), we return false
 * — better to under-log than to spam the audit trail.
 */
function isFreshSignIn(session: Session | null): boolean {
  if (!session) return false;
  // The Supabase Session type has a `created_at` field (Unix seconds).
  // Older SDK versions may not have it; fall back to false to avoid
  // spamming logs if the field is absent.
  const createdAt: number | undefined = (session as {
    created_at?: number;
  }).created_at;
  if (typeof createdAt !== "number") return false;
  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - createdAt;
  // 60-second freshness window.
  return ageSec >= 0 && ageSec <= 60;
}

/**
 * Rate-limiter for TOKEN_REFRESHED events. We don't want to log every
 * hourly token refresh to login_history (it would spam the audit log).
 * This returns true only if the last log was more than 6 hours ago.
 *
 * Uses localStorage so the rate-limit persists across reloads. Key
 * is per-user so switching accounts doesn't cross-contaminate.
 */
function shouldLogRefresh(): boolean {
  try {
    const uid = user()?.uid;
    if (!uid) return false;
    const key = `cinelog:last_login_log:${uid}`;
    const last = localStorage.getItem(key);
    const now = Date.now();
    // 6 hours in ms — Supabase refreshes ~hourly, so this allows at
    // most ~4 refresh-logs per day, which is reasonable.
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    if (last && now - parseInt(last, 10) < SIX_HOURS) {
      return false;
    }
    localStorage.setItem(key, String(now));
    return true;
  } catch {
    // localStorage might be unavailable (private mode, etc.) —
    // be permissive and log.
    return true;
  }
}

/**
 * Insert a row into login_history for the given user. Best-effort —
 * any error is swallowed because login-history is an audit trail,
 * not a critical path. Uses dynamic import to avoid pulling the
 * supabase client into the initial bundle.
 *
 * The IP address is not available client-side, so we pass null. The
 * user-agent is read from navigator.userAgent.
 */
async function logLoginForUser(uid: string): Promise<void> {
  try {
    const { logLogin } = await import(
      "~/lib/supabase/repositories/loginHistory"
    );
    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent : null;
    await logLogin(uid, null, userAgent);
  } catch (err) {
    // Non-fatal — login history is best-effort.
    console.warn("[useAuth] logLogin failed:", err);
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
 * refreshUserFromServer — force a re-fetch of the user from the
 * Supabase Auth server and update the local signal.
 *
 * Used after operations that mutate the user object OUTSIDE of the
 * normal session-change event flow — for example, after unlinking
 * an OAuth identity (`supabase.auth.unlinkIdentity` doesn't fire
 * an `onAuthStateChange` event, so the local signal would otherwise
 * still show the old providers list).
 *
 * Safe to call outside a Solid component (the signal is module-level).
 */
export async function refreshUserFromServer(): Promise<void> {
  try {
    const { getBrowserSession } = await import("~/lib/supabase/session");
    const session = await getBrowserSession();
    setUser(mapSupabaseUser(session));
  } catch (err) {
    console.error("[useAuth] refreshUserFromServer failed:", err);
  }
}
