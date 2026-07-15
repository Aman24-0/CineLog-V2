// src/features/watchlist/vaultReadAdapter.ts
import { getVaultRepository } from "~/lib/supabase/repositories";
import type {
  CreateVaultItemPayload,
  VaultIdentity,
  VaultRow,
  VaultStatus,
} from "~/lib/supabase/repositories";
import { enrichWithEpisodeProgressAsync } from "./episodeProgressAdapter";
import { STATUS_TO_UI, STATUS_TO_DB } from "~/shared/utils/vaultStatus";
import type { WatchlistItem } from "~/shared/types";

/**
 * vaultReadAdapter — READ operations for the Vault adapter.
 *
 * Extracted from vaultAdapter.ts to keep that file under the 250-line
 * limit. Contains:
 *   - vaultRowToWatchlistItem: VaultRow → WatchlistItem mapping
 *   - fetchVaultFromSupabase: load all non-deleted vault items + enrich
 *   - vaultIdentity: build the composite key (userId, tmdbId, mediaType)
 *   - createVaultItemInSupabase: insert a new vault row
 *
 * The status mapping uses the shared STATUS_TO_UI / STATUS_TO_DB tables
 * from ~/shared/utils/vaultStatus (Phase 13.2 dedup).
 */

/**
 * Map a single Supabase `VaultRow` to the application's `WatchlistItem`.
 *
 * Re-watch fields (v2.2):
 *   - `rewatch_count` (integer) → `rewatchCount`
 *   - `rewatch_dates` (text[]) → `rewatchDates`
 *   Both default to 0 / [] when the columns are null (handles rows
 *   created before the re-watch migration ran).
 *
 * SERIES per-season fields (v2.3):
 *   - `season_dates` (jsonb) → `seasonDates`
 *   - `season_rewatch_count` (integer) → `seasonRewatchCount`
 *   - `season_rewatch_dates` (jsonb) → `seasonRewatchDates`
 *   All default to {} / 0 / [] when null (handles pre-migration rows).
 */
export function vaultRowToWatchlistItem(row: VaultRow): WatchlistItem {
  // ── Media-type-aware watch date resolution ────────────────────────
  // The vault table has CHECK constraints that forbid movies from having
  // started_at/completed_at and TV from having watched_on. So the watch
  // date is stored in DIFFERENT columns depending on media_type:
  //
  //   Movies: watched_on  (when you watched the movie)
  //   TV:     completed_at (when you finished the series) — preferred
  //           started_at   (when you started the series) — fallback
  //
  // V1's `watchDate` field is overloaded: for movies it's the watch date,
  // for TV it's derived from the latest seasonDates.end (i.e. the
  // completion date). So on the write side we map:
  //   movie watchDate → watched_on
  //   TV watchDate    → started_at + completed_at (if status=Completed)
  //
  // On the read side we reverse the mapping to reconstruct the single
  // `watchDate` field the UI expects.
  const isTV = row.media_type === "tv";
  const watchDate = isTV
    ? (row.completed_at ?? row.started_at ?? undefined)
    : (row.watched_on ?? undefined);

  return {
    id: String(row.tmdb_id),
    media_type: row.media_type,
    status: STATUS_TO_UI[row.status] ?? "Planned",
    rating: row.rating ?? undefined,
    notes: row.notes ?? undefined,
    watchDate,
    addedAt: row.created_at,
    updatedAt: row.updated_at,
    rewatchCount: row.rewatch_count ?? 0,
    rewatchDates: row.rewatch_dates ?? [],
    seasonDates: (row.season_dates as Record<string, { start: string; end: string }>) ?? {},
    seasonRewatchCount: row.season_rewatch_count ?? 0,
    seasonRewatchDates: (row.season_rewatch_dates as Record<string, { start: string; end: string }>[]) ?? [],
  };
}

