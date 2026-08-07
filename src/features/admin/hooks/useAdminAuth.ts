// src/features/admin/hooks/useAdminAuth.ts
//
// CineLog V2 — Admin Auth Hook (Client-Side)
// ---------------------------------------------------------------------
// Reactive admin session state, shared across all admin UI components.
//
// PUBLIC API:
//   { admin, adminReady, isAdmin, login, logout, refresh }
//
// State machine:
//   adminReady = false  → initial load, session check in flight
//   adminReady = true   → session check finished
//   admin = null        → not authenticated (show login page)
//   admin = { ... }     → authenticated (show admin UI)
//
// AUTH FLOW:
//   1. On mount, call GET /api/admin/auth to check the existing cookie.
//   2. If valid, set admin = the returned admin object.
//   3. If invalid, set admin = null.
//   4. login(email, password, pin) → POST /api/admin/auth → on success,
//      set admin = returned object.
//   5. logout() → DELETE /api/admin/auth → set admin = null.
//
// SSR SAFETY:
//   Module-level signals are null/false during SSR and resolve after
//   hydration. The /admin route's index file checks `isAdmin()` and
//   shows either the login page or the admin shell.

import { createSignal } from "solid-js";
import { isServer } from "solid-js/web";
import { getClient } from "~/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────

export interface AdminSession {
  id: string;
  email: string;
  username: string;
  display_name: string;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  /** Optional debug detail from the server (e.g. env-var misconfiguration). */
  detail?: string;
  admin?: AdminSession;
  /**
   * Phase 6 Part 3 — Task 4: 2FA required flag.
   *
   * When the server returns `{ ok: false, requires2FA: true }`, the
   * caller should prompt the user for a TOTP code and retry the
   * login with `totpCode` set.
   */
  requires2FA?: boolean;
}

// ─── Module-level signals ─────────────────────────────────────────
//
// Shared across ALL components. Every component that calls
// `useAdminAuth()` reads from the same signals.

const [admin, setAdmin] = createSignal<AdminSession | null>(null);
const [adminReady, setAdminReady] = createSignal<boolean>(false);
const [loginLoading, setLoginLoading] = createSignal<boolean>(false);
const [loginError, setLoginError] = createSignal<string | null>(null);

// ─── Internal helpers ─────────────────────────────────────────────

