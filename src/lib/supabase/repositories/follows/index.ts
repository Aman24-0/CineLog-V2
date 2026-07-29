/**
 * CineLog V2 — Follows Repository (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the Supabase Follows Repository. Application code
 * should import from here (or from the parent `repositories/index.ts`).
 */

export {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowCounts,
  isFollowing,
} from "./follows.repository";

export type {
  FollowRow,
  FollowCounts,
  FollowResult,
  FollowWriteResult,
  TypedSupabaseClient,
} from "./follows.types";
