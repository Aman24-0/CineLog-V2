/**
 * CineLog V2 — Follows Repository: Types
 * ---------------------------------------------------------------------
 * Type definitions for the social-graph `follows` table. Lightweight
 * compared to the profile / vault repositories — the table only has
 * four columns and the API surface is intentionally small (follow,
 * unfollow, list followers / following, count).
 */

import type { Database, Tables } from "../../database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A single row from the `follows` table. */
export type FollowRow = Tables<"follows">;

/** Typed Supabase client generic over the CineLog `Database` schema. */
export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Aggregated follower / following counts for a single user.
 *
 * Returned by {@link getFollowCounts}. Both fields are `number` (never
 * `null`) — a user with no social activity returns `{ followers: 0,
 * following: 0 }`.
 */
export interface FollowCounts {
  followers: number;
  following: number;
}

/**
 * Result of a read operation. `data` is `null` on error or when no rows
 * match (for single-row reads). Errors are normalised into a plain
 * `Error` instance via `toError()`.
 */
export interface FollowResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
}

/**
 * Result of a write operation with no meaningful return value (insert
 * / delete). `error` is `null` on success.
 */
export interface FollowWriteResult {
  readonly error: Error | null;
}
