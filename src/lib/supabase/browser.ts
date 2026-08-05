/**
 * CineLog V2 — Supabase Browser Client (Standard localStorage)
 * ---------------------------------------------------------------------
 * Singleton browser-side Supabase client using the STANDARD
 * `createClient` from `@supabase/supabase-js` with `localStorage`
 * as the session storage backend.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY STANDARD supabase-js (NOT @supabase/ssr) — Phase 7 Task 15
 * ─────────────────────────────────────────────────────────────────────
 * The previous implementation used `@supabase/ssr`'s
 * `createBrowserClient` with an explicit `cookies.getAll` / `cookies.setAll`
 * adapter backed by `document.cookie`. The intent was to share session
 * state between browser and server via cookies (so SSR could read the
 * session from the Cookie header).
 *
 * In production on mobile browsers (Chrome on Android, Safari on iOS),
 * the `@supabase/ssr` cookie adapter was FUNDAMENTALLY BROKEN:
 *
 *   • The PKCE code_verifier cookie was being written by `setAll` but
 *     not consistently readable on the OAuth callback (the cookie was
 *     lost between the browser writing it and the callback page
 *     reading it). This manifested as
 *     `AuthPKCECodeVerifierMissingError` on every OAuth attempt.
 *
 *   • Mobile browsers apply stricter cookie policies than desktop:
 *     - Safari ITP drops SameSite=Lax cookies on cross-site redirects
 *       in some configurations.
 *     - Chrome on Android partitions cookies by top-level site in
 *       incognito mode and when "block third-party cookies" is on.
 *     - The cross-site redirect (provider → supabase → /auth/callback)
 *       counted as a "third-party" context in some mobile browsers,
 *       causing the verifier cookie to be silently dropped.
 *
 *   • Five prior fix attempts (see `src/routes/auth/callback.tsx`
 *     history) all tried to patch the cookie adapter — none worked
 *     reliably on mobile.
 *
 * The definitive fix is to STOP using cookies for browser auth storage
 * and use `localStorage` instead. `localStorage` is:
 *
 *   • First-party only — never blocked by SameSite/ITP/third-party
 *     cookie policies.
 *   • Synchronous and reliable — `setItem` either succeeds or throws,
 *     no silent drops.
 *   • The Supabase default — `@supabase/supabase-js`'s `createClient`
 *     uses `localStorage` by default when `persistSession: true`.
 *
 * TRADE-OFF — SSR session visibility:
 *   With cookies, the server could read the session from the Cookie
 *   header during SSR and render authenticated HTML on the first byte.
 *   With localStorage, the session is ONLY in the browser — the server
 *   sees no session during SSR. This means:
 *     • SSR renders the signed-out state.
 *     • The browser hydrates, reads localStorage, and updates the UI
 *       to the signed-in state.
 *   This is a minor UX regression (a brief signed-out → signed-in
 *   flash on hard refresh) but is the CORRECT trade-off for mobile
 *   reliability. The server-side `createServerClient` (in `server.ts`)
 *   is unchanged and still works for any code path that genuinely
 *   needs cookie-based auth (e.g. API routes that receive a Cookie
 *   header from the browser — though note that header will no longer
 *   contain the session, only whatever else the browser sends).
 *
 * ─────────────────────────────────────────────────────────────────────
 * PKCE Flow with localStorage (why this works)
 * ─────────────────────────────────────────────────────────────────────
 *   1. User clicks "Sign in with Google".
 *   2. App calls `supabase.auth.signInWithOAuth({ provider: 'google' })`.
 *   3. auth-js internally calls `storage.setItem('<key>-code-verifier', <verifier>)`
 *      → writes to `localStorage` (NOT a cookie).
 *   4. auth-js navigates the browser to Google's OAuth URL.
 *   5. Google redirects back to `/auth/callback?code=...`.
 *   6. The callback page mounts. The browser client (configured with
 *      `detectSessionInUrl: true`) parses `?code=` from the URL and
 *      calls `exchangeCodeForSession(code)` internally.
 *   7. auth-js reads the verifier from `localStorage` (NOT a cookie)
 *      and sends it to Supabase's token endpoint.
 *   8. The exchange succeeds. The session is written to `localStorage`.
 *   9. `onAuthStateChange` fires `SIGNED_IN`. The callback component
 *      navigates to `/discover`.
 *
 *   Because `localStorage` is first-party and synchronous, step 3
 *   ALWAYS succeeds (the verifier is in storage), and step 7 ALWAYS
 *   finds it. No more "PKCE code verifier not found".
 *
 * ─────────────────────────────────────────────────────────────────────
 * SSR safety
 * ----------
 * Every code path that touches `window` / `localStorage` is guarded
 * by `isServer` from `solid-js/web`. Calling `createBrowserClient` or
 * `getBrowserClient` on the server throws a descriptive error.
 *
 * HMR safety
 * ----------
 * The singleton is cached on `globalThis` (keyed with a project-specific
 * name) so Vite's Hot Module Replacement in dev does not leak stale auth
 * listeners across hot reloads.
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";

/**
 * Key under which the singleton browser client is cached on `globalThis`.
 * Prefixed with the project name to avoid colliding with any other library
 * that may stash a Supabase client on the global object.
 */
