/**
 * CineLog V2 — Episode Progress Repository
 * ---------------------------------------------------------------------
 * Composes read + write modules into a single class. The SOLE data-access
 * layer for the `episode_progress` table (Database Bible §06).
 *
 * Pattern: Component → Hook → Adapter → EpisodeProgressRepository → Supabase
 */

import { getClient } from "../../client";
import type { TypedSupabaseClient } from "./episodeProgress.types";
import {
  getCompletedEpisodeCount,
  getEpisodeProgressForVaultItem,
  getLatestEpisodeProgress,
  getLatestEpisodeProgressBatch
} from "./episodeProgress.read";
import {
  clearEpisodeProgress,
  deleteEpisodeProgressFrom,
  markEpisodeCompleted,
  updateEpisodeFeedback,
  updateEpisodeRating,
  updateEpisodeReaction,
  upsertEpisodeProgress
} from "./episodeProgress.write";
import type {
  EpisodeProgressListResult,
  EpisodeProgressResult,
  EpisodeProgressRow,
  EpisodeProgressWriteResult,
  EpisodeReaction,
  UpsertEpisodeProgressPayload
} from "./episodeProgress.types";

export class EpisodeProgressRepository {
  private readonly supabase: TypedSupabaseClient;

  constructor(client: TypedSupabaseClient = getClient()) {
    this.supabase = client;
  }

  // ---- Reads ----

  getEpisodeProgressForVaultItem(
    vaultId: string
  ): Promise<EpisodeProgressListResult<EpisodeProgressRow>> {
    return getEpisodeProgressForVaultItem(this.supabase, vaultId);
  }

  getLatestEpisodeProgress(
    vaultId: string
  ): Promise<EpisodeProgressResult<EpisodeProgressRow>> {
    return getLatestEpisodeProgress(this.supabase, vaultId);
  }

  getLatestEpisodeProgressBatch(
    vaultIds: string[]
  ): Promise<{ data: Map<string, EpisodeProgressRow>; error: Error | null }> {
    return getLatestEpisodeProgressBatch(this.supabase, vaultIds);
  }

  getCompletedEpisodeCount(
    vaultId: string
  ): Promise<{ count: number; error: Error | null }> {
    return getCompletedEpisodeCount(this.supabase, vaultId);
  }

  // ---- Writes ----

  upsertEpisodeProgress(
    payload: UpsertEpisodeProgressPayload
  ): Promise<EpisodeProgressResult<EpisodeProgressRow>> {
    return upsertEpisodeProgress(this.supabase, payload);
  }

  markEpisodeCompleted(
    vaultId: string,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<EpisodeProgressWriteResult> {
    return markEpisodeCompleted(
      this.supabase,
      vaultId,
      seasonNumber,
      episodeNumber
    );
  }

  clearEpisodeProgress(vaultId: string): Promise<EpisodeProgressWriteResult> {
    return clearEpisodeProgress(this.supabase, vaultId);
  }

  /**
   * Delete all episode_progress records for this vault item at or
   * after the given (season, episode) position. Used by the
   * bidirectional episode toggle's unmark path. See
   * `episodeProgress.write.ts` for the full predicate + rationale.
   */
  deleteEpisodeProgressFrom(
    vaultId: string,
    fromSeason: number,
    fromEpisode: number
  ): Promise<EpisodeProgressWriteResult> {
    return deleteEpisodeProgressFrom(
      this.supabase,
      vaultId,
      fromSeason,
      fromEpisode
    );
  }

  /**
   * Phase 6 Task 2 — Set the rating on a specific episode_progress
   * record, creating the row if it doesn't exist. See
   * `episodeProgress.write.ts` for the full rationale (two-step
   * upsert: UPDATE first, INSERT with watched-episode defaults if
   * zero rows were affected).
   *
   * Pass `null` to clear the rating on an existing row.
   */
  updateEpisodeRating(
    vaultId: string,
    seasonNumber: number,
    episodeNumber: number,
    rating: number | null
  ): Promise<EpisodeProgressWriteResult> {
    return updateEpisodeRating(
      this.supabase,
      vaultId,
      seasonNumber,
      episodeNumber,
      rating
    );
  }

  updateEpisodeReaction(
    vaultId: string,
    seasonNumber: number,
    episodeNumber: number,
    reaction: EpisodeReaction | null
  ): Promise<EpisodeProgressWriteResult> {
    return updateEpisodeReaction(
      this.supabase,
      vaultId,
      seasonNumber,
      episodeNumber,
      reaction
    );
  }

  updateEpisodeFeedback(
    vaultId: string,
    seasonNumber: number,
    episodeNumber: number,
    rating: number | null,
    reaction: EpisodeReaction | null
  ): Promise<EpisodeProgressWriteResult> {
    return updateEpisodeFeedback(
      this.supabase,
      vaultId,
      seasonNumber,
      episodeNumber,
      { rating, reaction }
    );
  }
}

// ---- Singleton ----

let _defaultInstance: EpisodeProgressRepository | null = null;

export function getEpisodeProgressRepository(): EpisodeProgressRepository {
  if (typeof window === "undefined") return new EpisodeProgressRepository();
  if (!_defaultInstance) _defaultInstance = new EpisodeProgressRepository();
  return _defaultInstance;
}
