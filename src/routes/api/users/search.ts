// src/routes/api/users/search.ts
//
// CineLog V2 — User Search API (Server-Only)
// ---------------------------------------------------------------------
//   GET /api/users/search?q=<query>&limit=20
//
// Searches for users by username or display_name. Returns public
// profile fields (id, username, display_name, avatar_url) + an
// isFollowing flag for the current caller.
//
// AUTH:
//   Requires the service-role key (server-side only). The caller's
//   session is resolved via extractAccessToken so we can compute
//   isFollowing. Anonymous viewers get isFollowing=false.
//
// PRIVACY:
//   • Only public columns are returned (id, username, display_name,
//     avatar_url). No email, bio, country, or other private fields.
//   • Soft-deleted profiles (deleted_at IS NOT NULL) are excluded.
//   • Private profiles (is_public = false) are excluded.
//
// SEARCH STRATEGY:
//   Case-insensitive substring match (ilike) on username OR
//   display_name. For larger datasets, a full-text search index
//   would be better.

import { isServer } from "solid-js/web";
import { extractAccessToken } from "~/lib/auth/token";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { createClient } from "@supabase/supabase-js";

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

interface SearchResponse {
  data: APIUser[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=10, stale-while-revalidate=30"
    }
  });
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }
  if (event.request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(event.request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      parseInt(url.searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT
    )
  );

  if (query.length < MIN_QUERY_LENGTH) {
    return jsonResponse({ data: [] } satisfies SearchResponse);
  }

  const callerAccessToken = extractAccessToken(event);

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    console.error(
      "[api/users/search] createAdminClient failed:",
      err instanceof Error ? err.message : err
    );
    return jsonResponse(
      { error: "Server misconfigured — missing service-role key." },
      500
    );
  }

  // Resolve caller uid (for the isFollowing enrichment).
  let callerUid: string | null = null;
  if (callerAccessToken) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) {
      const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data: userData } = await verifyClient.auth.getUser(
        callerAccessToken
      );
      if (userData?.user) {
        callerUid = userData.user.id;
      }
    }
  }

  try {
    // Escape % and _ so they're treated as literals in ilike.
    const escapedQuery = query.replace(/[%_]/g, "\\$&");
    const pattern = `%${escapedQuery}%`;

    const { data: profileRows, error: searchError } = await adminClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, deleted_at, is_public")
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
      .eq("is_public", true)
      .is("deleted_at", null)
      .limit(limit);

    if (searchError) {
      console.error(
        "[api/users/search] profiles SELECT failed:",
        searchError.message
      );
      return jsonResponse(
        { error: "Search failed. Please try again." },
        500
      );
    }

    const profiles = (profileRows as Array<{
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      deleted_at: string | null;
      is_public: boolean;
    }>) ?? [];

    // Fetch the caller's following set (for isFollowing enrichment).
    const callerFollowingSet = new Set<string>();
    if (callerUid) {
      const { data: callerFollowingRows } = await adminClient
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

    const data: APIUser[] = profiles.map((p) => ({
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      isFollowing: callerFollowingSet.has(p.id)
    }));

    return jsonResponse({ data } satisfies SearchResponse);
  } catch (err) {
    console.error("[api/users/search] Unexpected error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

export async function POST(): Promise<Response> {
  return jsonResponse(
    { error: "POST not supported. Use GET /api/users/search?q=." },
    405
  );
}
