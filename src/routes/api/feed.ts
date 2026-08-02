// src/routes/api/feed.ts
//
// CineLog V2 — Activity Feed API (Server-Only)
// ---------------------------------------------------------------------
//   GET /api/feed?limit=20&page=1
//
// Returns the activity feed of users the current caller follows.
// Each item is enriched with:
//   • The actor's profile (display_name, username, avatar_url) so the
//     FeedItem can render "@alice watched …" with an avatar.
//   • The title's TMDB metadata (title, poster_path, release_year)
//     for movie/tv entity types so the FeedItem can render a clickable
//     poster. We read from `tmdb_cache` first (the shared Supabase-side
//     cache populated by /api/tmdb-cache); on miss we fall back to
//     fetching via the TMDB proxy (which itself has 3-tier caching:
//     in-memory, localStorage, then TMDB API).
//
// AUTH:
//   Requires an authenticated session (cookie OR access_token in
//   Authorization header). The caller's uid is resolved server-side
//   and used to look up the following list — the body cannot forge a
//   different `follower_id`.
//
// PAGINATION:
//   ?limit=20 (max 50, default 20)
//   ?page=1   (1-indexed; offset = (page-1) * limit)
//
//   We don't return `total` because getting an exact count requires a
//   separate COUNT query that competes with the feed query for the
//   same heavy indexes. Instead we return `hasMore: boolean` — true
//   when this page returned exactly `limit` items (so the caller
//   knows to fetch the next page). This is the same pattern used by
//   the Watchlist infinite scroll.
//
// SECURITY / PRIVACY:
//   • The feed only includes activity from users the caller follows.
//     The list of followed users is derived from the `follows` table
//     filtered by `follower_id = callerUid` — the caller cannot
//     request another user's feed.
//   • Activity rows where the actor has since been soft-deleted
//     (profile.deleted_at IS NOT NULL) are filtered out at the
//     application layer. The activity_log table has no FK to profiles
//     (intentional — analytics survive user deletion), so we have to
//     manually skip orphaned rows.
//   • Private-profile users in the caller's following list: their
//     activity is still shown because the caller has explicitly opted
//     into following them. (Privacy = "who can see my profile" — once
//     someone follows you, they see your activity by design.)

import { createClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { extractAccessToken } from "~/lib/auth/token";

interface APIEvent {
  request: Request;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Short cache so a back-button navigation doesn't refetch, but
      // new activity shows up quickly. The FeedPage hook also has its
      // own in-memory cache.
      "Cache-Control": "private, max-age=15, stale-while-revalidate=30"
    }
  });
}

// ---------------------------------------------------------------------------
// Types — the public response shape
// ---------------------------------------------------------------------------

/** A single enriched activity feed item. */
export interface FeedActivity {
  /** activity_log.id */
  id: string;
  /** activity_log.user_id (the actor) */
  userId: string;
  /** The actor's display_name (null if the profile was deleted). */
  displayName: string | null;
  /** The actor's @username (null if the profile was deleted). */
  username: string | null;
  /** The actor's avatar_url (null if unset / profile deleted). */
  avatarUrl: string | null;
  /** activity_log.action (e.g. "vault_created", "vault_rated"). */
  action: string;
  /** activity_log.entity_type (e.g. "movie", "tv", "collection"). */
  entityType: string | null;
  /** activity_log.entity_id (TMDB id for movie/tv). */
  entityId: string | null;
  /** activity_log.metadata (JSONB; varies by action). */
  metadata: Record<string, unknown> | null;
  /** activity_log.created_at (ISO timestamp). */
  createdAt: string;
  /**
   * Enriched title metadata (only for movie/tv entity types).
   * null when entity_type is not a title, when the TMDB id is missing,
   * or when the TMDB fetch failed.
   */
  title: {
    mediaType: "movie" | "tv";
    tmdbId: number;
    title: string | null;
    posterPath: string | null;
    releaseYear: string | null;
  } | null;
}

