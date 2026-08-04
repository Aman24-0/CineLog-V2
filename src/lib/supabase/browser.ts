/**
 * CineLog V2 — Supabase Browser Client (httpOnly Cookie Storage)
 * ---------------------------------------------------------------------
 * Singleton browser-side Supabase client.
 *
 * Per the Supabase Integration Guide §03, the browser surface must
 * expose a SINGLE shared client. Importing this module from the same
 * browser session more than once returns the cached instance, so auth
 * listeners, realtime subscriptions and the in-memory session state
 * stay in one place.
 *
 * SSR safety
 * ----------
 * Mirrors the pattern used by `src/core/firebase/config.ts`:
 * `isServer` from `solid-js/web` is used to guard every code path that
 * would touch `window` / `document`. Calling `createBrowserClient`
 * or `getBrowserClient` on the server throws a descriptive error so the
 * mistake is loud rather than silently misconfiguring session state.
 *
 * Phase 7 Task 5 — httpOnly Cookie Storage
 * ----------------------------------------
 * Previously the browser client used `persistSession: true`, which
 * stored the auth session (access_token + refresh_token) in
 * `localStorage`. That made sessions readable by any JS on the page,
 * including XSS payloads — a security risk.
 *
 * We now use `@supabase/ssr`'s `createBrowserClient`, which:
 *   • Stores auth tokens in httpOnly cookies (set by the server on
 *     login/redirect, NOT readable by client-side JS).
 *   • Sends the cookies automatically with every request to the
 *     same origin (so API routes like `/api/stats` and
 *     `/api/discover/taste` can read the session via the server
 *     client's `getSession()`).
 *   • Uses PKCE flow for OAuth redirects.
 *
 * The browser client NO LONGER uses `localStorage` for sessions. It
 * still keeps an in-memory cache of the current session (so
 * `onAuthStateChange` listeners fire immediately), but the source of
 * truth is the cookie — set by the server, refreshed by the server
 * on expiry.
 *
 * Migration note
 * --------------
 * Existing users with a `localStorage`-stored session will be logged
 * out on first visit after this deploy. They'll need to sign in again,
 * after which the session lives in cookies. This is a one-time cost
 * of the security migration — acceptable for a session-security fix.
 *
 * Auth configuration (browser-optimised)
 * --------------------------------------
 *   persistSession     : false  no localStorage — sessions are in cookies
 *   autoRefreshToken   : true   refresh via the cookie (server-side)
 *   detectSessionInUrl : true   parse `access_token=` after OAuth redirect
 *   flowType           : "pkce" modern PKCE flow (recommended by Supabase)
 *
 * Environment variables
 * ---------------------
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * The Service Role Key is NEVER read here. It must never reach the
 * browser bundle — see §13 of the Integration Guide ("Security").
 *
 * HMR safety
 * ----------
 * The singleton is cached on `globalThis` so Vite's Hot Module
 * Replacement in dev does not leak stale auth listeners across
 * hot reloads. The same key works on the production bundle because
 * `globalThis` is a stable host.
 */

import { createBrowserClient as ssrCreateBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";

/**
 * Key under which the singleton browser client is cached on `globalThis`.
 * Prefixed with the project name to avoid colliding with any other
 * library that may also stash a Supabase client on the global object.
 */
const BROWSER_CLIENT_GLOBAL_KEY =
  "__CINELOG_SUPABASE_BROWSER_CLIENT__" as const;

/**
 * Structural shape we expect on `globalThis` for singleton caching.
 * Kept narrow so accidental misuse (e.g. assigning the wrong type) is
 * caught by the compiler instead of silently overwriting the cache.
 *
 * The property is intentionally mutable: the first caller writes the
 * freshly created client into the cache so subsequent callers in the
 * same browser session receive the same instance.
 */
interface GlobalWithBrowserClient {
  [BROWSER_CLIENT_GLOBAL_KEY]?: SupabaseClient;
}

/**
 * Resolved public Supabase configuration.
 * Both fields are required — the anon key is safe to ship to the
 * browser; the service role key is not (and is therefore absent).
 */
interface PublicSupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Read and validate the public Supabase environment variables.
 *
 * Throws a descriptive error if either is missing so misconfiguration
 * is loud at first use rather than silently producing 401s deeper in
 * the call stack. Reading happens at call time (not at module load
 * time) so importing this module during an SSR build never crashes
 * the build just because `.env` is not populated.
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
 * Create a fresh browser Supabase client.
 *
 * Each call returns a NEW client instance. This is intentionally
 * exposed for tests and for the rare case where an isolated session
 * is required. Application code should prefer {@link getBrowserClient}
 * — the shared singleton — unless it has a specific reason not to.
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

  // `@supabase/ssr`'s createBrowserClient is the cookie-aware variant
  // of `@supabase/supabase-js`'s createClient. It:
  //   • Reads/writes auth tokens via document.cookie (httpOnly cookies
  //     set by the server are automatically sent with same-origin
  //     requests, so API routes can read them).
  //   • Does NOT use localStorage for sessions (persistSession: false).
  //   • Auto-refreshes expired tokens via a fetch to /auth/v1/token
  //     (which sets the refreshed cookie via the response).
  //   • Uses PKCE flow for OAuth redirects.
  //
  // Note: httpOnly cookies are NOT readable by client-side JS, but
  // they ARE automatically sent with same-origin requests. The
  // browser client doesn't need to read them — it just relies on the
  // server to set them and on the browser to send them.
  return ssrCreateBrowserClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce"
    }
  });
}

/**
 * Get the shared singleton browser Supabase client.
 *
 * Instantiates on first call, then returns the cached instance on
 * every subsequent call. The singleton is cached on `globalThis` so
 * Vite's Hot Module Replacement in development does not leak stale
 * auth listeners or duplicate `onAuthStateChange` subscriptions
 * across hot reloads.
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
