/**
 * CineLog V2 — Dashboard Repository: Continue Watching
 * ---------------------------------------------------------------------
 * The "Continue Watching" shelf — the most complex dashboard query
 * because it (a) applies the Bible §03 status + null-timestamp filter
 * and (b) enriches each TV/Anime vault row with its latest
 * `episode_progress` row.
 *
 * Split out from `dashboard.read.ts` to keep both files under 250
 * lines and to give the Continue Watching logic its own auditable home.
 */

import type {
  ContinueWatchingItem,
  DashboardListResult,
  DashboardPagination,
  DashboardResult,
  EpisodeProgressRow,
  TypedSupabaseClient,
  VaultRow
} from "./dashboard.types";
import {
  applyPagination,
  CONTINUE_WATCHING_OR_FILTER,
  EPISODE_PROGRESS_DASHBOARD_COLUMNS,
  toError,
  VAULT_DASHBOARD_COLUMNS
} from "./dashboard.utils";

// ---------------------------------------------------------------------------
// Table name constants
// ---------------------------------------------------------------------------

const VAULT_TABLE = "vault" as const;
const EPISODE_PROGRESS_TABLE = "episode_progress" as const;

// ---------------------------------------------------------------------------
// Continue Watching — Bible §03 rules
// ---------------------------------------------------------------------------

/**
 * Get the user's "Continue Watching" items — vault rows where
 * `status = "watching"` AND (`watched_on IS NULL` OR
 * `completed_at IS NULL`), per Database Bible §03.
 *
 * Ordered by `last_activity_at` desc (most recently active first).
 * Each vault row is enriched with its latest `episode_progress` row
 * (TV/Anime only; movies have `latestProgress: null`).
 */
export async function getContinueWatching(
  supabase: TypedSupabaseClient,
  userId: string,
  pagination?: DashboardPagination
): Promise<DashboardListResult<ContinueWatchingItem>> {
  const query = supabase
    .from(VAULT_TABLE)
    .select(VAULT_DASHBOARD_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "watching")
    .or(CONTINUE_WATCHING_OR_FILTER)
    .is("deleted_at", null)
    .order("last_activity_at", { ascending: false, nullsFirst: false });

  const paginated = applyPagination(query, pagination);
  const { data: vaultRows, error } = await paginated;
  if (error) return { data: [], error: toError(error) };
  if (!vaultRows || vaultRows.length === 0) return { data: [], error: null };

  // Enrich each TV vault row with its latest episode_progress row.
  // Movies (media_type = "movie") skip the progress lookup (Bible §06).
  const enriched = await Promise.all(
    vaultRows.map(async (vault): Promise<ContinueWatchingItem> => {
      if (vault.media_type === "movie") {
        return { vault: vault as VaultRow, latestProgress: null };
      }
      const progress = await getLatestEpisodeProgress(supabase, vault.id);
      return { vault: vault as VaultRow, latestProgress: progress.data };
    })
  );

  return { data: enriched, error: null };
}

// ---------------------------------------------------------------------------
// Episode progress helper — used by getContinueWatching
// ---------------------------------------------------------------------------

/**
 * Get the latest episode_progress row for a vault item, ordered by
 * `watched_at` desc (falling back to `updated_at` for rows where
 * `watched_at` is null).
 *
 * Returns `{ data: null, error: null }` if no progress rows exist
 * (e.g. a TV show the user just added but hasn't started).
 */
export async function getLatestEpisodeProgress(
  supabase: TypedSupabaseClient,
  vaultId: string
): Promise<DashboardResult<EpisodeProgressRow>> {
  const { data, error } = await supabase
    .from(EPISODE_PROGRESS_TABLE)
    .select(EPISODE_PROGRESS_DASHBOARD_COLUMNS)
    .eq("vault_id", vaultId)
    .order("watched_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data: data as EpisodeProgressRow | null, error: toError(error) };
}
