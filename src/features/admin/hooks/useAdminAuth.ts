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
  admin?: AdminSession;
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
      ...(init?.headers ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await resp.json();
  } catch {
    // ignore JSON parse errors
  }
  return body;
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
    async login(email: string, password: string, pin: string): Promise<LoginResult> {
      setLoginLoading(true);
      setLoginError(null);
      try {
        const body = (await fetchJSON("/api/admin/auth", {
          method: "POST",
          body: JSON.stringify({ email, password, pin, mode: "password" }),
        })) as LoginResult;

        if (body?.ok && body.admin) {
          setAdmin(body.admin);
          return { ok: true, admin: body.admin };
        }
        const errMsg = body?.error ?? "Login failed";
        setLoginError(errMsg);
        return { ok: false, error: errMsg };
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
    async loginWithPin(pin: string): Promise<LoginResult> {
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
            const { data, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
              setLoginError(sessionError.message);
              return { ok: false, error: sessionError.message };
            }
            accessToken = data.session?.access_token ?? null;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Failed to read CineLog session";
            setLoginError(errMsg);
            return { ok: false, error: errMsg };
          }
        }

        if (!accessToken) {
          const msg = "No active CineLog session. Please sign in to CineLog first.";
          setLoginError(msg);
          return { ok: false, error: msg };
        }

        const body = (await fetchJSON("/api/admin/auth", {
          method: "POST",
          body: JSON.stringify({ pin, mode: "session", accessToken }),
        })) as LoginResult;

        if (body?.ok && body.admin) {
          setAdmin(body.admin);
          return { ok: true, admin: body.admin };
        }
        const errMsg = body?.error ?? "Login failed";
        setLoginError(errMsg);
        return { ok: false, error: errMsg };
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
        const body = (await fetchJSON("/api/admin/auth", { method: "GET" })) as {
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
    },
  };
}

// ─── Auto-initialize on first import (browser only) ───────────────
//
// We kick off the session check immediately on module load (browser
// only) so the admin UI can render the correct state as fast as
// possible. The /admin route's index file gates rendering on
// `adminReady()` to avoid a flash of the wrong content.

if (!isServer) {
  // Use a microtask to avoid blocking the first paint
  queueMicrotask(async () => {
    try {
      const resp = (await fetch("/api/admin/auth", {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).then((r) => r.json().catch(() => ({ ok: false })))) as {
        ok: boolean;
        admin?: AdminSession;
      };
      if (resp?.ok && resp.admin) {
        setAdmin(resp.admin);
      } else {
        setAdmin(null);
      }
    } catch {
      setAdmin(null);
    } finally {
      setAdminReady(true);
    }
  });
}
