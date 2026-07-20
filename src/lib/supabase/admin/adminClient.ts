// src/lib/supabase/admin/adminClient.ts
//
// CineLog V2 — Admin Service-Role Client (Server-Only)
// ---------------------------------------------------------------------
// Factory for the service-role Supabase client used by admin API routes.
//
// CRITICAL SECURITY NOTES:
//   • This module MUST NEVER be imported by client-side code.
//   • The service-role key bypasses RLS entirely.
//   • All admin mutations go through this client.
//   • The client is created per-request to avoid leaking state.
//
// Reuses the same env vars as the existing /api/tmdb-cache route:
//   • VITE_SUPABASE_URL
//   • SUPABASE_SERVICE_ROLE_KEY
//
// Why a separate module from `~/lib/supabase/server.ts`?
//   The existing server module uses the anon key (so RLS is enforced).
//   Admin routes need the service-role key to:
//     - Read all users (profiles table — RLS limits to own row)
//     - Update profiles.is_admin / admin_disabled_at
//     - Read admin_actions (audit log)
//     - Insert into admin_actions (audit log)
//     - Read/write app_config (admin-only writes)
//
// Without the service role, admin routes would be unable to perform
// their functions because RLS would block them.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";

/**
 * Create a service-role Supabase client. Server-only.
 *
 * @throws if called on the browser, or if env vars are missing.
 */
export function createAdminClient(): SupabaseClient {
  if (!isServer) {
    throw new Error(
      "[CineLog Admin] createAdminClient() was called on the browser. " +
        "The service-role key must NEVER reach the client bundle."
    );
  }

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "[CineLog Admin] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "These must be set in the server environment."
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
