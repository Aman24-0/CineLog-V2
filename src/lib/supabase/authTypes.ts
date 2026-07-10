// src/lib/supabase/authTypes.ts
import type {
  AuthError,
  AuthResponse,
  AuthTokenResponsePassword,
  Session,
  User,
  UserResponse,
} from "@supabase/supabase-js";

/**
 * authTypes — shared types for the Supabase Auth wrappers.
 *
 * Extracted from auth.ts to keep the wrappers file under the 250-line
 * limit. All types are framework-agnostic and decoupled from any
 * feature module.
 */

export interface EmailPasswordCredentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Optional metadata captured at sign-up time. Maps to
 * `auth.users.raw_user_meta_data` and is returned later on the
 * `user.user_metadata` field of {@link User}.
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
  UserResponse,
};

/**
 * Result of `getCurrentSession`. Reflects the SDK's tri-state return:
 * a real session, an error, or no session without error (e.g. SSR with
 * no persisted session, or a logged-out browser).
 */
export type GetSessionResult =
  | { data: { session: Session }; error: null }
  | { data: { session: null }; error: AuthError }
  | { data: { session: null }; error: null };

/**
 * Result of `signOut`. The SDK returns an empty data object on success;
 * the wrapper preserves that shape verbatim.
 */
export interface SignOutResult {
  readonly error: AuthError | null;
}

/**
 * Result of `resetPassword`. The SDK returns an empty data object on
 * success; the wrapper preserves that shape verbatim.
 */
export interface ResetPasswordResult {
  readonly error: AuthError | null;
}