const BROWSER_CLIENT_GLOBAL_KEY =
  "__CINELOG_SUPABASE_BROWSER_CLIENT__" as const;

/**
 * Structural shape we expect on `globalThis` for singleton caching.
 */
interface GlobalWithBrowserClient {
  [BROWSER_CLIENT_GLOBAL_KEY]?: SupabaseClient;
}

/**
 * Resolved public Supabase configuration. Both fields are required — the
 * anon key is safe to ship to the browser; the service role key is not
 * (and is therefore absent).
 */
interface PublicSupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Read and validate the public Supabase environment variables.
 *
 * Throws a descriptive error if either is missing so misconfiguration is
 * loud at first use rather than silently producing 401s deeper in the
 * call stack. Reading happens at call time (not at module load time) so
 * importing this module during an SSR build never crashes the build.
 */
function readPublicConfig(): PublicSupabaseConfig {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error(
      "[CineLog Supabase] Missing VITE_SUPABASE_URL. " +
        "Set it in your .env file. Do NOT use the Service Role Key in the browser."
    );
  }

  if (typeof anonKey !== "string" || anonKey.trim().length === 0) {
    throw new Error(
      "[CineLog Supabase] Missing VITE_SUPABASE_ANON_KEY. " +
        "Set it in your .env file. Do NOT use the Service Role Key in the browser."
    );
  }

  return { url: url.trim(), anonKey: anonKey.trim() };
}

/**
 * Create a fresh browser Supabase client using the STANDARD
 * `@supabase/supabase-js` `createClient` with `localStorage` storage.
 *
 * Each call returns a NEW client instance. This is intentionally exposed
 * for tests and for the rare case where an isolated session is required.
 * Application code should prefer {@link getBrowserClient} — the shared
 * singleton — unless it has a specific reason not to.
 *
 * Auth configuration:
 *   • `persistSession: true`     — store the session in `localStorage`
 *                                   so it survives page refresh.
 *   • `autoRefreshToken: true`   — refresh expired access tokens
 *                                   automatically via a background
 *                                   fetch (no UI interruption).
 *   • `detectSessionInUrl: true` — parse `?code=` from the URL after
 *                                   an OAuth redirect and exchange it
 *                                   for a session automatically. This
 *                                   is what makes the "dumb" callback
 *                                   component work — auth-js handles
 *                                   the entire exchange, the callback
 *                                   just listens for the resulting
 *                                   `SIGNED_IN` event.
 *   • `flowType: "pkce"`         — use the PKCE OAuth flow (verifier
 *                                   stored in `localStorage`, not
 *                                   transmitted to the provider).
 *   • `storage: globalThis.localStorage`
 *                                 — explicit storage backend. This is
 *                                   the supabase-js default when
 *                                   `persistSession: true`, but we
 *                                   set it explicitly so the contract
 *                                   is obvious from this file.
 *
 * @throws Error if called on the server.
 */
export function createBrowserClient(): SupabaseClient {
  if (isServer) {
    throw new Error(
      "[CineLog Supabase] createBrowserClient() was called on the server. " +
        'Use createServerClient() from "src/lib/supabase/server.ts" instead, ' +
        'or the environment-aware getClient() from "src/lib/supabase/client.ts".'
    );
  }

  const { url, anonKey } = readPublicConfig();

  // Standard supabase-js client. NO @supabase/ssr, NO cookie adapter,
  // NO document.cookie writes. The session lives in localStorage.
  //
  // See the file header for the full rationale on why we abandoned
  // @supabase/ssr's cookie-based browser client in Phase 7 Task 15.
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      storage: globalThis.localStorage
    }
  });
}

/**
 * Get the shared singleton browser Supabase client.
 *
 * Instantiates on first call, then returns the cached instance on every
 * subsequent call. The singleton is cached on `globalThis` so Vite's
 * Hot Module Replacement in development does not leak stale auth
 * listeners or duplicate `onAuthStateChange` subscriptions across
 * hot reloads.
 *
 * @throws Error if called on the server.
 */
export function getBrowserClient(): SupabaseClient {
  if (isServer) {
    throw new Error(
      "[CineLog Supabase] getBrowserClient() was called on the server. " +
        'Use createServerClient() from "src/lib/supabase/server.ts" instead, ' +
        'or the environment-aware getClient() from "src/lib/supabase/client.ts".'
    );
  }

  const globalScope = globalThis as unknown as GlobalWithBrowserClient;
  const cached = globalScope[BROWSER_CLIENT_GLOBAL_KEY];
  if (cached) {
    return cached;
  }

  const client = createBrowserClient();
  globalScope[BROWSER_CLIENT_GLOBAL_KEY] = client;
  return client;
}

export type { SupabaseClient };