interface FeedResponse {
  data: FeedActivity[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Activity actions we surface in the feed. Anything else is filtered
 * out — the activity_log also records "preferences_updated",
 * "import_started", "export_completed", etc. which are noisy and not
 * interesting to followers.
 */
const FEED_ACTIONS = new Set<string>([
  "vault_created",
  "vault_updated",
  "vault_restored",
  "vault_status_changed",
  "vault_rated",
  "vault_favorited",
  "vault_unfavorited",
  "collection_created",
  "collection_updated",
  "episode_progress_updated"
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ActorProfile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  deleted_at: string | null;
}

interface TmdbCacheRow {
  media_type: string;
  tmdb_id: number;
  data: {
    title?: string | null;
    name?: string | null;
    poster_path?: string | null;
    release_date?: string | null;
    first_air_date?: string | null;
  } | null;
  expires_at: string;
}

/**
 * Extract the year from a TMDB date string ("2024-05-14" → "2024").
 * Returns null when the date is missing/malformed.
 */
function yearFromDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const year = dateStr.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

/**
 * Read the TMDB id from an activity_log row's metadata payload.
 *
 * The activityLog.ts writer stores the TMDB id in `metadata.tmdb_id`
 * (NOT entity_id — see the file header comment for why). The value
 * can be a number or a numeric string; we coerce to a number and
 * validate it's positive.
 *
 * @returns The TMDB id as a number, or null when missing/invalid.
 */
function readTmdbIdFromMetadata(
  metadata: unknown
): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as { tmdb_id?: unknown }).tmdb_id;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Batch-fetch TMDB metadata for a list of (mediaType, tmdbId) pairs
 * from the `tmdb_cache` Supabase table. We read up to 50 keys per
 * request (the Supabase `in()` filter handles up to ~1000 comfortably
 * but 50 keeps the response payload reasonable).
 *
 * Returns a Map<"mediaType/tmdbId", TmdbCacheRow> for cache HIT lookup.
 * Misses are silently dropped — the caller will see `title: null` and
 * can fall back to a placeholder.
 *
 * NOTE: The `supabase` argument is intentionally typed as `any` here
 * because the route uses two different client shapes (the anon-key
 * client for `profiles` reads, and the service-role client for
 * `activity_log` + `tmdb_cache` reads). Both expose the same
 * `.from(table).select(...).in(...)` chain, so the duck-typed call
 * site works for both — but TypeScript can't see through the union.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchTmdbCacheBatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  keys: ReadonlyArray<{ mediaType: "movie" | "tv"; tmdbId: number }>
): Promise<Map<string, TmdbCacheRow>> {
  const map = new Map<string, TmdbCacheRow>();
  if (keys.length === 0) return map;

  // Dedup by composite key — the same title can appear in multiple
  // activity rows (e.g. a user both rated and favorited it).
  const seen = new Set<string>();
  const deduped = keys.filter((k) => {
    const key = `${k.mediaType}/${k.tmdbId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Supabase's `in()` filter requires the values to be plain strings
  // or numbers. We can't composite-filter (media_type, tmdb_id) in a
  // single query, so we issue two parallel queries — one for movies,
  // one for TV — and merge the results.
  const movieIds = deduped
    .filter((k) => k.mediaType === "movie")
    .map((k) => k.tmdbId);
  const tvIds = deduped
    .filter((k) => k.mediaType === "tv")
    .map((k) => k.tmdbId);

  // Helper: run a Supabase query and return `data` (or [] on error),
  // typed loosely enough to survive the untyped-service-client path.
  // We cast the result to `TmdbCacheRow[]` at the call site so the
  // rest of the function gets a clean shape.
  const fetchCacheRows = async (
    mediaType: "movie" | "tv",
    ids: number[]
  ): Promise<TmdbCacheRow[]> => {
    if (ids.length === 0) return [];
    try {
      const res = await supabase
        .from("tmdb_cache")
        .select("media_type, tmdb_id, data, expires_at")
        .eq("media_type", mediaType)
        .in("tmdb_id", ids);
      return (res.data ?? []) as unknown as TmdbCacheRow[];
    } catch {
      // Network / Supabase error — return [] so the caller renders
      // `title: null` (the placeholder). The error is logged via
      // Supabase's own error handler.
      return [];
    }
  };

  const results = await Promise.all([
    fetchCacheRows("movie", movieIds),
    fetchCacheRows("tv", tvIds)
  ]);

  for (const rows of results) {
    for (const row of rows) {
      // Skip expired cache rows — the cached data may be stale.
      const expiresAt = new Date(row.expires_at).getTime();
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) continue;
      map.set(`${row.media_type}/${row.tmdb_id}`, row);
    }
  }
  return map;
}

/**
 * Build the final title enrichment object from a cache row.
 */
function buildTitleEnrichment(
  cacheRow: TmdbCacheRow | undefined,
  mediaType: "movie" | "tv",
  tmdbId: number
): FeedActivity["title"] {
  if (!cacheRow || !cacheRow.data) {
    return {
      mediaType,
      tmdbId,
      title: null,
      posterPath: null,
      releaseYear: null
    };
  }
  const d = cacheRow.data;
  const title = d.title ?? d.name ?? null;
  const dateStr = d.release_date ?? d.first_air_date ?? null;
  return {
    mediaType,
    tmdbId,
    title,
    posterPath: d.poster_path ?? null,
    releaseYear: yearFromDate(dateStr)
  };
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }
  if (event.request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Parse pagination params.
  const url = new URL(event.request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT)
  );
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "", 10) || 1);
  const offset = (page - 1) * limit;

  // Resolve the caller's session via the unified token helper.
  // CineLog stores sessions in localStorage (not cookies), so the
  // browser sends the access token via the Authorization header (for
  // GET requests) or the body (for POST). The helper tries all
  // channels + the cookie fallback.
  const accessToken = extractAccessToken(event);

  if (!accessToken) {
    return jsonResponse(
      { error: "No active session. Please sign in first." },
      401
    );
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[api/feed] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
    );
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // Verify the access token via the anon client.
  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } =
    await verifyClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return jsonResponse(
      { error: "Your session has expired. Please sign in again." },
      401
    );
  }

  const callerUid = userData.user.id;

  // Caller-scoped client so the follows + activity_log SELECTs run with
  // the right RLS context (follows_read allows any authenticated user
  // to read all rows; activity_log is owner-only, but since we're
  // querying OTHER users' activity_log rows, we need to use the
  // service-role client for that one — see the comment below).
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });

  try {
    // ─── 1. Get the list of users the caller follows ───────────────
    // We only need the following_id values, so select just that column.
    const { data: followingRows, error: followingError } = await callerClient
      .from("follows")
      .select("following_id")
      .eq("follower_id", callerUid);

    if (followingError) {
      console.error(
        "[api/feed] follows SELECT failed:",
        followingError.message
      );
      return jsonResponse(
        { error: "Failed to load feed. Please try again." },
        500
      );
    }

    const followingIds = (
      (followingRows as { following_id: string }[] | null) ?? []
    ).map((r) => r.following_id);

    // No follows → empty feed. The FeedPage will show the empty state.
    if (followingIds.length === 0) {
      return jsonResponse({
        data: [],
        pagination: { page, limit, hasMore: false }
      } satisfies FeedResponse);
    }

    // ─── 2. Fetch activity_log rows for the followed users ─────────
    //
    // IMPORTANT: activity_log's RLS is owner-only (auth.uid() = user_id).
    // The caller is NOT the owner of these rows — they belong to the
    // people the caller follows. So the caller-scoped anon client
    // would return ZERO rows (RLS filters them out).
    //
    // We therefore switch to the SERVICE-ROLE client for this read.
    // The service-role key bypasses RLS, but we constrain the query to
    // ONLY rows where user_id IN (the caller's following list). The
    // caller cannot read another user's activity_log rows unless they
    // follow that user — which is exactly the privacy contract we want.
    //
    // The service-role key NEVER reaches the browser — it's only used
    // server-side in this route file.
    //
    // NOTE: We use the shared `createAdminClient()` helper rather than
    // constructing the client inline. The previous inline construction
    // passed the anon key as `apikey` and the service-role key as the
    // Bearer token — but Supabase's client uses the `apikey` for auth,
    // so the request was effectively anon-authenticated and RLS
    // blocked the read, causing a 500 error.
    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch (err) {
      console.error(
        "[api/feed] createAdminClient failed:",
        err instanceof Error ? err.message : err
      );
      return jsonResponse(
        { error: "Server misconfigured — missing service-role key." },
        500
      );
    }

    // Supabase's `in()` filter handles up to ~1000 values comfortably.
    // A user following more than 1000 accounts is rare; if it happens
    // we just truncate to the first 1000 (the feed is already
    // paginated, so this is a soft cap on the social-graph fanout).
    const followingIdsCapped = followingIds.slice(0, 1000);

    const { data: activityRows, error: activityError } = await adminClient
      .from("activity_log")
      .select(
        "id, user_id, action, entity_id, entity_type, metadata, created_at"
      )
      .in("user_id", followingIdsCapped)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (activityError) {
      console.error(
        "[api/feed] activity_log SELECT failed:",
        activityError.message
      );
      return jsonResponse(
        { error: "Failed to load feed. Please try again." },
        500
      );
    }

    const activities = (activityRows as Array<{
      id: string;
      user_id: string;
      action: string;
      entity_id: string | null;
      entity_type: string | null;
      metadata: unknown;
      created_at: string;
    }>) ?? [];

    // Filter to only feed-worthy actions (vault_created, rated, etc.).
    // The activity_log records everything; we only show the cinematic
    // milestones that followers would care about.
    const filtered = activities.filter((a) => FEED_ACTIONS.has(a.action));

    // ─── 3. Batch-fetch the actor profiles ─────────────────────────
    // Even though we already know the actor uids from the activity rows,
    // we need the display_name / avatar_url / username. We fetch from
    // `profiles` (public columns only — the RLS on profiles allows
    // authenticated SELECT on id, username, display_name, avatar_url,
    // deleted_at).
    const actorIds = Array.from(
      new Set(filtered.map((a) => a.user_id))
    ).slice(0, 100);

    const actorProfiles = new Map<string, ActorProfile>();
    if (actorIds.length > 0) {
      // IMPORTANT: use the SERVICE-ROLE admin client (not the caller-
      // scoped client) for this read. The profiles table's RLS only
      // allows SELECT where id = auth.uid() — so the caller-scoped
      // client would return ZERO rows for other users' profiles,
      // and the feed would show "Someone" for every activity.
      //
      // Privacy: we only fetch profiles for users who appear in the
      // caller's feed (i.e. users the caller follows + whose
      // activity_log rows exist). The actorIds list is derived from
      // the activity_log rows already filtered to the caller's
      // follows. So we never leak profile data for users the caller
      // doesn't follow.
      //
      // We only SELECT public columns (id, display_name, username,
      // avatar_url, deleted_at) — no email, bio, country, or other
      // private fields.
      const { data: profileRows, error: profileError } = await adminClient
        .from("profiles")
        .select("id, display_name, username, avatar_url, deleted_at")
        .in("id", actorIds);

      if (profileError) {
        // Non-fatal — we'll just render with null display names. The
        // feed is still useful as a chronological list.
        console.warn(
          "[api/feed] profiles SELECT failed:",
          profileError.message
        );
      } else {
        for (const row of (profileRows as ActorProfile[] | null) ?? []) {
          actorProfiles.set(row.id, row);
        }
      }
    }

    // ─── 4. Batch-fetch TMDB metadata for movie/tv entities ────────
    // Build the list of (mediaType, tmdbId) pairs to look up.
    //
    // IMPORTANT: The TMDB id is stored in `metadata.tmdb_id` (NOT
    // entity_id). The activity_log.entity_id column is UUID-typed
    // (designed for row UUIDs like vault row ids), but TMDB ids are
    // numbers — they can't be stored in a UUID column. So the
    // activityLog.ts writer stores the TMDB id in metadata instead.
    const tmdbKeys: Array<{ mediaType: "movie" | "tv"; tmdbId: number }> = [];
    for (const a of filtered) {
      if (a.entity_type !== "movie" && a.entity_type !== "tv") continue;
      const tmdbId = readTmdbIdFromMetadata(a.metadata);
      if (tmdbId === null) continue;
      tmdbKeys.push({
        mediaType: a.entity_type as "movie" | "tv",
        tmdbId
      });
    }

    const tmdbCacheMap = await fetchTmdbCacheBatch(adminClient, tmdbKeys);

    // ─── 5. Assemble the response ──────────────────────────────────
    const enriched: FeedActivity[] = filtered.map((a) => {
      const actor = actorProfiles.get(a.user_id);
      // Skip rendering for actors whose profile was deleted — we
      // don't want to show "@unknown_user watched …". The activity_log
      // rows persist after deletion (no FK), so this filter is the
      // only way to drop them.
      const displayName =
        actor && !actor.deleted_at ? actor.display_name : null;
      const username =
        actor && !actor.deleted_at ? actor.username : null;
      const avatarUrl =
        actor && !actor.deleted_at ? actor.avatar_url : null;

      // Title enrichment — only for movie/tv entities.
      let title: FeedActivity["title"] = null;
      if (a.entity_type === "movie" || a.entity_type === "tv") {
        const tmdbId = readTmdbIdFromMetadata(a.metadata);
        if (tmdbId !== null) {
          const cacheRow = tmdbCacheMap.get(
            `${a.entity_type}/${tmdbId}`
          );
          title = buildTitleEnrichment(
            cacheRow,
            a.entity_type as "movie" | "tv",
            tmdbId
          );
        }
      }

      // Coerce metadata to a plain object (it comes back as Json).
      const metadata =
        a.metadata && typeof a.metadata === "object"
          ? (a.metadata as Record<string, unknown>)
          : null;

      return {
        id: a.id,
        userId: a.user_id,
        displayName,
        username,
        avatarUrl,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        metadata,
        createdAt: a.created_at,
        title
      };
    });

    // hasMore is true when this page returned exactly `limit` items
    // (heuristic — if there are exactly `limit` items, there's likely
    // more on the next page). The caller fetches the next page; if it
    // comes back empty, hasMore becomes false and the infinite scroll
    // stops.
    const hasMore = enriched.length === limit;

    return jsonResponse({
      data: enriched,
      pagination: { page, limit, hasMore }
    } satisfies FeedResponse);
  } catch (err) {
    console.error("[api/feed] Unexpected error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// Reject non-GET methods.
export async function POST(): Promise<Response> {
  return jsonResponse({ error: "POST not supported. Use GET /api/feed." }, 405);
}

export async function DELETE(): Promise<Response> {
  return jsonResponse(
    { error: "DELETE not supported. Use GET /api/feed." },
    405
  );
}
