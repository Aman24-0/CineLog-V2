// src/routes/api/follow/index.ts
//
// CineLog V2 — Social Follow / Unfollow API (Server-Only)
// ---------------------------------------------------------------------
//   POST   /api/follow   { targetUserId }   → follow a user
//   DELETE /api/follow   { targetUserId }   → unfollow a user
//
// WHY A SERVER ROUTE (instead of direct Supabase writes from the browser):
//   The `follows` table's RLS DOES allow the browser to insert/delete its
//   own follow edges directly (see migration 20260730_add_social_and_profile_fields.sql:
//   follows_insert WITH CHECK auth.uid() = follower_id, follows_delete
//   USING auth.uid() = follower_id). So in principle the browser could
//   call supabase.from('follows').insert(...) directly.
//
//   We still route through a server endpoint because:
//     1. Self-follow validation — the DB enforces it via a CHECK
//        constraint, but a 400 from the API is friendlier than a
//        Postgres error string parsed client-side.
//     2. Input validation — the route validates the targetUserId is a
//        non-empty string before hitting Supabase, so we never send a
//        malformed INSERT that wastes a round-trip.
//     3. Symmetry — every other user-owned write in the codebase
//        (account/delete, push/send, account/email-change) goes through
//        a server route. Following that convention keeps the security
//        surface uniform.
//     4. Future hooks — when we add follow notifications (Phase 6), the
//        server can fan out a notification row + push without exposing
//        that orchestration to the client.
//
// SECURITY:
//   • Requires an authenticated session (verified via access_token in
//     body OR the sb-*-auth-token cookie — the same dual-path as
//     /api/account/delete and /api/push/send).
//   • The caller's uid (from the verified session) is used as
//     `follower_id` — the body's `targetUserId` is ONLY used as the
//     `following_id`. So a malicious client can't forge a follow edge
//     where someone else is the follower.
//   • Self-follow is rejected with 400 (the DB also blocks it via a
//     CHECK constraint, but the early return gives a clearer error).
//
// IDEMPOTENCY:
//   • POST  — if the follow edge already exists (Postgres 23505
//     unique-violation), the route returns 200 success. The caller's
//     intent ("I follow this user") is already true.
//   • DELETE — if the follow edge doesn't exist, the DELETE affects 0
//     rows and the route returns 200 success. The caller's intent
//     ("I don't follow this user") is already true.

import { createClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";
import { extractAccessToken } from "~/lib/auth/token";

interface APIEvent {
  request: Request;
}

interface FollowRequestBody {
  targetUserId?: unknown;
  accessToken?: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * Resolve + verify the caller's session via the unified token helper.
 *
 * Returns the verified user id on success, or a `Response` (the error
 * to send to the client) on failure.
 */
async function resolveCaller(
  event: APIEvent,
  body: FollowRequestBody
): Promise<{ userId: string } | { response: Response }> {
  // The helper tries: Authorization header → query → body → cookie.
  // We pass the pre-parsed body so it can read body.accessToken.
  const accessToken = extractAccessToken(event, { body });

  if (!accessToken) {
    return {
      response: jsonResponse(
        { error: "No active session. Please sign in first." },
        401
      )
    };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[api/follow] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
    );
    return { response: jsonResponse({ error: "Server misconfigured" }, 500) };
  }

  // Use the anon-key client (NOT service role) so RLS is enforced — this
  // proves the token belongs to a real, currently-signed-in user. The
  // follow INSERT/DELETE then runs in the same RLS context, which means
  // the database will re-verify `auth.uid() = follower_id` before
  // allowing the write. Defense in depth.
  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } =
    await verifyClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return {
      response: jsonResponse(
        { error: "Your session has expired. Please sign in again." },
        401
      )
    };
  }

  return { userId: userData.user.id };
}

/**
 * Parse + validate the JSON body. Returns the parsed body or a `Response`
 * (the error to send to the client) on failure.
 */
