/**
 * CineLog V2 — Supabase Session Helpers (SSR-safe)
 * ---------------------------------------------------------------------
 * Session lifecycle utilities that complement the auth wrappers in
 * `./auth.ts`. Where `auth.ts` exposes one-shot actions (sign in,
 * sign out, reset password, …), this module exposes the *reactive*
 * and *guard*-style primitives a SolidStart app needs:
 *
 *   • onSessionChange        — subscribe to auth-state events
 *   • getServerSession       — SSR-only session reader (loud-fails on
 *                              the browser so the wrong-runtime
 *                              mistake is caught immediately)
 *   • getBrowserSession      — browser-only session reader (the
 *                              fast path; loud-fails on the server)
 *   • requireSession         — guard that throws if no session is
 *                              present, for protected route loaders
 *   • requireUser            — guard that fetches the authoritative
 *                              user from the Auth server, for
 *                              authorization decisions
 *
 * Why a separate module from `auth.ts`?
 * -------------------------------------
 *   - `auth.ts` is purely imperative (call a function, get a result).
 *   - `session.ts` deals with subscriptions and runtime-gated
 *     accessors that have different SSR vs. browser contracts.
 *   Keeping them split makes the surface area easier to audit and
 *     matches the separation in the Supabase docs.
 *
 * SSR contract
 * ------------
 * SolidStart renders routes on the server. The server has no
 * `localStorage`, so the browser singleton's persisted session is
 * unavailable. Server-side session reading therefore requires
 * cookie forwarding (a later migration phase — see Integration
 * Guide §07). Until that lands:
 *   - `getServerSession()`  returns `null` (no session on the server).
 *   - `getBrowserSession()` throws if called on the server.
 *   - `onSessionChange()`   is a no-op on the server (returns a
 *                            subscription whose `unsubscribe` is
 *                            also a no-op), so callers do not need
 *                            to wrap it in `onMount` guards.
 *
 * This contract mirrors the existing Firebase pattern in
 * `src/core/firebase/config.ts` (auth is null on the server) and
 * `src/shared/hooks/useAuth.ts` (the listener is only registered
 * inside `onMount`, which never fires during SSR).
 *
 * Phase scope
 * -----------
 * Foundation only. Not wired into any route, hook, or component.
 */

import type {
  AuthChangeEvent,
  AuthError,
  Session,
  Subscription,
  User
} from "@supabase/supabase-js";

import { isServer } from "solid-js/web";

import { getClient } from "./client";
import { createServerClient } from "./server";
import { getBrowserClient } from "./browser";

// Re-export the types callers commonly need alongside session helpers.
export type { AuthChangeEvent, AuthError, Session, Subscription, User };

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

/**
 * Callback shape for {@link onSessionChange}.
 *
 * Receives the Supabase auth event name and the new session (or
 * `null` when signed out / no session). The async variant is
 * supported by the SDK — callers may return a Promise to perform
 * async work before the next event is processed.
 */
export type SessionChangeCallback =
  | ((event: AuthChangeEvent, session: Session | null) => void)
  | ((event: AuthChangeEvent, session: Session | null) => Promise<void>);

/**
 * Handle returned by {@link onSessionChange}. The `subscription` is
 * the underlying SDK subscription (kept for advanced use); the
 * `unsubscribe` method is the idiomatic way to tear down the
 * listener and is safe to call multiple times.
 */
export interface SessionSubscription {
  readonly subscription: Subscription;
  unsubscribe: () => void;
}

/**
 * Subscribe to Supabase auth-state changes.
 *
 * The SDK emits events for the full lifecycle:
 *   - `INITIAL_SESSION`   — fired once on subscription with the
 *                            current session (may be null).
 *   - `SIGNED_IN`         — after a successful sign-in.
 *   - `SIGNED_OUT`        — after sign-out (local, others, or global).
 *   - `TOKEN_REFRESHED`   — after the access token is refreshed.
 *   - `PASSWORD_RECOVERY` — when the user lands from a reset-email
 *                            link; the app should show the new-password
 *                            form and call `updatePassword()`.
 *   - `USER_UPDATED`      — after `updateUser()` succeeds.
 *
 * SSR safety
 * ----------
 * On the server this is a no-op: it returns a `SessionSubscription`
 * whose `subscription` is a sentinel and whose `unsubscribe` is a
 * no-op. This means callers can register a listener unconditionally
 * (no `onMount` guard needed) — during SSR nothing happens, and
 * after hydration the real listener is attached.
 *
 * On the browser it uses the shared singleton client from
 * `getBrowserClient()` so the subscription shares auth state with
 * every other consumer.
 *
 * @param callback  Invoked on every auth event. May be sync or async.
 * @returns A subscription handle. Always call `unsubscribe()` in
 *          `onCleanup` to avoid leaking listeners across route
 *          changes.
 */