async function fetchJSON(url: string, init?: RequestInit): Promise<unknown> {
  const resp = await fetch(url, {
    credentials: "include", // send admin cookie
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  let body: unknown = null;
  try {
    body = await resp.json();
  } catch {
    // ignore JSON parse errors
  }
  return body;
}

/**
 * Build the user-facing error string from a LoginResult. If the server
 * included a `detail` field (used for env-var misconfiguration errors),
 * append it so the operator can see the root cause without checking logs.
 */
function formatLoginError(result: { error?: string; detail?: string }): string {
  const base = result.error ?? "Login failed";
  if (result.detail) {
    return `${base} — ${result.detail}`;
  }
  return base;
}

// ─── Public hook ──────────────────────────────────────────────────

export function useAdminAuth() {
  return {
    /** The current admin session, or null if not authenticated. */
    admin,
    /** True once the initial session check has completed. */
    adminReady,
    /** True if an admin session is active. */
    isAdmin: () => admin() !== null,
    /** True while a login request is in flight. */
    loginLoading,
    /** The most recent login error message, or null. */
    loginError,

    /**
     * Verify identity + PIN and establish an admin session.
     *
     * Two paths:
     *   • `loginWithPin(pin)` — for users already signed into CineLog
     *     (e.g. via Google OAuth). The server reads the Supabase
     *     session cookie from the request and validates it.
     *   • `login(email, password, pin)` — classic email+password path
     *     for users who have a password set on their account.
     */
    async login(
      email: string,
      password: string,
      pin: string,
      totpCode?: string
    ): Promise<LoginResult> {
      setLoginLoading(true);
      setLoginError(null);
      try {
        const payload: Record<string, unknown> = {
          email,
          password,
          pin,
          mode: "password"
        };
        if (totpCode) payload.totpCode = totpCode;
        const body = (await fetchJSON("/api/admin/auth", {
          method: "POST",
          body: JSON.stringify(payload)
        })) as LoginResult;

        if (body?.ok && body.admin) {
          setAdmin(body.admin);
          return { ok: true, admin: body.admin };
        }
        const errMsg = formatLoginError(body);
        // Don't overwrite the error message if 2FA is required —
        // the caller will use the requires2FA flag to switch to the
        // TOTP input step, and we don't want to display "2FA code
        // required" as an error in the UI.
        if (!body?.requires2FA) {
          setLoginError(errMsg);
        }
        return {
          ok: false,
          error: errMsg,
          requires2FA: body?.requires2FA
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Network error";
        setLoginError(errMsg);
        return { ok: false, error: errMsg };
      } finally {
        setLoginLoading(false);
      }
    },

    /**
     * Session-based admin login — used when the user is already
     * signed into CineLog via Google OAuth (or any other method).
     *
     * The CineLog browser client stores sessions in `localStorage`
     * (NOT cookies), so the server cannot read the session from the
     * Cookie header. We therefore pull the access_token out of the
     * browser Supabase client here and send it explicitly in the
     * request body. The server validates it via
     * `supabase.auth.getUser(access_token)`.
     */
    async loginWithPin(pin: string, totpCode?: string): Promise<LoginResult> {
      setLoginLoading(true);
      setLoginError(null);
      try {
        // Fetch the current CineLog session from the browser Supabase client.
        // This is required because the session lives in localStorage, not in
        // a cookie, so the server has no way to read it without our help.
        let accessToken: string | null = null;
        if (!isServer) {
          try {
            const supabase = getClient();
            const { data, error: sessionError } =
              await supabase.auth.getSession();
            if (sessionError) {
              setLoginError(sessionError.message);
              return { ok: false, error: sessionError.message };
            }
            accessToken = data.session?.access_token ?? null;
          } catch (err) {
            const errMsg =
              err instanceof Error
                ? err.message
                : "Failed to read CineLog session";
            setLoginError(errMsg);
            return { ok: false, error: errMsg };
          }
        }

        if (!accessToken) {
          const msg =
            "No active CineLog session. Please sign in to CineLog first.";
          setLoginError(msg);
          return { ok: false, error: msg };
        }

        const payload: Record<string, unknown> = {
          pin,
          mode: "session",
          accessToken
        };
        if (totpCode) payload.totpCode = totpCode;
        const body = (await fetchJSON("/api/admin/auth", {
          method: "POST",
          body: JSON.stringify(payload)
        })) as LoginResult;

        if (body?.ok && body.admin) {
          setAdmin(body.admin);
          return { ok: true, admin: body.admin };
        }
        const errMsg = formatLoginError(body);
        if (!body?.requires2FA) {
          setLoginError(errMsg);
        }
        return {
          ok: false,
          error: errMsg,
          requires2FA: body?.requires2FA
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Network error";
        setLoginError(errMsg);
        return { ok: false, error: errMsg };
      } finally {
        setLoginLoading(false);
      }
    },

    /** Clear the admin session. */
    async logout(): Promise<void> {
      try {
        await fetchJSON("/api/admin/auth", { method: "DELETE" });
      } catch {
        // ignore — we clear local state regardless
      }
      setAdmin(null);
    },

    /** Re-check the session cookie. Useful after route changes. */
    async refresh(): Promise<void> {
      try {
        const body = (await fetchJSON("/api/admin/auth", {
          method: "GET"
        })) as {
          ok: boolean;
          admin?: AdminSession;
        };
        if (body?.ok && body.admin) {
          setAdmin(body.admin);
        } else {
          setAdmin(null);
        }
      } catch {
        setAdmin(null);
      } finally {
        setAdminReady(true);
      }
    }
  };
}

// ─── Auto-initialize on first import (browser only) ───────────────
//
// We kick off the session check immediately on module load (browser
// only) so the admin UI can render the correct state as fast as
// possible. The /admin route's index file gates rendering on
// `adminReady()` to avoid a flash of the wrong content.
//
// PHASE 15 QA BUG #4: the previous version did a bare
// `fetch("/api/admin/auth")` with NO timeout. If the network hung
// (cold start, flaky connection, service worker intercepting), the
// fetch never settled, `adminReady` stayed `false`, and the
// AdminShell stayed stuck on "Verifying admin session…" forever —
// the user had to manually refresh.
//
// The fix: race the fetch against a 5-second timeout. If the timeout
// fires first, we treat the user as signed-out (admin=null,
// adminReady=true) so the AdminShell redirects to /admin/login
// instead of hanging. The underlying fetch is NOT aborted — it keeps
// running in the background; if it eventually succeeds, a subsequent
// navigation will pick up the admin cookie. This mirrors the
// cold-start timeout pattern used in useAuth.checkInitialSession().
//
// 5 seconds is chosen because: it's long enough that a normal warm
// session check (typically <300ms) never trips it; it's short enough
// that a user staring at "Verifying admin session…" doesn't think
// the app is broken. The AdminShell's onMount checkAuth runs at
// 0ms/100ms/500ms, and its final fallback (added in this same QA
// pass) fires at 5.5s — just after this timeout — so the redirect
// to /admin/login is guaranteed.

const ADMIN_SESSION_CHECK_TIMEOUT_MS = 5000;

if (!isServer) {
  // Use a microtask to avoid blocking the first paint
  queueMicrotask(async () => {
    // Build a timeout promise that resolves to a "timeout" sentinel.
    // We resolve (rather than reject) so the Promise.race below always
    // settles with a value — simpler than try/catch around a reject.
    let timedOut = false;
    const timeoutPromise = new Promise<Response>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        // Resolve with a synthetic 408-style Response so the .json()
        // parse below yields { ok: false } and we fall through to
        // setAdmin(null). The actual fetch is still in flight; this
        // just stops us WAITING for it.
        resolve(
          new Response('{"ok":false}', {
            status: 408,
            headers: { "Content-Type": "application/json" }
          })
        );
      }, ADMIN_SESSION_CHECK_TIMEOUT_MS);
    });

    try {
      // Race the real fetch against the timeout. Whichever settles
      // first wins. The fetch is NOT aborted on timeout — it continues
      // in the background and may set the admin cookie for the next
      // navigation.
      const resp = (await Promise.race([
        fetch("/api/admin/auth", {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" }
        }),
        timeoutPromise
      ]).then((r) => r.json().catch(() => ({ ok: false })))) as {
        ok: boolean;
        admin?: AdminSession;
      };

      if (timedOut) {
        // The timeout fired before the network responded. Treat as
        // signed-out so the AdminShell redirects to login. The real
        // fetch is still in flight; if it succeeds later, the admin
        // cookie will be set and a subsequent navigation will
        // authenticate transparently.
        console.warn(
          `[useAdminAuth] Session check timed out after ${ADMIN_SESSION_CHECK_TIMEOUT_MS / 1000}s — treating as signed-out. The real fetch is still in flight; a subsequent navigation will recover if it succeeds.`
        );
        setAdmin(null);
      } else if (resp?.ok && resp.admin) {
        setAdmin(resp.admin);
      } else {
        setAdmin(null);
      }
    } catch {
      setAdmin(null);
    } finally {
      // CRITICAL: adminReady MUST become true in ALL cases — success,
      // failure, AND timeout. Without this, the AdminShell stays
      // stuck on "Verifying admin session…" forever.
      setAdminReady(true);
    }
  });
}
