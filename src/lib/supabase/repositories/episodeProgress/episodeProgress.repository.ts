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
  markEpisodeCompleted,
  upsertEpisodeProgress
} from "./episodeProgress.write";
import type {
  EpisodeProgressListResult,
  EpisodeProgressResult,
  EpisodeProgressRow,
  EpisodeProgressWriteResult,
  UpsertEpisodeProgressPayload
} from "./episodeProgress.types";

export class EpisodeProgressRepository {
  private readonly supabase: TypedSupabaseClient;

  constructor(client: TypedSupabaseClient = getClient()) {
    this.supabase = client;
  }

  // ---- Reads ----

  getEpisodeProgressForVaultItem(vaultId: string): Promise<EpisodeProgressListResult<EpisodeProgressRow>> {
    return getEpisodeProgressForVaultItem(this.supabase, vaultId);
  }

  getLatestEpisodeProgress(vaultId: string): Promise<EpisodeProgressResult<EpisodeProgressRow>> {
    return getLatestEpisodeProgress(this.supabase, vaultId);
  }

  getLatestEpisodeProgressBatch(
    vaultIds: string[]
  ): Promise<{ data: Map<string, EpisodeProgressRow>; error: Error | null }> {
    return getLatestEpisodeProgressBatch(this.supabase, vaultIds);
  }

  getCompletedEpisodeCount(vaultId: string): Promise<{ count: number; error: Error | null }> {
    return getCompletedEpisodeCount(this.supabase, vaultId);
  }

  // ---- Writes ----

  upsertEpisodeProgress(payload: UpsertEpisodeProgressPayload): Promise<EpisodeProgressResult<EpisodeProgressRow>> {
    return upsertEpisodeProgress(this.supabase, payload);
  }

  markEpisodeCompleted(
    vaultId: string,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<EpisodeProgressWriteResult> {
    return markEpisodeCompleted(this.supabase, vaultId, seasonNumber, episodeNumber);
  }

  clearEpisodeProgress(vaultId: string): Promise<EpisodeProgressWriteResult> {
    return clearEpisodeProgress(this.supabase, vaultId);
  }
}

// ---- Singleton ----

let _defaultInstance: EpisodeProgressRepository | null = null;

export function getEpisodeProgressRepository(): EpisodeProgressRepository {
  if (typeof window === "undefined") return new EpisodeProgressRepository();
  if (!_defaultInstance) _defaultInstance = new EpisodeProgressRepository();
  return _defaultInstance;
}
