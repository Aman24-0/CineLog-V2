/**
 * CineLog V2 — Supabase Authentication Wrappers
 * ---------------------------------------------------------------------
 * Production-ready, framework-agnostic wrapper functions around the
 * Supabase Auth API. Each function maps to a single auth capability
 * required by the Supabase Integration Guide §04 ("Authentication"):
 *
 *   • signUp            — email + password account creation
 *   • signIn            — email + password sign-in
 *   • signOut           — terminate the current session
 *   • getCurrentUser    — fetch the authenticated user from the Auth server
 *   • getCurrentSession — read the locally-cached session
 *   • refreshSession    — force-refresh the JWT pair
 *   • resetPassword     — send a password-recovery email
 *   • updatePassword    — set a new password for the signed-in user
 *
 * Design principles
 * -----------------
 *   1.  Each wrapper returns the raw Supabase `{ data, error }` tuple
 *       unchanged — no silent swallowing, no shape remapping. Callers
 *       (hooks, repositories, route guards) decide how to surface
 *       errors. This keeps the contract identical to the underlying
 *       SDK so the official docs apply 1:1.
 *   2.  No `any`. Every parameter and return type is the exact type
 *       exported by `@supabase/supabase-js` / `@supabase/auth-js`.
 *   3.  No application coupling. These wrappers do not import any
 *       feature module, hook, store, or Firebase code. They are pure
 *       reusable primitives. Wiring them into the app is a later
 *       migration phase and is explicitly out of scope here.
 *   4.  SSR-safe. Every wrapper resolves the client via
 *       `getClient()` from `./client`, which returns a stateless
 *       per-request client on the server and the shared singleton on
 *       the browser. Auth methods that touch `localStorage` (e.g.
 *       `getSession`, `signOut`) are therefore safe to call during
 *       SSR — they simply report no session on the server, which is
 *       the correct behaviour (the server has no persisted session
 *       without cookie forwarding, which is a later phase).
 *   5.  No feature flags. The wrappers exist; whether they are used
 *       is decided by the caller, not by a flag in this module.
 *
 * Security
 * --------
 *   • Only the anon key is used (via `getClient()`). The Service Role
 *     Key is never read here — see Integration Guide §13.
 *   • `updatePassword` requires an active session; Supabase enforces
 *     this server-side via the access token. The wrapper does not
 *     bypass that.
 *   • `resetPassword` sends a recovery link to the email; the actual
 *     password change happens later via `updatePassword` after the
 *     user clicks the link and lands on the redirect URL.
 *
 * Phase scope
 * -----------
 * This module is the authentication *foundation* only. It is not yet
 * wired into the application — `useAuth` and `src/core/firebase/auth`
 * remain the sole source of auth truth until the migration explicitly
 * cuts over (Integration Guide §07, Phase 4).
 */

import type {
  AuthError,
  AuthResponse,
  AuthTokenResponsePassword,
  Session,
  User,
  UserResponse,
  UserAttributes
} from "@supabase/supabase-js";

import { getClient } from "./client";

// ---------------------------------------------------------------------------
// Input types — narrow, documented, reusing SDK types where they exist.
// ---------------------------------------------------------------------------

/**
 * Payload for {@link signUp} and {@link signIn}.
 *
 * Email is trimmed by the caller before passing in; the wrappers do
 * not mutate input. Password is sent as-is over TLS.
 */
export interface EmailPasswordCredentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Optional metadata captured at sign-up time. Maps to
 * `auth.users.raw_user_meta_data` and is returned later on the
 * `user.user_metadata` field of {@link User}.
 *
 * Kept as a plain `Record<string, unknown>` rather than a typed shape
 * because CineLog does not yet commit to a fixed metadata schema —
 * the Database Bible §01 (profiles) stores identity in the `profiles`
 * table, not in auth metadata.
 */
export type SignUpMetadata = Record<string, unknown>;

/**
 * Optional redirect target for auth flows that send the user an email
 * (sign-up confirmation, password recovery). The Supabase project's
 * allowed redirect URLs must include this value or the email link
 * will be rejected.
 */
