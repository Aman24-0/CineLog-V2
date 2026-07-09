// src/lib/supabase/auth.ts
/**
 * CineLog V2 — Supabase Authentication Wrappers
 * ---------------------------------------------------------------------
 * Production-ready, framework-agnostic wrapper functions around the
 * Supabase Auth API. Each function maps to a single auth capability:
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
 * Design principles:
 *   1. Each wrapper returns the raw Supabase `{ data, error }` tuple.
 *   2. No `any`. Every parameter and return type is the exact type
 *      exported by `@supabase/supabase-js` / `@supabase/auth-js`.
 *   3. No application coupling. Pure reusable primitives.
 *   4. SSR-safe. `getClient()` returns a stateless per-request client
 *      on the server and the shared singleton on the browser.
 *   5. No feature flags.
 *
 * Security: only the anon key is used (via `getClient()`). The Service
 * Role Key is never read here. `updatePassword` requires an active
 * session; Supabase enforces this server-side via the access token.
 */
import type {
  AuthResponse,
  AuthTokenResponsePassword,
  UserAttributes,
  UserResponse,
} from "@supabase/supabase-js";
import { getClient } from "./client";
import type {
  EmailPasswordCredentials,
  EmailRedirectOptions,
  SignUpMetadata,
  SignOutScope,
  SignOutResult,
  ResetPasswordResult,
  GetSessionResult,
  UpdatePasswordPayload,
} from "./authTypes";

// Re-export all types so existing consumers can keep importing from auth.ts.
export type {
  EmailPasswordCredentials,
  EmailRedirectOptions,
  SignUpMetadata,
  SignOutScope,
  SignOutResult,
  ResetPasswordResult,
  GetSessionResult,
  UpdatePasswordPayload,
  AuthError,
  AuthResponse,
  AuthTokenResponsePassword,
  Session,
  User,
  UserResponse,
} from "./authTypes";

/**
 * Sign up a new user with email + password.
 *
 * If email confirmation is ON (default): returns a `session: null`
 * response and sends a confirmation email. If OFF: returns a live
 * `session` and the user is signed in immediately.
 */
export async function signUp(
  credentials: EmailPasswordCredentials,
  options?: EmailRedirectOptions & { readonly data?: SignUpMetadata },
): Promise<AuthResponse> {
  const supabase = getClient();
  return supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: {
      emailRedirectTo: options?.emailRedirectTo,
      data: options?.data,
    },
  });
}

/** Sign in an existing user with email + password. */
export async function signIn(
  credentials: EmailPasswordCredentials,
): Promise<AuthTokenResponsePassword> {
  const supabase = getClient();
  return supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
}

/**
 * Sign out the current session.
 *
 * @param scope  `"local"` (default) | `"others"` | `"global"`.
 */
export async function signOut(
  scope: SignOutScope = "local",
): Promise<SignOutResult> {
  const supabase = getClient();
  const { error } = await supabase.auth.signOut({ scope });
  return { error };
}

/**
 * Fetch the currently authenticated user directly from the Supabase
 * Auth server. This is the **authoritative** source of user identity
 * (validates the access token server-side).
 */
export async function getCurrentUser(): Promise<UserResponse> {
  const supabase = getClient();
  return supabase.auth.getUser();
}

/**
 * Read the locally-cached session. On the server returns
 * `{ session: null, error: null }` (no persisted session without
 * cookie forwarding). The session's access token may be expired —
 * for authorization decisions, prefer `getCurrentUser`.
 */
export async function getCurrentSession(): Promise<GetSessionResult> {
  const supabase = getClient();
  return supabase.auth.getSession();
}

/**
 * Force-refresh the current session's JWT pair. The SDK handles this
 * automatically when `autoRefreshToken: true`, so this wrapper is
 * primarily useful for explicit refresh after long-lived operations,
 * recovering from a 401, or testing token-rotation logic.
 */
export async function refreshSession(): Promise<AuthResponse> {
  const supabase = getClient();
  return supabase.auth.refreshSession();
}

/**
 * Send a password-recovery email. Supabase sends a link that lands on
 * `emailRedirectTo` with a recovery token; the SDK emits a
 * `PASSWORD_RECOVERY` auth event when the user clicks it.
 *
 * For security, Supabase does NOT reveal whether the email exists.
 */
export async function resetPassword(
  email: string,
  redirectTo?: string,
): Promise<ResetPasswordResult> {
  const supabase = getClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  return { error };
}

/**
 * Update the signed-in user's password. Requires an active session.
 * If the project enforces `currentPassword`, supply it in the payload.
 *
 * Typical flows:
 *   1. Password recovery: reset email → PASSWORD_RECOVERY event →
 *      call `updatePassword({ newPassword })`.
 *   2. Logged-in change: call
 *      `updatePassword({ newPassword, currentPassword })`.
 */
export async function updatePassword(
  payload: UpdatePasswordPayload,
): Promise<UserResponse> {
  const supabase = getClient();
  const attributes: UserAttributes = {
    password: payload.newPassword,
  };
  if (payload.currentPassword !== undefined) {
    attributes.current_password = payload.currentPassword;
  }
  return supabase.auth.updateUser(attributes);
}
