/**
 * CineLog V2 — Episode Progress Repository: Internal Helpers
 * ---------------------------------------------------------------------
 * Validation + payload mapping.
 */

import type {
  EpisodeProgressInsert,
  EpisodeProgressUpdate,
  TypedSupabaseClient,
  UpsertEpisodeProgressPayload
} from "./episodeProgress.types";
import { getClient } from "../../client";

/**
 * Map an `UpsertEpisodeProgressPayload` to the snake-case
 * `EpisodeProgressInsert` shape.
 */
export function toInsert(
  payload: UpsertEpisodeProgressPayload
): EpisodeProgressInsert {
  const insert: EpisodeProgressInsert = {
    vault_id: payload.vaultId,
    season_number: payload.seasonNumber,
    episode_number: payload.episodeNumber,
    is_completed: payload.isCompleted ?? false,
    progress_minutes: payload.progressMinutes ?? 0,
    watched_at: payload.watchedAt ?? new Date().toISOString()
  };

  // Keep the historical utility contract: omitted feedback fields are
  // represented as NULL in this standalone mapping helper. The repository
  // strips those keys before a real progress upsert so existing feedback is
  // not overwritten by a watch-state write.
  insert.rating = payload.rating ?? null;
  insert.reaction = payload.reaction ?? null;
  return insert;
}

/**
 * Build an `EpisodeProgressUpdate` for marking an episode completed.
 */
export function toCompletedUpdate(): EpisodeProgressUpdate {
  return {
    is_completed: true,
    watched_at: new Date().toISOString()
  };
}

/**
 * Re-export the TypedSupabaseClient type for convenience.
 */
export type { TypedSupabaseClient } from "./episodeProgress.types";

/**
 * Convenience: resolve the environment-aware client.
 */
export function resolveClient(
  client?: TypedSupabaseClient
): TypedSupabaseClient {
  return client ?? getClient();
}

// Re-export toError from shared (eliminates duplicate)
export { toError } from "../shared";