export interface EmailRedirectOptions {
  readonly emailRedirectTo?: string;
}

/**
 * Payload for {@link updatePassword}.
 *
 * `currentPassword` is only required when the Supabase project has
 * `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD` enabled.
 * It is optional here so the same wrapper works in both configurations.
 */
export interface UpdatePasswordPayload {
  readonly newPassword: string;
  readonly currentPassword?: string;
}

/**
 * Scope of a sign-out operation. Mirrors the SDK's `SignOut` type but
 * is redeclared locally so consumers do not need to import from
 * `@supabase/auth-js` internals.
 *
 *   - "local"   — revoke only this session (default)
 *   - "others"  — revoke all other sessions, keep this one
 *   - "global"  — revoke every session for this user
 */
export type SignOutScope = "local" | "others" | "global";

// ---------------------------------------------------------------------------
// Output types — the SDK's own response types, re-exported for callers.
// ---------------------------------------------------------------------------

export type {
  AuthError,
  AuthResponse,
  AuthTokenResponsePassword,
  Session,
  User,
  UserResponse
};

/**
 * Result of {@link getCurrentSession}. Reflects the SDK's tri-state
 * return: a real session, an error, or no session without error
 * (e.g. SSR with no persisted session, or a logged-out browser).
 */
export type GetSessionResult =
  | { data: { session: Session }; error: null }
  | { data: { session: null }; error: AuthError }
  | { data: { session: null }; error: null };

/**
 * Result of {@link signOut}. The SDK returns an empty data object on
 * success; the wrapper preserves that shape verbatim.
 */
export interface SignOutResult {
  readonly error: AuthError | null;
}

/**
 * Result of {@link resetPassword}. The SDK returns an empty data
 * object on success; the wrapper preserves that shape verbatim.
 */
export interface ResetPasswordResult {
  readonly error: AuthError | null;
}

// ---------------------------------------------------------------------------
// Wrapper functions
// ---------------------------------------------------------------------------

/**
 * Create a new user account with email + password.
 *
 * Behaviour depends on the Supabase project's email-confirmation
 * setting:
 *   - If email confirmation is ON  (default): returns a `session: null`
 *     response and sends a confirmation email. The user must click
 *     the link before they can sign in.
 *   - If email confirmation is OFF: returns a live `session` and the
 *     user is signed in immediately.
 *
 * @param credentials  Email + password for the new account.
 * @param options      Optional sign-up metadata + redirect URL.
 * @returns The raw `AuthResponse` `{ data: { user, session }, error }`.
 *          `user` is non-null on success; `session` is null when email
 *          confirmation is required.
 */
export async function signUp(
  credentials: EmailPasswordCredentials,
  options?: EmailRedirectOptions & { readonly data?: SignUpMetadata }
): Promise<AuthResponse> {
  const supabase = getClient();
  return supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: {
      emailRedirectTo: options?.emailRedirectTo,
      data: options?.data
    }
  });
}

/**
 * Sign in an existing user with email + password.
 *
 * On success the SDK returns a non-null `user` and `session` and
 * emits a `SIGNED_IN` auth event (which `onAuthStateChange`
 * subscribers will receive). On failure both are null and `error`
 * is populated.
 *
 * @param credentials  Email + password of the existing account.
 * @returns The raw `AuthTokenResponsePassword`
 *          `{ data: { user, session, weakPassword? }, error }`.
 */
export async function signIn(
  credentials: EmailPasswordCredentials
): Promise<AuthTokenResponsePassword> {
  const supabase = getClient();
  return supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password
  });
}

/**
 * Sign out the current session.
 *
 * @param scope  Which sessions to revoke. Defaults to `"local"` (this
 *               session only). Use `"global"` to revoke every session
 *               for the user (e.g. "sign out everywhere").
 * @returns `{ error }` — null on success.
 */
export async function signOut(
  scope: SignOutScope = "local"
): Promise<SignOutResult> {
  const supabase = getClient();
  const { error } = await supabase.auth.signOut({ scope });
  return { error };
}

