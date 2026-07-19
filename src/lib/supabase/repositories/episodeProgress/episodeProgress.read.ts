/**
 * CineLog V2 — Episode Progress Repository: Read Operations
 * ---------------------------------------------------------------------
 * READ-ONLY queries over the `episode_progress` table.
 *
 * RLS compliance (Database Bible §90): owner only (through vault
 * ownership). Never uses the service role key.
 */

import type {
  EpisodeProgressListResult,
  EpisodeProgressResult,
  EpisodeProgressRow,
  TypedSupabaseClient
} from "./episodeProgress.types";
import { toError } from "./episodeProgress.utils";

const TABLE = "episode_progress" as const;

/**
 * Get all episode progress records for a vault item, ordered by
 * `watched_at` desc (most recently watched first).
 */
export async function getEpisodeProgressForVaultItem(
  supabase: TypedSupabaseClient,
  vaultId: string
): Promise<EpisodeProgressListResult<EpisodeProgressRow>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select()
    .eq("vault_id", vaultId)
    .order("watched_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  return { data: data ?? [], error: toError(error) };
}

/**
 * Get the LATEST episode progress record for a vault item — the most
 * recently watched episode. Used to determine the "current position"
 * (season/episode) for Continue Watching and the progress engine.
 *
 * Returns `{ data: null, error: null }` if no progress records exist.
 */
export async function getLatestEpisodeProgress(
  supabase: TypedSupabaseClient,
  vaultId: string
): Promise<EpisodeProgressResult<EpisodeProgressRow>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select()
    .eq("vault_id", vaultId)
    .order("watched_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error: toError(error) };
}

/**
 * Batch-fetch the latest episode progress for multiple vault items.
 * Returns a Map keyed by `vault_id` for O(1) lookup.
 *
 * Used by the vault read path to enrich all TV items in one batch
 * instead of N+1 queries.
 *
 * OPTIMISED: Only selects the columns needed for vault enrichment
 * (season_number, episode_number, watched_at, updated_at) instead
 * of SELECT *. This dramatically reduces payload size when users
 * have many TV shows with extensive episode history.
 */
export async function getLatestEpisodeProgressBatch(
  supabase: TypedSupabaseClient,
  vaultIds: string[]
): Promise<{ data: Map<string, EpisodeProgressRow>; error: Error | null }> {
  if (vaultIds.length === 0) {
    return { data: new Map(), error: null };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select("id,vault_id,season_number,episode_number,watched_at,updated_at")
    .in("vault_id", vaultIds)
    .order("watched_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) return { data: new Map(), error: toError(error) };
  if (!data) return { data: new Map(), error: null };

  // Build a Map: vault_id → latest episode_progress row.
  // Since results are ordered by watched_at desc, the first row per
  // vault_id is the latest. We only keep the first.
  const map = new Map<string, EpisodeProgressRow>();
  for (const row of data) {
    if (!map.has(row.vault_id)) {
      map.set(row.vault_id, row);
    }
  }

  return { data: map, error: null };
}

/**
 * Count completed episodes for a vault item.
 */
export async function getCompletedEpisodeCount(
  supabase: TypedSupabaseClient,
  vaultId: string
): Promise<{ count: number; error: Error | null }> {
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("vault_id", vaultId)
    .eq("is_completed", true);

  return { count: count ?? 0, error: toError(error) };
}
