// src/lib/supabase/sessionGuards.ts
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { getClient } from "./client";

/**
 * sessionGuards — protected-route guard helpers.
 *
 * Extracted from session.ts to keep that file under the 250-line limit.
 * Guards throw when no session/user is present, so callers can use
 * try/catch to handle unauthorized access.
 */

/**
 * Error thrown by `requireSession` and `requireUser` when no session is
 * present. Callers can `instanceof`-check this to distinguish
 * "unauthorized" from a genuine transport error.
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
  if (error) throw error;
  if (!data.session) throw new SessionRequiredError();
  return data.session;
}

/**
 * Require an authenticated user, validated server-side.
 *
 * This is the **authoritative** authorization check — unlike
 * `requireSession` (which trusts the locally-cached session),
 * `requireUser()` calls `getUser()` so the access token is validated
 * by the Supabase Auth server. Use this for any decision that gates
 * access to user-owned data.
 *
 * @returns The authenticated `User`.
 * @throws {@link SessionRequiredError} if no user is returned.
 * @throws `AuthError` if the underlying `getUser()` call fails.
 */
export async function requireUser(): Promise<User> {
  const supabase = getClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new SessionRequiredError();
  return data.user;
}

// Re-export the AuthError type so callers can import everything
// guard-related from a single module.
export type { AuthError };