export function onSessionChange(callback: SessionChangeCallback): SessionSubscription {
  if (isServer) {
    // SSR no-op: return a sentinel subscription. The real listener
    // is attached after hydration when this function re-runs on the
    // browser. This mirrors the Firebase `useAuth` pattern where the
    // listener is only registered inside `onMount`.
    const noopSubscription: Subscription = {
      id: "ssr-noop",
      callback: () => {},
      unsubscribe: () => {},
    };
    return {
      subscription: noopSubscription,
      unsubscribe: () => {},
    };
  }

  const supabase = getBrowserClient();
  const { data } = supabase.auth.onAuthStateChange(callback);
  const underlying = data.subscription;

  let unsubscribed = false;
  return {
    subscription: underlying,
    unsubscribe: () => {
      if (unsubscribed) return;
      unsubscribed = true;
      underlying.unsubscribe();
    },
  };
}

// ---------------------------------------------------------------------------
// Runtime-gated session readers
// ---------------------------------------------------------------------------

/**
 * Read the session on the server.
 *
 * Returns `null` because the server has no persisted session without
 * cookie forwarding (a later migration phase). The function is
 * exposed so future server-side code (route loaders, API handlers)
 * has a stable, named entry point — once cookie forwarding lands,
 * only this function's body needs to change.
 *
 * @throws Error if called on the browser. Use
 *         {@link getBrowserSession} there.
 */
export async function getServerSession(): Promise<Session | null> {
  if (!isServer) {
    throw new Error(
      "[CineLog Supabase] getServerSession() was called on the browser. " +
        'Use getBrowserSession() from "src/lib/supabase/session.ts" instead.'
    );
  }

  // No persisted session on the server without cookie forwarding.
  // Returning null is correct and safe: SSR renders the signed-out
  // state, and after hydration the browser client resolves the real
  // session. See the SSR contract in the file header.
  return null;
}

/**
 * Read the session on the browser.
 *
 * Uses the shared singleton client from `getBrowserClient()`, so the
 * session is the same one every other consumer sees. Returns `null`
 * when there is no session (logged out, or session expired and
 * refresh failed).
 *
 * @throws Error if called on the server. Use
 *         {@link getServerSession} there.
 */
export async function getBrowserSession(): Promise<Session | null> {
  if (isServer) {
    throw new Error(
      "[CineLog Supabase] getBrowserSession() was called on the server. " +
        'Use getServerSession() from "src/lib/supabase/session.ts" instead.'
    );
  }

  const supabase = getBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    // Surface the error so the caller can decide whether to treat it
    // as "no session" or propagate it. We do not swallow it here.
    throw error;
  }
  return data.session;
}

// ---------------------------------------------------------------------------
// Guards — for protected route loaders / API handlers
// ---------------------------------------------------------------------------

/**
 * Error thrown by {@link requireSession} and {@link requireUser} when
 * no session is present. Callers can `instanceof`-check this to
 * distinguish "unauthorized" from a genuine transport error.
 */
export class SessionRequiredError extends Error {
  constructor(message = "Supabase session required but none was found.") {
    super(message);
    this.name = "SessionRequiredError";
  }
}

/**
 * Require an active session or throw.
 *
 * Convenience guard for code paths that should never run without a
 * session (e.g. a vault write). On the browser it reads the cached
 * session; on the server it always throws because the server has no
 * persisted session until cookie forwarding lands.
 *
 * @returns The active `Session`.
 * @throws {@link SessionRequiredError} if no session is present.
 * @throws `AuthError` if the underlying `getSession()` call fails.
 */
export async function requireSession(): Promise<Session> {
  const supabase = getClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new SessionRequiredError();
  }
  return data.session;
}

/**
 * Require an authenticated user, validated server-side.
 *
 * This is the **authoritative** authorization check — unlike
 * {@link requireSession} (which trusts the locally-cached session),
 * `requireUser()` calls `getUser()` so the access token is validated
 * by the Supabase Auth server. Use this for any decision that
 * gates access to user-owned data.
 *
 * @returns The authenticated `User`.
 * @throws {@link SessionRequiredError} if no user is returned.
 * @throws `AuthError` if the underlying `getUser()` call fails.
 */
export async function requireUser(): Promise<User> {
  const supabase = getClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }
  if (!data.user) {
    throw new SessionRequiredError();
  }
  return data.user;
}

// ---------------------------------------------------------------------------
// Exports kept for callers that want the raw client factories
// ---------------------------------------------------------------------------

// Re-exported so callers can import everything session-related from a
// single module if they prefer. The canonical entry point remains the
// barrel at `src/lib/supabase/index.ts`.
export { createServerClient, getBrowserClient, getClient };
