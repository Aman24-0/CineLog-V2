// src/routes/api/auth/trakt/status.ts
//
// CineLog V2 — Trakt Connection Status (Server-Only)
// ---------------------------------------------------------------------
// GET /api/auth/trakt/status
//   → 200 {
//       connected: boolean,
//       lastSynced: string | null,  // ISO timestamp of updated_at, or null
//       trakt_username: string | null,
//       trakt_email: string | null
//     }
//   → 401 if not signed in
//   → 500 on server/DB error
//
// WHAT THIS DOES:
//   Returns whether the currently-signed-in CineLog user has a Trakt
//   account connected. The frontend calls this on mount of the
//   TraktIntegrationCard so it can render the correct UI (connected
//   vs. unconnected) without relying on localStorage or URL parameters.
//
//   `lastSynced` is the `updated_at` timestamp of the user_integrations
//   row — i.e., when the user last connected or re-connected their
//   Trakt account. (It is NOT the time of the last /sync/trakt/execute
//   call; that would require a separate column or an updated_at bump
//   in the execute route, which is out of scope here.)
//
// SECURITY:
//   • Requires an authenticated CineLog session.
//   • Uses the service-role admin client to read user_integrations
//     (the table is RLS-protected, but the access_token column is
//     sensitive — we only select the non-sensitive columns here).
//   • The access_token + refresh_token are NEVER returned.

import { isServer } from "solid-js/web";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";

interface APIEvent {
  request: Request;
}

// ─── Types ────────────────────────────────────────────────────────

interface StatusResponse {
  connected: boolean;
  lastSynced: string | null;
  trakt_username: string | null;
  trakt_email: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

/**
 * Verify the user is signed in. Returns the user_id on success.
 *
 * Mirrors the pattern in /api/sync/trakt/preview.ts — uses the anon-key
 * client + getUser(accessToken) so RLS is enforced and we prove the
 * token belongs to a real, currently-signed-in user.
 */
async function requireSignedInUser(
  request: Request
): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const accessToken = getSupabaseAccessToken(cookieHeader);
  if (!accessToken) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error } = await verifyClient.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user.id;
}

// ─── GET handler ──────────────────────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  // ─── 1. Verify session ───────────────────────────────────────────
  const userId = await requireSignedInUser(event.request);
  if (!userId) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  // ─── 2. Query user_integrations for a Trakt row ──────────────────
  //
  // We select only the columns we need — NEVER access_token or
  // refresh_token, since those are server-side secrets that must
  // never reach the browser.
  let data: {
    provider_user_id: string | null;
    provider_email: string | null;
    updated_at: string;
  } | null;

  try {
    const admin = createAdminClient();
    const result = await admin
      .from("user_integrations")
      .select("provider_user_id, provider_email, updated_at")
      .eq("user_id", userId)
      .eq("provider", "trakt")
      .maybeSingle();

    if (result.error) {
      console.error(
        "[trakt/status] DB read failed:",
        result.error.message
      );
      return jsonResponse(
        { error: "Failed to read Trakt integration status" },
        500
      );
    }

    data = result.data;
  } catch (err) {
    console.error(
      "[trakt/status] Unexpected error:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse(
      { error: "Failed to read Trakt integration status" },
      500
    );
  }

  // ─── 3. Build the response ───────────────────────────────────────
  if (!data) {
    const notConnected: StatusResponse = {
      connected: false,
      lastSynced: null,
      trakt_username: null,
      trakt_email: null
    };
    return jsonResponse(notConnected);
  }

  const connected: StatusResponse = {
    connected: true,
    lastSynced: data.updated_at,
    trakt_username: data.provider_user_id,
    trakt_email: data.provider_email
  };
  return jsonResponse(connected);
}

// Reject POST / other methods.
export async function POST(): Promise<Response> {
  return jsonResponse(
    { error: "Method not allowed. Use GET to check Trakt status." },
    405
  );
}
