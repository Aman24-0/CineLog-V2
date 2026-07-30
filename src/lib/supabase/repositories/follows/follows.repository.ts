/**
 * CineLog V2 — Follows Repository
 * ---------------------------------------------------------------------
 * Stateless, side-effect-free functions over the `follows` table. Each
 * function takes a typed Supabase client as its first argument so it
 * can be unit-tested with a mock client.
 *
 * RLS compliance
 * --------------
 *   • SELECT — `follows_read` policy allows any authenticated user to
 *     read the entire social graph (follows are public).
 *   • INSERT — `follows_insert` policy requires `auth.uid() = follower_id`.
 *   • DELETE — `follows_delete` policy requires `auth.uid() = follower_id`.
 *
 * Self-follow is blocked at the DB level via a CHECK constraint
 * (`follows_no_self_follow`), but we also guard here for clearer
 * client-side error messages.
 *
 * The repository is intentionally small — the social-graph surface is
 * follow / unfollow / list / count. Listing followers-of-X with their
 * profile rows joined in is supported via `getFollowers` which returns
 * just the follower ids; the caller can then bulk-fetch profiles via
 * the ProfileRepository if needed.
 */

import type {
  FollowResult,
  FollowWriteResult,
  FollowRow,
  FollowCounts,
  TypedSupabaseClient
} from "./follows.types";
import { toError } from "../shared";

// ---------------------------------------------------------------------------
// Table name constant
// ---------------------------------------------------------------------------

const FOLLOWS_TABLE = "follows" as const;

// ---------------------------------------------------------------------------
// Writes — follow / unfollow
// ---------------------------------------------------------------------------

/**
 * Create a follow edge: `followerId` follows `followingId`.
 *
 * Idempotent — if the edge already exists, the UNIQUE(follower_id,
 * following_id) constraint fires a 23505 error which we normalise to
 * a no-op success (the caller's intent — "I follow this user" — is
 * already true).
 *
 * Self-follow is rejected client-side with a clear error before
 * hitting the DB (the DB also blocks it via CHECK constraint).
 *
 * RLS: requires `auth.uid() = followerId`.
 */
export async function followUser(
  supabase: TypedSupabaseClient,
  followerId: string,
  followingId: string
): Promise<FollowWriteResult> {
  if (followerId === followingId) {
    return {
      error: new Error(
        "[FollowsRepository] Cannot follow yourself (self-follow is not allowed)."
      )
    };
  }

  const { error } = await supabase
    .from(FOLLOWS_TABLE)
    .insert({ follower_id: followerId, following_id: followingId });

  if (error) {
    // Postgres unique-violation code 23505 — the follow edge already
    // exists. Treat as success (idempotent follow).
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return { error: null };
    }
    return { error: toError(error) };
  }
  return { error: null };
}

/**
 * Remove a follow edge: `followerId` unfollows `followingId`.
 *
 * Idempotent — if the edge doesn't exist, the DELETE affects 0 rows
 * and we return success (the caller's intent — "I don't follow this
 * user" — is already true).
 *
 * RLS: requires `auth.uid() = followerId`.
 */
export async function unfollowUser(
  supabase: TypedSupabaseClient,
  followerId: string,
  followingId: string
): Promise<FollowWriteResult> {
  const { error } = await supabase
    .from(FOLLOWS_TABLE)
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);

  return { error: toError(error) };
}

// ---------------------------------------------------------------------------
// Reads — list followers / following
// ---------------------------------------------------------------------------

/**
 * Get the user ids of everyone following `userId` (the user's
 * "followers" list).
 *
 * Returns a `FollowRow[]` so the caller also has the `created_at` of
 * each follow edge if they want to display "followed you 2 days ago".
 * The `follower_id` field on each row is the user id of the follower.
 *
 * RLS: any authenticated user can read (follows are public).
 */
export async function getFollowers(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<FollowResult<FollowRow[]>> {
  const { data, error } = await supabase
    .from(FOLLOWS_TABLE)
    .select("*")
    .eq("following_id", userId)
    .order("created_at", { ascending: false });

  return { data: data ?? [], error: toError(error) };
}

/**
 * Get the user ids of everyone `userId` is following (the user's
 * "following" list).
 *
 * The `following_id` field on each row is the user id of the followed
 * account.
 *
 * RLS: any authenticated user can read (follows are public).
 */
export async function getFollowing(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<FollowResult<FollowRow[]>> {
  const { data, error } = await supabase
    .from(FOLLOWS_TABLE)
    .select("*")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false });

  return { data: data ?? [], error: toError(error) };
}

/**
 * Get the follower + following counts for `userId` in a single round
 * trip (uses `head: true` with `count: "exact"` on two queries run in
 * parallel).
 *
 * Always returns `{ followers, following }` with numbers (never null).
 * On error, both counts are 0 and `error` is set — the UI can still
 * render the empty state.
 */
export async function getFollowCounts(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<FollowResult<FollowCounts>> {
  try {
    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from(FOLLOWS_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("following_id", userId),
      supabase
        .from(FOLLOWS_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("follower_id", userId)
    ]);

    const err = followersRes.error ?? followingRes.error;
    if (err) {
      return { data: { followers: 0, following: 0 }, error: toError(err) };
    }

    return {
      data: {
        followers: followersRes.count ?? 0,
        following: followingRes.count ?? 0
      },
      error: null
    };
  } catch (err) {
    return {
      data: { followers: 0, following: 0 },
      error: toError(err)
    };
  }
}

/**
 * Check whether `followerId` is currently following `followingId`.
 *
 * Cheap existence check — uses `head: true` with a `single()` shape.
 * Returns a boolean (false on error — the safer default for the UI
 * which would otherwise show a "Follow" button when in doubt).
 */
export async function isFollowing(
  supabase: TypedSupabaseClient,
  followerId: string,
  followingId: string
): Promise<FollowResult<boolean>> {
  const { data, error } = await supabase
    .from(FOLLOWS_TABLE)
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();

  if (error) {
    return { data: false, error: toError(error) };
  }
  return { data: data !== null, error: null };
}