/**
 * Fetch the currently authenticated user directly from the Supabase
 * Auth server.
 *
 * This is the **authoritative** source of user identity — unlike
 * `getCurrentSession()`, which reads from local storage and can be
 * stale or tampered with, `getUser()` validates the access token
 * server-side. Per the Supabase docs, `getUser()` should always be
 * used when checking authorization on the server.
 *
 * @returns The raw `UserResponse` `{ data: { user }, error }`. `user`
 *          is null on error (e.g. no session, expired token).
 */
export async function getCurrentUser(): Promise<UserResponse> {
  const supabase = getClient();
  return supabase.auth.getUser();
}

/**
 * Read the locally-cached session.
 *
 * On the browser this reads from `localStorage` (fast, synchronous
 * from the client's perspective). On the server it returns
 * `{ session: null, error: null }` because no session is persisted
 * — server-side session reading requires cookie forwarding, which
 * is a later migration phase.
 *
 * Note: the session's access token may be expired. For authorization
 * decisions, prefer {@link getCurrentUser} which validates server-side.
 *
 * @returns A tri-state result: real session / error / no session.
 */
export async function getCurrentSession(): Promise<GetSessionResult> {
  const supabase = getClient();
  return supabase.auth.getSession();
}

/**
 * Force-refresh the current session's JWT pair.
 *
 * Uses the refresh token stored in the current session to obtain a
 * new access token + refresh token. The SDK handles this
 * automatically when `autoRefreshToken: true` (set on the browser
 * client), so this wrapper is primarily useful for:
 *   - Explicit refresh after a long-lived server operation.
 *   - Recovering from a `401` from a downstream API.
 *   - Testing token-rotation logic.
 *
 * @returns The raw `AuthResponse` `{ data: { user, session }, error }`.
 */
export async function refreshSession(): Promise<AuthResponse> {
  const supabase = getClient();
  return supabase.auth.refreshSession();
}

/**
 * Send a password-recovery email.
 *
 * Supabase sends an email containing a link that lands on
 * `emailRedirectTo` with a recovery token in the URL. When the user
 * clicks the link, the SDK (with `detectSessionInUrl: true` on the
 * browser client) absorbs the token and emits a `PASSWORD_RECOVERY`
 * auth event — at which point the app should show a "new password"
 * form and call {@link updatePassword}.
 *
 * For security, Supabase does NOT reveal whether the email address
 * exists — the response is identical for known and unknown addresses.
 *
 * @param email          The email to send the recovery link to.
 * @param redirectTo     The URL the user lands on after clicking.
 * @returns `{ error }` — null on success.
 */
export async function resetPassword(
  email: string,
  redirectTo?: string
): Promise<ResetPasswordResult> {
  const supabase = getClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  });
  return { error };
}

/**
 * Update the signed-in user's password.
 *
 * Requires an active session — Supabase authorizes the call via the
 * access token. If the Supabase project has
 * `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD` enabled,
 * `currentPassword` must be supplied and will be verified server-side.
 *
 * Typical flows:
 *   1. **Password recovery**: user clicked the reset-password email
 *      link → `PASSWORD_RECOVERY` event → app shows "new password"
 *      form → calls `updatePassword({ newPassword })`.
 *   2. **Logged-in change**: user is signed in and wants to change
 *      their password → calls
 *      `updatePassword({ newPassword, currentPassword })`.
 *
 * @param payload  New password (required) + current password (optional,
 *                 required only if the project enforces it).
 * @returns The raw `UserResponse` `{ data: { user }, error }`. The
 *          returned `user` reflects the updated auth record.
 */
export async function updatePassword(
  payload: UpdatePasswordPayload
): Promise<UserResponse> {
  const supabase = getClient();

  const attributes: UserAttributes = {
    password: payload.newPassword
  };

  if (payload.currentPassword !== undefined) {
    attributes.current_password = payload.currentPassword;
  }

  return supabase.auth.updateUser(attributes);
}
