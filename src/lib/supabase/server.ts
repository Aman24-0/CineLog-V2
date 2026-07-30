/**
 * CineLog V2 — Supabase Server Client (SSR)
 * ---------------------------------------------------------------------
 * Factory for stateless, per-request Supabase clients used during
 * SolidStart server-side rendering.
 *
 * Why no singleton on the server?
 * -------------------------------
 * A Supabase client caches auth state and realtime subscriptions
 * internally. On the server, those caches would be shared across
 * concurrent requests coming from different users — a security and
 * correctness bug. So unlike {@link "./browser.ts"} which exposes a
 * shared singleton, this module only exposes a factory. Every caller
 * gets a fresh, isolated client.
 *
 * Auth configuration (server-optimised)
 * -------------------------------------
 *   persistSession     : false   no localStorage on the server
 *   autoRefreshToken   : false   background refresh is a client concern
 *   detectSessionInUrl : false   the server never receives OAuth redirects
 *
 * Cookie / request context
 * ------------------------
 * This Phase 1 integration layer intentionally does NOT wire up
 * request-scoped cookie synchronisation. That belongs to a later
 * migration phase (see Integration Guide §07 — "Auth") once the
 * repository layer is in place. Today the server client is sufficient
 * for SSR rendering of public data and for build-time safety checks.
 *
 * Environment variables
 * ---------------------
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * The Service Role Key is NEVER read here — even on the server we
 * stick to the anon key so RLS policies are enforced. The service
 * role key is reserved for trusted admin scripts (migration tooling)
 * and is not part of the application runtime.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";

/**
 * Resolved public Supabase configuration.
 * Mirrors the shape in {@link "./browser.ts"} so the two modules can
 * evolve together if env-var handling ever needs to change.
 */
interface PublicSupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Read and validate the public Supabase environment variables.
 *
 * Same defensive pattern as the browser module: read at call time so
 * importing this file during a build never crashes the build just
 * because env vars are not populated.
 */
function readPublicConfig(): PublicSupabaseConfig {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error(
      "[CineLog Supabase] Missing VITE_SUPABASE_URL. " +
        "Set it in your .env file (server-side). The Service Role Key is NOT used by the application runtime."
    );
  }

  if (typeof anonKey !== "string" || anonKey.trim().length === 0) {
    throw new Error(
      "[CineLog Supabase] Missing VITE_SUPABASE_ANON_KEY. " +
        "Set it in your .env file (server-side). The Service Role Key is NOT used by the application runtime."
    );
  }

  return { url: url.trim(), anonKey: anonKey.trim() };
}

/**
 * Create a fresh server-side Supabase client.
 *
 * Always returns a NEW instance — never cached, never shared. Each
 * SSR request that needs Supabase should call this once and pass the
 * resulting client down to its repositories / resolvers.
 *
 * @throws Error if called on the browser. The server client's auth
 *   options are wrong for browser use (no session persistence, no
 *   URL detection), so misuse is loud-failed rather than silently
 *   producing a broken auth experience.
 */
export function createServerClient(): SupabaseClient {
  if (!isServer) {
    throw new Error(
      "[CineLog Supabase] createServerClient() was called on the browser. " +
        'Use getBrowserClient() from "src/lib/supabase/browser.ts" instead, ' +
        'or the environment-aware getClient() from "src/lib/supabase/client.ts".'
    );
  }

  const { url, anonKey } = readPublicConfig();

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export type { SupabaseClient };
