/**
 * CineLog V2 — Supabase Browser Client
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
 * would touch `window` / `localStorage`. Calling `createBrowserClient`
 * or `getBrowserClient` on the server throws a descriptive error so the
 * mistake is loud rather than silently misconfiguring session state.
 *
 * Auth configuration (browser-optimised)
 * --------------------------------------
 *   persistSession     : true   localStorage-backed session persistence
 *   autoRefreshToken   : true   background JWT refresh before expiry
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
 *
 * This module is part of the SDK integration layer only (Phase 1 of
 * the migration roadmap). It does not yet wire into Auth, Repositories
 * or any feature — those steps are explicitly deferred.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";

/**
 * Key under which the singleton browser client is cached on `globalThis`.
 * Prefixed with the project name to avoid colliding with any other
 * library that may also stash a Supabase client on the global object.
 */
const BROWSER_CLIENT_GLOBAL_KEY = "__CINELOG_SUPABASE_BROWSER_CLIENT__" as const;

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
        "Use createServerClient() from \"src/lib/supabase/server.ts\" instead, " +
        "or the environment-aware getClient() from \"src/lib/supabase/client.ts\"."
    );
  }

  const { url, anonKey } = readPublicConfig();

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
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
        "Use createServerClient() from \"src/lib/supabase/server.ts\" instead, " +
        "or the environment-aware getClient() from \"src/lib/supabase/client.ts\"."
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
