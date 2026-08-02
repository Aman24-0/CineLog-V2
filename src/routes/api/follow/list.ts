// src/routes/api/follow/list.ts
//
// CineLog V2 — Followers / Following List API (Server-Only)
// ---------------------------------------------------------------------
//   GET /api/follow/list?targetUserId=<uuid>&type=followers&limit=20&page=1
//   GET /api/follow/list?targetUserId=<uuid>&type=following&limit=20&page=1
//
// Returns a paginated list of users who either follow `targetUserId`
// (type=followers) OR are followed by `targetUserId` (type=following).
//
// Each item is enriched with the user's public profile (display_name,
// username, avatar_url) so the list can render user cards without a
// second round-trip.
//
// AUTH:
//   Public (no session required) — the social graph is public by
//   design (the follows table has `follows_read` RLS allowing any
//   authenticated user to SELECT all rows). Anonymous viewers get an
//   empty list because the anon role can't read follows.
//
//   The caller's session (if present) is used to enrich each row with
//   `isFollowing` — whether the CALLER follows that user. This lets
//   the list render a Follow/Following button per row without a
//   second status-check round-trip per user.
//
// PRIVACY:
//   • Only public profile fields are returned (id, username,
//     display_name, avatar_url). Bio, country, email, etc. are NOT
//     exposed.
//   • Soft-deleted profiles (deleted_at IS NOT NULL) are filtered out.
//   • The list works for any target user — you can browse anyone's
//     follower/following graph, not just your own.

import { createClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";
import { extractAccessToken } from "~/lib/auth/token";

interface APIEvent {
  request: Request;
}

interface APIUser {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Whether the CALLER follows this user (false when caller is signed out). */
  isFollowing: boolean;
}

interface ListResponse {
  data: APIUser[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Short cache so back-button navigation doesn't refetch.
      "Cache-Control": "private, max-age=15, stale-while-revalidate=30"
    }
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
  const type = (url.searchParams.get("type") ?? "").trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      parseInt(url.searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT
    )
  );
  const page = Math.max(
    1,
    parseInt(url.searchParams.get("page") ?? "", 10) || 1
  );
  const offset = (page - 1) * limit;

  if (!targetUserId) {
    return jsonResponse(
      { error: "targetUserId query parameter is required." },
      400
    );
  }
  if (type !== "followers" && type !== "following") {
    return jsonResponse(
      { error: "type must be 'followers' or 'following'." },
      400
    );
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[api/follow/list] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
    );
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // Resolve the caller's session via the unified token helper.
  // The list is public (anyone can browse), but the isFollowing
  // enrichment per row requires the caller's session. Anon viewers
  // get isFollowing=false for every row.
  const callerAccessToken = extractAccessToken(event);

  // Caller-scoped client (so RLS evaluates follows_read with the
  // caller's auth context — any authenticated user can read all rows;
  // anon can't read any).
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: callerAccessToken
      ? { headers: { Authorization: `Bearer ${callerAccessToken}` } }
      : {}
  });

  // Resolve caller uid (for the isFollowing enrichment). If the token
  // is invalid or absent, callerUid stays null and isFollowing is
  // always false.
  let callerUid: string | null = null;
  if (callerAccessToken) {
    const { data: userData } = await callerClient.auth.getUser(
      callerAccessToken
    );
    if (userData?.user) {
      callerUid = userData.user.id;
    }
  }

  try {
    // ─── 1. Fetch the follow edges ─────────────────────────────────
    //
    // For type=followers: rows where following_id = targetUserId
    //   (these are people who follow the target).
    // For type=following: rows where follower_id = targetUserId
    //   (these are people the target follows).
    //
    // We select the OPPOSITE column — for followers we want
    // follower_id (the person doing the following); for following we
    // want following_id (the person being followed).
    const oppositeColumn =
      type === "followers" ? "follower_id" : "following_id";
    const filterColumn =
      type === "followers" ? "following_id" : "follower_id";

    const { data: followRows, error: followError } = await callerClient
      .from("follows")
      .select(`id, ${oppositeColumn}, created_at`)
      .eq(filterColumn, targetUserId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (followError) {
      console.error(
        "[api/follow/list] follows SELECT failed:",
        followError.message
      );
      return jsonResponse(
        { error: "Failed to load list. Please try again." },
        500
      );
    }

    const rows = (followRows as Array<Record<string, unknown>>) ?? [];
    const userIds = rows
      .map((r) => r[oppositeColumn] as string)
      .filter(Boolean);

    if (userIds.length === 0) {
      return jsonResponse({
        data: [],
        pagination: { page, limit, hasMore: false }
      } satisfies ListResponse);
    }

    // ─── 2. Batch-fetch the user profiles ──────────────────────────
    //
    // RLS on profiles allows authenticated SELECT on public columns
    // (id, username, display_name, avatar_url, deleted_at). Anon
    // viewers can't read profiles — they get an empty list (the
    // follows were readable but the profile enrichment fails).
    //
    // We use the caller-scoped client so the read runs with the
    // caller's auth context.
    const { data: profileRows, error: profileError } = await callerClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, deleted_at")
      .in("id", userIds);

    if (profileError) {
      console.warn(
        "[api/follow/list] profiles SELECT failed:",
        profileError.message
      );
      // Non-fatal — render with null display names.
    }

    const profileMap = new Map<string, {
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      deleted_at: string | null;
    }>();
    for (const row of (profileRows as Array<{
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      deleted_at: string | null;
    }>) ?? []) {
      profileMap.set(row.id, {
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        deleted_at: row.deleted_at
      });
    }

    // ─── 3. Fetch the caller's following set (for isFollowing) ─────
    //
    // If the caller is signed in, we fetch ALL their following edges
    // (capped at 1000 — anyone following more than 1000 accounts is
    // rare, and the isFollowing enrichment is a nice-to-have, not
    // critical). We then check membership per row.
    //
    // This is O(1) per row after the initial fetch — much better than
    // N round-trips for N list items.
    const callerFollowingSet = new Set<string>();
    if (callerUid) {
      const { data: callerFollowingRows } = await callerClient
        .from("follows")
        .select("following_id")
        .eq("follower_id", callerUid)
        .limit(1000);
      for (const row of (callerFollowingRows as Array<{
        following_id: string;
      }>) ?? []) {
        callerFollowingSet.add(row.following_id);
      }
    }

    // ─── 4. Assemble the response ──────────────────────────────────
    const data: APIUser[] = [];
    for (const row of rows) {
      const userId = row[oppositeColumn] as string;
      const profile = profileMap.get(userId);
      // Skip soft-deleted profiles — they shouldn't appear in the list.
      if (profile?.deleted_at) continue;
      // Skip users whose profile we couldn't read (e.g. anon viewer) —
      // showing "Unknown user" rows is worse than hiding them.
      if (!profile) continue;

      data.push({
        id: userId,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        isFollowing: callerFollowingSet.has(userId)
      });
    }

    const hasMore = rows.length === limit;

    return jsonResponse({
      data,
      pagination: { page, limit, hasMore }
    } satisfies ListResponse);
  } catch (err) {
    console.error("[api/follow/list] Unexpected error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

export async function POST(): Promise<Response> {
  return jsonResponse(
    { error: "POST not supported. Use GET /api/follow/list." },
    405
  );
}
