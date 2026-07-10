/**
 * CineLog V2 — Supabase Environment-Aware Client
 * ---------------------------------------------------------------------
 * Single entry point for application code that does not care whether
 * it is running on the client or on the server during SSR.
 *
 * Routing logic:
 *   - On the server (SSR):  returns a fresh `createServerClient()`.
 *     This is intentionally NOT cached — server instances must be
 *     isolated per request to avoid leaking auth state across users.
 *   - On the browser:       returns the shared `getBrowserClient()`
 *     singleton, cached on `globalThis` so HMR does not duplicate
 *     auth listeners.
 *
 * The detection uses `isServer` from `solid-js/web`, the same primitive
 * already used by `src/core/firebase/config.ts`. This keeps the SSR
 * contract identical across both backend integrations.
 *
 * When to use which module
 * ------------------------
 *   - Application code (repositories, hooks, services):
 *       import { getClient } from "~/lib/supabase/client";
 *       const supabase = getClient();
 *
 *   - Browser-only code that explicitly wants the singleton:
 *       import { getBrowserClient } from "~/lib/supabase/browser";
 *
 *   - Server-only code (SSR loaders, API routes) that explicitly
 *     wants a per-request client:
 *       import { createServerClient } from "~/lib/supabase/server";
 *
 * Phase 1 scope
 * -------------
 * This module is part of the SDK integration layer only. It does not
 * wire into Auth, Repositories or any feature yet — those steps are
 * deferred to later migration phases per the Integration Guide §07.
 */

import { isServer } from "solid-js/web";
import { getBrowserClient, type SupabaseClient } from "./browser";
import { createServerClient } from "./server";

/**
 * Get the appropriate Supabase client for the current runtime.
 *
 * On the browser this returns the shared singleton; on the server
 * it returns a fresh per-call instance. The result is always a fully
 * configured, type-safe `SupabaseClient`.
 *
 * @throws Error if the required `VITE_SUPABASE_URL` or
 *   `VITE_SUPABASE_ANON_KEY` environment variables are missing.
 *   The error is thrown at call time, not at import time, so SSR
 *   builds do not crash just because env vars are not populated.
 */
export function getClient(): SupabaseClient {
  return isServer ? createServerClient() : getBrowserClient();
}

export type { SupabaseClient };