async function parseBody(
  event: APIEvent
): Promise<{ body: FollowRequestBody } | { response: Response }> {
  let body: FollowRequestBody;
  try {
    body = (await event.request.json()) as FollowRequestBody;
  } catch {
    return { response: jsonResponse({ error: "Invalid JSON body" }, 400) };
  }
  if (typeof body !== "object" || body === null) {
    return { response: jsonResponse({ error: "Body must be a JSON object" }, 400) };
  }
  return { body };
}

/**
 * Validate that `targetUserId` is a non-empty string. Returns the
 * trimmed id or a `Response` (the error to send to the client) on failure.
 */
function validateTargetUserId(
  body: FollowRequestBody
): { targetUserId: string } | { response: Response } {
  const targetUserId =
    typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  if (!targetUserId) {
    return {
      response: jsonResponse(
        { error: "targetUserId is required and must be a non-empty string." },
        400
      )
    };
  }
  return { targetUserId };
}

/**
 * Build a Supabase client scoped to the caller's access token so RLS
 * policies that depend on `auth.uid()` evaluate correctly. The token
 * comes from `resolveCaller` (which already tried header → body →
 * cookie via extractAccessToken).
 */
function buildCallerClient(accessToken: string | undefined) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    }
  });
}

// ─── POST /api/follow ───────────────────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }
  if (event.request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const parsed = await parseBody(event);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;

  const validTarget = validateTargetUserId(body);
  if ("response" in validTarget) return validTarget.response;
  const { targetUserId } = validTarget;

  const caller = await resolveCaller(event, body);
  if ("response" in caller) return caller.response;
  const { userId } = caller;

  // Self-follow guard. The DB also blocks this via a CHECK constraint
  // (follows_no_self_follow), but rejecting here gives a cleaner error
  // and avoids the round-trip.
  if (userId === targetUserId) {
    return jsonResponse(
      { error: "You can't follow yourself." },
      400
    );
  }

  // Build a caller-scoped client using the resolved access token.
  // resolveCaller already extracted the token via extractAccessToken
  // (header → body → cookie), so we pass it directly.
  const callerClient = buildCallerClient(
    typeof body.accessToken === "string" ? body.accessToken : undefined
  );

  try {
    const { error } = await callerClient.from("follows").insert({
      follower_id: userId,
      following_id: targetUserId
    });

    if (error) {
      const code = (error as { code?: string }).code;
      // 23505 = unique_violation — the follow edge already exists.
      // Treat as success (idempotent follow).
      if (code === "23505") {
        return jsonResponse({ success: true, alreadyFollowing: true });
      }
      console.error("[api/follow POST] insert failed:", error.message);
      return jsonResponse(
        { error: "Failed to follow user. Please try again." },
        500
      );
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("[api/follow POST] Unexpected error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── DELETE /api/follow ─────────────────────────────────────────────

export async function DELETE(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }
  if (event.request.method !== "DELETE") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const parsed = await parseBody(event);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;

  const validTarget = validateTargetUserId(body);
  if ("response" in validTarget) return validTarget.response;
  const { targetUserId } = validTarget;

  const caller = await resolveCaller(event, body);
  if ("response" in caller) return caller.response;
  const { userId } = caller;

  const callerClient = buildCallerClient(
    typeof body.accessToken === "string" ? body.accessToken : undefined
  );

  try {
    const { error } = await callerClient
      .from("follows")
      .delete()
      .eq("follower_id", userId)
      .eq("following_id", targetUserId);

    if (error) {
      console.error("[api/follow DELETE] delete failed:", error.message);
      return jsonResponse(
        { error: "Failed to unfollow user. Please try again." },
        500
      );
    }

    // Idempotent — if no row matched, the caller's intent ("I don't
    // follow this user") is already true, so we still return success.
    return jsonResponse({ success: true });
  } catch (err) {
    console.error("[api/follow DELETE] Unexpected error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// Reject GET so crawlers don't trigger anything. Use the dedicated
// /api/follow/status endpoint for the "am I following?" check.
export async function GET(): Promise<Response> {
  return jsonResponse(
    {
      error:
        "GET not supported. Use POST to follow, DELETE to unfollow, or GET /api/follow/status to check status."
    },
    405
  );
}
