/**
 * CineLog V2 — Supabase Integration Layer (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the Supabase SDK integration. Application code
 * should import from here, not from the individual submodules, so
 * the internal folder layout can evolve without touching call-sites.
 *
 * Re-exports
 * ----------
 *   getClient()              — environment-aware accessor (PRIMARY API)
 *   getBrowserClient()       — singleton, browser only
 *   createBrowserClient()    — factory, browser only
 *   createServerClient()     — factory, server only (per-request)
 *   SupabaseClient (type)    — for typed consumers (repositories etc.)
 *
 * Phase 1 scope
 * -------------
 * This barrel is the entire Supabase surface today. Auth helpers,
 * repository classes, middleware and generated `database.types.ts`
 * will be added in later migration phases — see Integration Guide
 * §07 ("Migration Strategy") and §10 ("File Migration Order").
 *
 * Nothing in this barrel is consumed by the application yet. The
 * Firebase backend remains the sole source of truth until the
 * migration explicitly cuts over.
 */

export { getBrowserClient, createBrowserClient } from "./browser";
export type { SupabaseClient } from "./browser";

export { createServerClient } from "./server";

export { getClient } from "./client";