/**
 * Load ALL non-deleted vault items for a user from Supabase, ordered by
 * `created_at` desc (matching the previous Firestore `orderBy("addedAt",
 * "desc")`).
 *
 * Calls `VaultRepository.getVaultByStatus` for each of the 5 statuses
 * in parallel, merges the results, then enriches TV items with their
 * latest episode progress (season/episode/watchProgress) via a batch
 * query to the `episode_progress` table.
 */
export async function fetchVaultFromSupabase(
  userId: string,
): Promise<WatchlistItem[]> {
  const repo = getVaultRepository();
  const statuses: VaultStatus[] = [
    "planned",
    "watching",
    "completed",
    "on_hold",
    "dropped",
  ];

  const results = await Promise.all(
    statuses.map((status) =>
      repo.getVaultByStatus(userId, status, { pagination: { limit: 1000 } }),
    ),
  );

  const allRows: VaultRow[] = [];
  for (const result of results) {
    if (result.error) {
      console.error("[vaultAdapter] Error fetching vault status:", result.error);
      continue;
    }
    allRows.push(...result.data);
  }

  const items = allRows.map(vaultRowToWatchlistItem);
  const enrichedItems = await enrichWithEpisodeProgressAsync(items, allRows);

  // Sort by created_at desc (matching the previous Firestore orderBy)
  enrichedItems.sort((a, b) => {
    const timeA = typeof a.addedAt === "string" ? new Date(a.addedAt).getTime() : 0;
    const timeB = typeof b.addedAt === "string" ? new Date(b.addedAt).getTime() : 0;
    return timeB - timeA;
  });

  return enrichedItems;
}

/**
 * Build a `VaultIdentity` from a `WatchlistItem`.
 * The composite key is (user_id, tmdb_id, media_type).
 */
export function vaultIdentity(userId: string, item: WatchlistItem): VaultIdentity {
  return {
    userId,
    tmdbId: Number(item.id),
    mediaType: item.media_type,
  };
}

/**
 * Create a new vault item in Supabase from a `WatchlistItem`.
 *
 * Used by Search, Discover, Details, and the backup Restore flow.
 * The `WatchlistItem` carries TMDB metadata (title, poster_path, etc.)
 * which is NOT stored in the vault table — only the user-owned state
 * (status, rating, notes, dates, re-watch tracking, season dates) is
 * persisted.
 *
 * ALL user-owned fields are passed through so that imports from V1
 * backups preserve watch dates, season start/end dates, re-watch
 * counts, and the original `addedAt` timestamp.
 *
 * @returns The created `WatchlistItem` (with timestamps from Supabase).
 */
export async function createVaultItemInSupabase(
  userId: string,
  item: WatchlistItem,
): Promise<WatchlistItem> {
  const repo = getVaultRepository();
  // Media-type-aware payload: the vault table has CHECK constraints
  // (vault_movie_no_series_cols, vault_tv_no_movie_cols) that forbid
  // movies from having started_at/completed_at and TV from having
  // watched_on/progress_minutes. We partition the date/progress fields
  // by media_type so we never violate those constraints.
  const isMovie = item.media_type === "movie";
  const isTV = item.media_type === "tv";
  const isCompleted = item.status === "Completed";
  const watchDate = item.watchDate;
  const payload: CreateVaultItemPayload = {
    userId,
    tmdbId: Number(item.id),
    mediaType: item.media_type,
    status: (STATUS_TO_DB[item.status ?? "Planned"] ?? "planned") as VaultStatus,
    rating: item.rating,
    notes: item.notes,
    // Movies use watched_on + progress_minutes; TV uses started_at + completed_at.
    watchedOn: isMovie ? watchDate : undefined,
    progressMinutes: isMovie && typeof item.runtime === "number" && item.watchProgress && item.watchProgress.duration > 0
      ? Math.min(item.watchProgress.currentTime || 0, item.watchProgress.duration)
      : undefined,
    startedAt: isTV ? watchDate : undefined,
    completedAt: isTV && isCompleted && watchDate ? watchDate : undefined,
    // Preserve re-watch tracking (movies + series)
    rewatchCount: item.rewatchCount,
    rewatchDates: item.rewatchDates,
    // Preserve series per-season dates
    seasonDates: item.seasonDates,
    seasonRewatchCount: item.seasonRewatchCount,
    seasonRewatchDates: item.seasonRewatchDates,
    // Preserve original add timestamp so the timeline stays accurate
    // across imports (instead of every imported item showing today's date).
    createdAt:
      typeof item.addedAt === "string"
        ? item.addedAt
        : item.addedAt && typeof item.addedAt === "object" && "seconds" in item.addedAt
          ? new Date(item.addedAt.seconds * 1000).toISOString()
          : undefined,
    // lastActivityAt = most recent activity (updatedAt or addedAt or now)
    lastActivityAt: item.updatedAt ?? (typeof item.addedAt === "string" ? item.addedAt : undefined),
  };

  const { data, error } = await repo.createVaultItem(payload);
  if (error) throw error;
  if (!data) throw new Error("[vaultAdapter] createVaultItem returned no data");

  // Return a WatchlistItem that merges the original TMDB metadata with
  // the persisted vault state so the caller's modal state is complete.
  return { ...item, ...vaultRowToWatchlistItem(data) };
}

