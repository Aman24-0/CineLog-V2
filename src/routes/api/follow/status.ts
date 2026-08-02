// src/routes/api/follow/status.ts
//
// CineLog V2 — Follow Status Check API (Server-Only)
// ---------------------------------------------------------------------
//   GET /api/follow/status?targetUserId=<uuid>
//
// Returns whether the current caller is following `targetUserId`.
//
//   • 200 { following: true }  — caller follows target
//   • 200 { following: false } — caller does NOT follow target (or no
//                                  session / target doesn't exist — we
//                                  intentionally don't distinguish)
//
// WHY A DEDICATED ENDPOINT (instead of a direct Supabase SELECT):
//   The browser COULD read the `follows` table directly (RLS allows any
//   authenticated user to SELECT all rows). But:
//     1. A server endpoint keeps the auth-context logic in one place —
//        the caller's uid is resolved server-side from the access token,
//        so a misconfigured client can't accidentally query "is anyone
//        following X" instead of "am I following X".
//     2. The endpoint gracefully handles the unauthenticated case
//        (returns `following: false`) so the FollowButton can render
//        without first checking auth state.
//     3. Same pattern as the other follow endpoints — uniform surface.
//
// PRIVACY:
//   The endpoint only reveals whether the CALLER follows the TARGET —
//   never the target's follower list or who else follows them. The
//   `following: false` response is also returned when the target user
//   doesn't exist, so this endpoint can't be used to enumerate user ids.

import { createClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";
import { extractAccessToken } from "~/lib/auth/token";

interface APIEvent {
  request: Request;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }
  if (event.request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(event.request.url);
  const targetUserId = (url.searchParams.get("targetUserId") ?? "").trim();

  if (!targetUserId) {
    return jsonResponse(
      { error: "targetUserId query parameter is required." },
      400
    );
  }

  // Resolve the caller's access token via the unified helper.
  //
  // CineLog stores sessions in localStorage (not cookies), so the
  // browser sends the token via the Authorization header. The helper
  // tries header → query → body → cookie. If no token is found, the
  // user is signed out — return `following: false` so the FollowButton
  // renders "Follow".
  const accessToken = extractAccessToken(event);

  if (!accessToken) {
    return jsonResponse({ following: false });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[api/follow/status] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
    );
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // Verify the access token to get the caller's uid. We use the anon
  // client (RLS enforced) so a forged token is rejected by Supabase
  // Auth before any data query runs.
  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } =
    await verifyClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    // Expired/invalid token — treat as signed-out.
    return jsonResponse({ following: false });
  }

  const callerUid = userData.user.id;

  // Self-check — "am I following myself?" is always false (the DB
  // blocks self-follows via a CHECK constraint). Short-circuit so we
  // don't issue a pointless query.
  if (callerUid === targetUserId) {
    return jsonResponse({ following: false });
  }

  // Cheap existence check — head: true so we don't transfer row data,
  // count: "exact" so we can read whether any row matched. We use
  // maybeSingle() instead because head+count has flaky behaviour on
  // some Supabase versions when combined with RLS.
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });

  try {
    const { data, error } = await callerClient
      .from("follows")
      .select("id")
      .eq("follower_id", callerUid)
      .eq("following_id", targetUserId)
      .maybeSingle();

    if (error) {
      console.error("[api/follow/status] query failed:", error.message);
      // Fail-safe — return false so the UI shows the "Follow" button
      // (the safer default; if we showed "Following" when in doubt,
      // the user would see an unfollow button that does nothing).
      return jsonResponse({ following: false });
    }

    return jsonResponse({ following: data !== null });
  } catch (err) {
    console.error("[api/follow/status] Unexpected error:", err);
    return jsonResponse({ following: false });
  }
}

// Reject non-GET methods so a stray POST doesn't accidentally create
// a follow edge via this endpoint.
export async function POST(): Promise<Response> {
  return jsonResponse(
    { error: "POST not supported. Use GET /api/follow/status?targetUserId=." },
    405
  );
}

export async function DELETE(): Promise<Response> {
  return jsonResponse(
    { error: "DELETE not supported. Use GET /api/follow/status?targetUserId=." },
    405
  );
}
