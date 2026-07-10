/**
 * CineLog V2 — User Library Adapter (Shared)
 * ---------------------------------------------------------------------
 * Phase 10.2 — Shared User Library Layer
 *
 * The SOLE vault-fetching logic in the application. Both Dashboard and
 * Discover consume this via `useUserLibrary()`. No feature-to-feature
 * dependency. No duplicate fetches.
 *
 * Architecture:
 *   Dashboard → useUserLibrary → userLibraryAdapter → DashboardRepository → Supabase
 *   Discover  → useUserLibrary → userLibraryAdapter → DashboardRepository → Supabase
 *
 * This adapter lives in `src/shared/` (not in any feature folder) because
 * it is shared infrastructure — it loads the user's vault and enriches it
 * with episode progress AND TMDB display metadata (title, poster, etc.).
 *
 * Uses DashboardRepository.getAllVaultItems (1 query) + EpisodeProgressRepository
 * batch fetch (1 query) + fetchTmdbMetadataBatch (N parallel cached TMDB
 * requests, deduped via apiCache). The TMDB enrichment is REQUIRED because
 * the vault table only stores tmdb_id + user state — title, poster_path,
 * backdrop_path, release_date are all fetched from TMDB on every load.
 * Without this enrichment, vault items render as "Untitled" / "NO POSTER".
 */

import { getDashboardRepository } from "~/lib/supabase/repositories";
import { getEpisodeProgressRepository } from "~/lib/supabase/repositories";
import type { VaultRow, EpisodeProgressRow } from "~/lib/supabase/repositories";
import { STATUS_TO_UI } from "~/shared/utils/vaultStatus";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { fetchTmdbMetadataBatch } from "~/core/tmdb/tmdb";
import type { TMDBTitle, WatchlistItem, WatchProgress } from "~/shared/types";

// ---------------------------------------------------------------------------
// VaultRow → WatchlistItem (with optional episode progress + TMDB metadata)
// ---------------------------------------------------------------------------

/**
 * Map a single VaultRow to a WatchlistItem. If episode progress is
 * provided (TV only), populates season/episode/watchProgress. If TMDB
 * metadata is provided, populates title/name/poster_path/backdrop_path/
 * release_date/first_air_date/imdbRating so the UI can render the card.
 */
export function vaultRowToWatchlistItem(
  row: VaultRow,
  progress?: EpisodeProgressRow | null,
  tmdb?: TMDBTitle | null,
): WatchlistItem {
  const base: WatchlistItem = {
    id: String(row.tmdb_id),
    media_type: row.media_type,
    status: STATUS_TO_UI[row.status] ?? "Planned",
    rating: row.rating ?? undefined,
    notes: row.notes ?? undefined,
    watchDate: row.watched_on ?? undefined,
    addedAt: row.created_at,
    updatedAt: row.updated_at,
    // TMDB display metadata — may be undefined if the TMDB fetch failed,
    // in which case the UI falls back to "Untitled" / "NO POSTER".
    title: tmdb?.title,
    name: tmdb?.name,
    poster_path: tmdb?.poster_path ?? undefined,
    backdrop_path: tmdb?.backdrop_path ?? undefined,
    release_date: tmdb?.release_date,
    first_air_date: tmdb?.first_air_date,
    // TMDB vote_average is a number; WatchlistItem stores ratings as strings.
    tmdbRating: tmdb?.vote_average != null ? String(tmdb.vote_average) : undefined,
    genresList: tmdb?.genres,
  };

  if (progress && row.media_type === "tv") {
    const wp: WatchProgress = {
      currentTime: 0,
      duration: 0,
      server: null,
      updatedAt: progress.watched_at ?? progress.updated_at,
      season: progress.season_number,
      episode: progress.episode_number
    };
    return {
      ...base,
      season: progress.season_number,
      episode: progress.episode_number,
      watchProgress: wp
    };
  }
  return base;
}

// ---------------------------------------------------------------------------
// fetchUserLibrary — the single vault-fetch function
// ---------------------------------------------------------------------------

/**
 * Fetch the user's complete vault (all non-deleted items) with episode
 * progress enrichment for TV titles AND TMDB display metadata for all
 * titles.
 *
 * Pipeline:
 *   1. DashboardRepository.getAllVaultItems — 1 Supabase query
 *   2. EpisodeProgressRepository.getLatestEpisodeProgressBatch — 1 query (TV only)
 *   3. fetchTmdbMetadataBatch — N parallel cached TMDB requests (deduped
 *      via apiCache, so repeated loads within the TTL are instant)
 *
 * The TMDB enrichment (step 3) is what populates title, poster_path,
 * backdrop_path, release_date — without it, vault items show as
 * "Untitled" / "NO POSTER" because the vault table only stores tmdb_id.
 *
 * @returns Array of WatchlistItem (empty if no items or error).
 */
export async function fetchUserLibrary(userId: string): Promise<WatchlistItem[]> {
  const repo = getDashboardRepository();

  // 1. Fetch all vault items (single query)
  const { data: vaultRows, error: vaultError } = await repo.getAllVaultItems(userId);
  if (vaultError) {
    console.error("[userLibraryAdapter] Error fetching vault items:", vaultError);
  }

  const rows = vaultRows ?? [];

  // 2. Batch-fetch episode progress for TV items (single query)
  const tvVaultIds = rows.filter((r) => r.media_type === "tv").map((r) => r.id);
  let progressMap = new Map<string, EpisodeProgressRow>();

  if (tvVaultIds.length > 0) {
    const progressRepo = getEpisodeProgressRepository();
    const { data: pMap, error: pError } = await progressRepo.getLatestEpisodeProgressBatch(tvVaultIds);
    if (pError) {
      console.error("[userLibraryAdapter] Error fetching episode progress:", pError);
    } else {
      progressMap = pMap;
    }
  }

  // 3. Batch-fetch TMDB display metadata (title, poster, backdrop, etc.)
  //    The vault table only stores tmdb_id — title/poster are NOT stored.
  //    Without this step every vault item renders as "Untitled" / "NO POSTER".
  //    Requests run in parallel and are cached by apiCache (TMDB_TTL).
  const tmdbItems = rows.map((r) => ({
    mediaType: r.media_type,
    tmdbId: r.tmdb_id,
  }));
  const tmdbMap = tmdbItems.length > 0
    ? await fetchTmdbMetadataBatch(tmdbItems)
    : new Map<string, TMDBTitle>();

  // 4. Map to WatchlistItem with episode progress + TMDB metadata enrichment
  return rows.map((row) => {
    const progress = progressMap.get(row.id);
    const tmdbKey = `${row.media_type}/${row.tmdb_id}`;
    const tmdb = tmdbMap.get(tmdbKey) ?? null;
    return vaultRowToWatchlistItem(row, progress, tmdb);
  });
}

/**
 * Get the current user's uid. Returns null if not signed in.
 */
export function getUserId(): string | null {
  return getCurrentUid();
}
