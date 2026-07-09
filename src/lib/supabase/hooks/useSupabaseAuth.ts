/**
 * CineLog V2 — Supabase Auth Hook
 * ---------------------------------------------------------------------
 * Wraps the Supabase auth foundation (`src/lib/supabase/auth.ts` +
 * `session.ts`) into a Solid-friendly hook.
 *
 * Exposes:
 *   • Reactive `user` / `session` signals — updated automatically when
 *     the Supabase auth state changes (sign-in, sign-out, token refresh,
 *     password recovery, …).
 *   • `loading` / `error` signals for the imperative auth operations.
 *   • Async wrappers for signUp / signIn / signOut / getCurrentUser /
 *     getCurrentSession / refreshSession / resetPassword / updatePassword.
 *
 * SSR safety
 * ----------
 * Mirrors the existing Firebase `useAuth` pattern (src/shared/hooks/useAuth.ts):
 * the `onSessionChange` subscription is registered inside `onMount`,
 * which only runs on the client. During SSR the signals stay at their
 * initial null/false values, avoiding hydration mismatches. The
 * subscription is cleaned up in `onCleanup` so route changes don't
 * leak listeners.
 *
 * Phase scope
 * -----------
 * Foundation only. NOT wired into the application — the existing
 * Firebase `useAuth` remains the sole source of auth truth until the
 * migration explicitly cuts over.
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import {
  getCurrentSession,
  getCurrentUser,
  refreshSession,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword
} from "../auth";
import type {
  AuthResponse,
  AuthTokenResponsePassword,
  EmailPasswordCredentials,
  EmailRedirectOptions,
  ResetPasswordResult,
  Session,
  SignOutResult,
  SignUpMetadata,
  UpdatePasswordPayload,
  User,
  UserResponse
} from "../auth";
import { onSessionChange } from "../session";
import type { AuthChangeEvent } from "../session";
import { createAsyncState } from "./_shared";

/**
 * The return type of {@link useSupabaseAuth}. Kept as an explicit
 * interface so consumers (and tests) can reference it without
 * re-deriving the union.
 */
export interface UseSupabaseAuthReturn {
  // ---- Reactive state ----
  /** The current Supabase user, or null when signed out. */
  readonly user: () => User | null;
  /** The current Supabase session, or null when signed out. */
  readonly session: () => Session | null;
  /** True once the first `onSessionChange` event has fired. */
  readonly ready: () => boolean;
  /** Convenience: true when `user()` is non-null. */
  readonly isSignedIn: () => boolean;
  /** True while any imperative auth operation is in flight. */
  readonly loading: () => boolean;
  /** The last unexpected error from an imperative operation. */
  readonly error: () => Error | null;

  // ---- Imperative auth operations (each tracked by loading/error) ----
  readonly signUp: (
    credentials: EmailPasswordCredentials,
    options?: EmailRedirectOptions & { data?: SignUpMetadata }
  ) => Promise<AuthResponse>;
  readonly signIn: (credentials: EmailPasswordCredentials) => Promise<AuthTokenResponsePassword>;
  readonly signOut: (scope?: "local" | "others" | "global") => Promise<SignOutResult>;
  readonly getCurrentUser: () => Promise<UserResponse>;
  readonly getCurrentSession: () => Promise<{ data: { session: Session | null }; error: Error | null }>;
  readonly refreshSession: () => Promise<AuthResponse>;
  readonly resetPassword: (email: string, redirectTo?: string) => Promise<ResetPasswordResult>;
  readonly updatePassword: (payload: UpdatePasswordPayload) => Promise<UserResponse>;

  /** Clear the `error` signal. */
  readonly clearError: () => void;
}

/**
 * useSupabaseAuth — reactive Supabase auth state + imperative auth ops.
 *
 * Call inside a Solid component (or a context provider subtree). The
 * hook registers an `onSessionChange` listener on mount and cleans it
 * up on unmount.
 */
export function useSupabaseAuth(): UseSupabaseAuthReturn {
  const [user, setUser] = createSignal<User | null>(null);
  const [session, setSession] = createSignal<Session | null>(null);
  const [ready, setReady] = createSignal(false);

  const { loading, error, run, clearError } = createAsyncState();

  // Subscribe to auth-state changes on the client only. `onMount` is
  // a no-op during SSR, so the signals stay null/false on the server
  // and hydrate cleanly.
  onMount(() => {
    const subscription = onSessionChange(
      (_event: AuthChangeEvent, sess: Session | null) => {
        setSession(sess);
        setUser(sess?.user ?? null);
        setReady(true);
      }
    );
    onCleanup(() => subscription.unsubscribe());
  });

  return {
    user,
    session,
    ready,
    isSignedIn: () => user() !== null,
    loading,
    error,

    signUp: (credentials, options) => run(() => signUp(credentials, options)),
    signIn: (credentials) => run(() => signIn(credentials)),
    signOut: (scope) => run(() => signOut(scope)),
    getCurrentUser: () => run(() => getCurrentUser()),
    getCurrentSession: () => run(() => getCurrentSession()),
    refreshSession: () => run(() => refreshSession()),
    resetPassword: (email, redirectTo) => run(() => resetPassword(email, redirectTo)),
    updatePassword: (payload) => run(() => updatePassword(payload)),

    clearError
  };
}
