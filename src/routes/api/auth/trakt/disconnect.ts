// src/routes/api/auth/trakt/disconnect.ts
//
// CineLog V2 — Trakt Disconnect (Server-Only)
// ---------------------------------------------------------------------
// POST /api/auth/trakt/disconnect
//   → 200 { ok: true }                   — row deleted (or never existed)
//   → 401 if not signed in
//   → 500 on server/DB error
//
// WHAT THIS DOES:
//   Removes the user's Trakt integration row from `user_integrations`.
//   After this call, the user's Trakt access_token + refresh_token are
//   no longer stored server-side, so all subsequent /api/sync/trakt/*
//   calls will return 409 (not connected).
//
//   This is the "forget my Trakt account" action. It does NOT:
//     • revoke the token on Trakt's side (the user must do that
//       themselves at https://trakt.tv/settings/oauth — we have no
//       API endpoint for revocation in Trakt's API as of writing).
//     • delete any items that were previously imported from Trakt.
//       Those items remain in the user's vault; they're just CineLog
//       records now, no longer tied to Trakt.
//
// IDEMPOTENT:
//   If the user calls disconnect when they have no Trakt connection
//   (e.g., they manually cleared their cookies, or the row was
//   already deleted), we still return 200 { ok: true }. The end state
//   is the same: no Trakt row exists for this user.
//
// SECURITY:
//   • Requires an authenticated CineLog session.
//   • Uses the service-role admin client to delete the row (RLS would
//     otherwise allow the user to delete their own row via the anon
//     client, but the existing OAuth callback + status routes also
//     use the admin client for consistency, so we follow the same
//     pattern here).
//   • No request body is read — the user_id is taken from the session.

import { isServer } from "solid-js/web";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";

interface APIEvent {
  request: Request;
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
 * Mirrors the pattern in /api/sync/trakt/preview.ts and status.ts.
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

// ─── POST handler ─────────────────────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  // ─── 1. Verify session ───────────────────────────────────────────
  const userId = await requireSignedInUser(event.request);
  if (!userId) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  // ─── 2. Delete the Trakt integration row ─────────────────────────
  //
  // Idempotent: if no row exists, the delete affects 0 rows and
  // Postgres returns no error. We don't need to check whether a row
  // existed first — the end state is the same either way.
  try {
    const admin = createAdminClient();
    const { error: deleteError } = await admin
      .from("user_integrations")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "trakt");

    if (deleteError) {
      console.error(
        "[trakt/disconnect] DB delete failed:",
        deleteError.message
      );
      return jsonResponse(
        { error: "Failed to disconnect Trakt account" },
        500
      );
    }
  } catch (err) {
    console.error(
      "[trakt/disconnect] Unexpected error:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse(
      { error: "Failed to disconnect Trakt account" },
      500
    );
  }

  // ─── 3. Return success ───────────────────────────────────────────
  //
  // We deliberately don't return any Trakt-side revocation status —
  // we can't revoke the token on Trakt's side from here. The user
  // must do that themselves at https://trakt.tv/settings/oauth if
  // they want full revocation. (The frontend's disconnect toast
  // mentions this.)
  return jsonResponse({ ok: true });
}

// Reject GET / other methods.
export async function GET(): Promise<Response> {
  return jsonResponse(
    { error: "Method not allowed. Use POST to disconnect Trakt." },
    405
  );
}
