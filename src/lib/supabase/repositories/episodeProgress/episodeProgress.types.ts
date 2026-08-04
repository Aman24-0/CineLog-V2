/**
 * CineLog V2 — Episode Progress Repository: Shared Types
 * ---------------------------------------------------------------------
 * Type definitions for the `episode_progress` table (Database Bible §06).
 * Stores per-episode progress for TV Shows and Anime. Movies never use
 * this table.
 *
 * UNIQUE(vault_id, season_number, episode_number) — one record per
 * episode per vault item. Supports UPSERT (INSERT ... ON CONFLICT).
 */

import type {
  Tables,
  TablesInsert,
  TablesUpdate,
  Database
} from "../../database.types";

// ---------------------------------------------------------------------------
// Row / Insert / Update aliases
// ---------------------------------------------------------------------------

export type EpisodeProgressRow = Tables<"episode_progress">;
export type EpisodeProgressInsert = TablesInsert<"episode_progress">;
export type EpisodeProgressUpdate = TablesUpdate<"episode_progress">;

// ---------------------------------------------------------------------------
// Input payload types
// ---------------------------------------------------------------------------

/**
 * Payload for upserting an episode progress record.
 * `vaultId` is the vault row's UUID (NOT tmdb_id).
 */
export interface UpsertEpisodeProgressPayload {
  readonly vaultId: string;
  readonly seasonNumber: number;
  readonly episodeNumber: number;
  readonly isCompleted?: boolean;
  readonly progressMinutes?: number;
  readonly watchedAt?: string | null;
  /**
   * Phase 6 Task 2 — per-episode rating (1-10 or 1-5, depending on
   * the user's ratingScale preference). NULL/undefined means "no
   * rating" (the default). The app validates the range before
   * passing it here — the DB column has no CHECK constraint.
   */
  readonly rating?: number | null;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface EpisodeProgressResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
}

export interface EpisodeProgressListResult<T> {
  readonly data: T[];
  readonly error: Error | null;
}

export interface EpisodeProgressWriteResult {
  readonly error: Error | null;
}

// ---------------------------------------------------------------------------
// Typed Supabase client
// ---------------------------------------------------------------------------

export type TypedSupabaseClient =
  import("@supabase/supabase-js").SupabaseClient<Database>;
