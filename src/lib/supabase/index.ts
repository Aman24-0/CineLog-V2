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
 *   Database (type)          — generated database schema types
 *   Tables, TablesInsert,
 *   TablesUpdate             — per-table helper types for repositories
 *   Enums, CompositeTypes    — schema-level helper types
 *   Constants                — runtime constant map of enum values
 *   Json                     — JSON value type used by jsonb columns
 *
 * Phase 2 scope
 * -------------
 * `database.types.ts` is the OFFICIAL output of the Supabase CLI
 * `gen types typescript` command, generated directly from the live
 * Supabase project. It is committed UNMODIFIED — do not hand-edit;
 * regenerate instead:
 *
 *     npx supabase login
 *     npx supabase gen types typescript \
 *         --project-id <your-project-ref> \
 *         > src/lib/supabase/database.types.ts
 *
 * Nothing in this barrel is consumed by the application yet. The
 * Firebase backend remains the sole source of truth until the
 * migration explicitly cuts over.
 */

export { getBrowserClient, createBrowserClient } from "./browser";
export type { SupabaseClient } from "./browser";

export { createServerClient } from "./server";

export { getClient } from "./client";

// Phase 2 — official Supabase CLI generated database types.
// Re-exported as type-only / value-only to match the CLI output exactly.
// `isolatedModules: true` in tsconfig.json requires `export type` for
// type-only re-exports; `Constants` is a runtime value so it uses a
// normal `export`.
export type {
  Json,
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes
} from "./database.types";

export { Constants } from "./database.types";


