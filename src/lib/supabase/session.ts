// src/lib/supabase/session.ts
/**
 * CineLog V2 — Supabase Session Helpers (SSR-safe)
 * ---------------------------------------------------------------------
 * Session lifecycle utilities that complement the auth wrappers in
 * `./auth.ts`. Where `auth.ts` exposes one-shot actions (sign in,
 * sign out, reset password, …), this module exposes the *reactive*
 * and *runtime-gated* accessors a SolidStart app needs:
 *
 *   • onSessionChange   — subscribe to auth-state events
 *   • getServerSession  — SSR-only session reader (loud-fails on browser)
 *   • getBrowserSession — browser-only session reader (loud-fails on server)
 *   • requireSession    — guard that throws if no session (in sessionGuards.ts)
 *   • requireUser       — guard that validates user server-side (in sessionGuards.ts)
 *
 * SSR contract: the server has no localStorage, so the browser singleton's
 * persisted session is unavailable. Until cookie forwarding lands:
 *   - `getServerSession()`  returns `null` (no session on the server).
 *   - `getBrowserSession()` throws if called on the server.
 *   - `onSessionChange()`   is a no-op on the server.
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
import {
  SessionRequiredError,
  requireSession,
  requireUser
} from "./sessionGuards";

// Re-export the types callers commonly need alongside session helpers.
export type { AuthChangeEvent, AuthError, Session, Subscription, User };

// Re-export the guards so existing consumers can keep importing from session.ts.
export { SessionRequiredError, requireSession, requireUser };

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

/**
 * Callback shape for `onSessionChange`. Receives the Supabase auth event
 * name and the new session (or `null` when signed out / no session).
 */
export type SessionChangeCallback = (
  event: AuthChangeEvent,
  session: Session | null
) => void | Promise<void>;

/**
 * Subscription handle returned by `onSessionChange`. Call `unsubscribe()`
 * to stop receiving events.
 */
export interface SessionSubscription {
  unsubscribe: () => void;
}

/**
 * Subscribe to Supabase auth-state changes.
 *
 * On the server this is a no-op (returns a subscription whose
 * `unsubscribe` is also a no-op), so callers do not need to wrap it
 * in `onMount` guards.
 */
export function onSessionChange(
  callback: SessionChangeCallback
): SessionSubscription {
  if (isServer) {
    return { unsubscribe: () => {} };
  }
  const supabase = getBrowserClient();
  const { data: subscription } = supabase.auth.onAuthStateChange(
    (event, session) => {
      // Fire-and-forget; the SDK does not await the callback.
      void callback(event, session);
    }
  );
  return {
    unsubscribe: () => subscription.subscription.unsubscribe()
  };
}

// ---------------------------------------------------------------------------
// Runtime-gated session readers
// ---------------------------------------------------------------------------

/**
 * Read the session on the server. Returns `null` (no persisted session
 * without cookie forwarding). Throws if called on the browser.
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
 * Read the session on the browser. Uses the shared singleton client
 * from `getBrowserClient()`. Returns `null` when there is no session.
 *
 * @throws Error if called on the server. Use `getServerSession` there.
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
  if (error) throw error;
  return data.session;
}

// ---------------------------------------------------------------------------
// Exports kept for callers that want the raw client factories
// ---------------------------------------------------------------------------

// Re-exported so callers can import everything session-related from a
// single module if they prefer. The canonical entry point remains the
// barrel at `src/lib/supabase/index.ts`.
export { createServerClient, getBrowserClient, getClient };