/**
 * Upsert a vault item — insert if not present, UPDATE if it already exists.
 *
 * Used by the backup Restore flow so that importing a V1 backup over an
 * existing V2 vault doesn't fail on items that were already added manually
 * (the "10 failed" issue). On conflict, ALL user-owned fields are
 * overwritten with the incoming values — the backup is the source of truth.
 *
 * @returns The upserted `WatchlistItem` (with timestamps from Supabase).
 */
export async function upsertVaultItemInSupabase(
  userId: string,
  item: WatchlistItem,
): Promise<WatchlistItem> {
  const repo = getVaultRepository();
  // Media-type-aware payload — see createVaultItemInSupabase for the
  // rationale (vault_movie_no_series_cols / vault_tv_no_movie_cols CHECK
  // constraints forbid mixing movie-only and TV-only date/progress columns).
  const isMovie = item.media_type === "movie";
  const isTV = item.media_type === "tv";
  const isCompleted = item.status === "Completed";
  const watchDate = item.watchDate;
  const payload: CreateVaultItemPayload = {
    userId,
    tmdbId: Number(item.id),
    mediaType: item.media_type,
    status: (STATUS_TO_DB[item.status ?? "Planned"] ?? "planned") as VaultStatus,
    rating: item.rating,
    notes: item.notes,
    watchedOn: isMovie ? watchDate : undefined,
    progressMinutes: isMovie && typeof item.runtime === "number" && item.watchProgress && item.watchProgress.duration > 0
      ? Math.min(item.watchProgress.currentTime || 0, item.watchProgress.duration)
      : undefined,
    startedAt: isTV ? watchDate : undefined,
    completedAt: isTV && isCompleted && watchDate ? watchDate : undefined,
    rewatchCount: item.rewatchCount,
    rewatchDates: item.rewatchDates,
    seasonDates: item.seasonDates,
    seasonRewatchCount: item.seasonRewatchCount,
    seasonRewatchDates: item.seasonRewatchDates,
    createdAt:
      typeof item.addedAt === "string"
        ? item.addedAt
        : item.addedAt && typeof item.addedAt === "object" && "seconds" in item.addedAt
          ? new Date(item.addedAt.seconds * 1000).toISOString()
          : undefined,
    lastActivityAt: item.updatedAt ?? (typeof item.addedAt === "string" ? item.addedAt : undefined),
  };

  const { data, error } = await repo.upsertVaultItem(payload);
  if (error) throw error;
  if (!data) throw new Error("[vaultAdapter] upsertVaultItem returned no data");

  return { ...item, ...vaultRowToWatchlistItem(data) };
}
