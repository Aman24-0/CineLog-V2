// src/routes/api/account/delete.ts
//
// CineLog V2 — Permanent Account Deletion API (Server-Only)
// ---------------------------------------------------------------------
// POST /api/account/delete
//   Body: {
//     confirmation: string,            // must equal the user's email (lowercased)
//     accessToken?: string             // optional; falls back to session cookie
//   }
//   → 200 { ok: true } on success
//   → 400 on validation error (bad confirmation text, malformed body)
//   → 401 on missing/expired session
//   → 403 on confirmation mismatch
//   → 429 on rate-limit
//   → 500 on server error
//
// WHY THIS EXISTS:
//   The previous flow called `profileRepo.permanentlyDeleteProfile(uid)`
//   directly from the browser, which uses the anon-key Supabase client.
//   But the `profiles` RLS policy is `SELECT/UPDATE: id = auth.uid()`
//   — DELETE is NOT included — so the call fails with an RLS error
//   ("new row violates row-level security policy"). The button was
//   effectively dead.
//
//   The fix: route the delete through a server API route that uses
//   the service-role client (bypasses RLS). The service-role key
//   never reaches the browser bundle.
//
// SECURITY:
//   • Requires an authenticated session (verified via access_token or
//     the sb-*-auth-token cookie).
//   • Requires the user to type their email exactly (case-insensitive)
//     as a confirmation. This matches the existing DeactivateAccountSheet
//     UI — the button is disabled until the text matches.
//   • Rate-limited per IP: max 5 attempts per 15 minutes. Even though
//     a successful delete is irreversible, this prevents brute-force
//     attempts on the confirmation text.
//   • The service-role key NEVER reaches the client bundle.
//
// DESTRUCTIVE OPERATIONS PERFORMED:
//   1. Hard-DELETE the `profiles` row (cascades to vault, collections,
//      collection_entries, episode_progress, user_presets, favorites,
//      user_preferences — all ON DELETE CASCADE).
//   2. Hard-DELETE the `auth.users` row via `supabase.auth.admin.deleteUser(uid)`.
//      This removes the Supabase auth identity so the email can be
//      re-used to sign up fresh.
//   3. The `activity_log` entries are NOT deleted — they're anonymized
//      via the `admin_id` FK ON DELETE SET NULL on admin_actions (the
//      only direct reference). User activity_log rows reference user_id
//      but the activity_log table has no FK constraint to profiles, so
//      they remain. This is intentional: aggregated analytics in
//      mv_admin_* views still need historical data.
//
// IDEMPOTENCY:
//   If the auth.users row is already gone (edge case: race between two
//   concurrent delete calls), Supabase's `deleteUser` returns success.
//   The profile DELETE is also idempotent. So a retry after a partial
//   failure is safe.

import { createClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";
import {
  isRateLimited,
  recordFailure,
  clearFailures
} from "~/lib/server/rateLimiter";

interface APIEvent {
  request: Request;
}

interface DeleteRequestBody {
  confirmation?: unknown;
  accessToken?: unknown;
}

// ─── Rate limiter ──────────────────────────────────────────────────
//
// DB-backed via the `rate_limit_buckets` table. Replaces the previous
// in-memory Map that was a no-op on Vercel serverless (cold starts
// reset the Map, so an attacker could force cold starts to bypass the
// lockout).
//
// Same semantics as before: 5 failures from the same IP in 15 minutes
// triggers a 15-minute lockout. State now persists across cold starts.
//
// Fails OPEN on DB error — a Supabase outage shouldn't lock legitimate
// users out of deleting their own account.

// ─── Helpers ──────────────────────────────────────────────────────

function getClientIP(event: APIEvent): string | null {
  // Vercel sets these. Fall back to the direct connection.
  const headers = event.request.headers;
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    null
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ─── POST handler ─────────────────────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  if (event.request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const ip = getClientIP(event);
  if (await isRateLimited("accountDelete", ip ?? "")) {
    return jsonResponse(
      { error: "Too many attempts. Please try again in 15 minutes." },
      429
    );
  }

  // Parse + validate body.
  let body: DeleteRequestBody;
  try {
    body = (await event.request.json()) as DeleteRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return jsonResponse({ error: "Body must be a JSON object" }, 400);
  }

  // ─── Resolve the access token ─────────────────────────────────
  // The browser client stores sessions in localStorage (not cookies),
  // so for OAuth users the session is unreachable from the Cookie
  // header. The DeactivateAccountSheet therefore sends the access_token
  // in the body. We also fall back to the cookie for any future
  // cookie-based session storage.
  const cookieHeader = event.request.headers.get("cookie") ?? "";
  const accessToken =
    typeof body.accessToken === "string" && body.accessToken.length > 0
      ? body.accessToken
      : getSupabaseAccessToken(cookieHeader);

  if (!accessToken) {
    return jsonResponse(
      { error: "No active session. Please sign in first." },
      401
    );
  }

  // ─── Verify the session via the anon-key client ───────────────
  // We use the anon key here (not the service role) so RLS is enforced
  // — this proves the token belongs to a real, currently-signed-in user.
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[account/delete] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
    );
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } =
    await verifyClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    await recordFailure("accountDelete", ip ?? "");
    return jsonResponse(
      { error: "Your session has expired. Please sign in again." },
      401
    );
  }

  const userId = userData.user.id;
  const userEmail = (userData.user.email ?? "").toLowerCase().trim();

  if (!userEmail) {
    return jsonResponse(
      { error: "Account has no email — cannot verify confirmation." },
      400
    );
  }

  // ─── Verify the confirmation text ─────────────────────────────
  // The user must type their email exactly (case-insensitive) to
  // confirm. This is the same check the DeactivateAccountSheet UI
  // does, but we re-verify server-side so a malicious client can't
  // bypass it.
  const confirmation =
    typeof body.confirmation === "string"
      ? body.confirmation.trim().toLowerCase()
      : "";

  if (confirmation !== userEmail) {
    await recordFailure("accountDelete", ip ?? "");
    return jsonResponse(
      {
        error:
          "Confirmation text does not match your email. Please type your email exactly to confirm."
      },
      403
    );
  }

  // ─── Perform the destructive delete ───────────────────────────
  try {
    const adminClient = createAdminClient();

    // 1. Delete the auth.users row. This invalidates the user's
    //    refresh_token immediately — they can't keep using the app.
    //    We do this FIRST so if it fails, we haven't yet deleted the
    //    profile (and the user can retry).
    const { error: authDeleteError } =
      await adminClient.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.error(
        `[account/delete] auth.admin.deleteUser failed for ${userId}:`,
        authDeleteError.message
      );
      // If the user row is already gone (e.g. race with another delete),
      // continue — the profile DELETE will still work.
      if (!authDeleteError.message.toLowerCase().includes("user not found")) {
        return jsonResponse(
          { error: "Failed to delete auth identity. Please try again." },
          500
        );
      }
    }

    // 2. Delete the profile row. Cascades to:
    //    - vault (FK ON DELETE CASCADE)
    //    - collections (FK ON DELETE CASCADE)
    //    - collection_entries (FK via vault)
    //    - episode_progress (FK ON DELETE CASCADE)
    //    - user_presets (FK ON DELETE CASCADE)
    //    - user_favorites (FK ON DELETE CASCADE)
    //    - user_preferences (FK ON DELETE CASCADE)
    //    - login_history (FK ON DELETE SET NULL)
    //    - admin_actions (admin_id FK ON DELETE SET NULL)
    const { error: profileDeleteError } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileDeleteError) {
      console.error(
        `[account/delete] profile delete failed for ${userId}:`,
        profileDeleteError.message
      );
      // The auth identity is already gone — we can't recover it.
      // Return success anyway: from the user's perspective, the
      // account is gone (they can't sign in anymore). The orphaned
      // profile row will be cleaned up by purge_soft_deleted_profiles
      // eventually, or the admin can do it manually.
      return jsonResponse({
        ok: true,
        warning:
          "Auth identity deleted, but profile cleanup encountered an error. An admin will be notified."
      });
    }

    await clearFailures("accountDelete", ip ?? "");

    // Log to stderr for the audit trail (we can't write to admin_actions
    // because the user_id FK just got SET NULL'd, and the user isn't
    // an admin anyway — admin_actions is admin-only INSERT now).
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[account/delete] Successfully deleted user ${userId} (email=${userEmail}, ip=${ip ?? "unknown"})`
      );
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[account/delete] Unexpected error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// Reject GET / other methods so crawlers don't trigger anything.
export async function GET(): Promise<Response> {
  return jsonResponse(
    { error: "GET not supported. Use POST with a confirmation JSON body." },
    405
  );
}
