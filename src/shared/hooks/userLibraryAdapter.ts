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
 * ── PERFORMANCE OPTIMISATION (v2.5) ──────────────────────────────
 * Previously: Step 3 made N individual TMDB API requests (1030 requests
 * for a 1030-item vault, taking 15-32 seconds on first load).
 *
 * Now: Step 3 first checks the tmdb_cache table + localStorage for
 * cached metadata. Only items NOT found in cache trigger TMDB API calls.
 * On a warm cache, step 3 takes <1 second instead of 15-32 seconds.
 *
 * Cache hierarchy (fastest → slowest):
 *   1. localStorage (24h TTL, instant, survives page reload)
 *   2. tmdb_cache table (7-day TTL, via server API route)
 *   3. TMDB API (fallback, only for cache misses)
 *
 * Pipeline:
 *   1. DashboardRepository.getAllVaultItems — 1 Supabase query
 *   2. EpisodeProgressRepository batch + tmdb_cache lookup — PARALLEL
 *   3. fetchTmdbMetadataBatch — only for cache misses
 */

import { getDashboardRepository } from "~/lib/supabase/repositories";
import { getEpisodeProgressRepository } from "~/lib/supabase/repositories";
import type { VaultRow, EpisodeProgressRow } from "~/lib/supabase/repositories";
import {
  getExternalIdsByVaultIds,
  type ExternalIdSet,
  type ExternalIdsByVaultId
} from "~/lib/supabase/repositories/externalIds";
import { STATUS_TO_UI } from "~/shared/utils/vaultStatus";
import { normalizeGenres } from "~/shared/utils/genres";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { fetchTmdbMetadataBatch } from "~/core/tmdb/tmdb";
import {
  fetchCachedMetadataBatch,
  cacheMetadataEntries,
  buildCacheKey
} from "~/shared/utils/tmdbCache";
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
  externalIds?: ExternalIdSet
): WatchlistItem {
  // ── Media-type-aware watch date resolution ────────────────────────
  // See vaultReadAdapter.ts for the full rationale. Short version:
  //   Movies store watch date in `watched_on`.
  //   TV stores it in `completed_at` (preferred) or `started_at` (fallback).
  //   The vault table's CHECK constraints forbid mixing the two.
  const isTV = row.media_type === "tv";
  // Normalize watch dates to YYYY-MM-DD for <input type="date"> compatibility.
  // Supabase returns timestamptz as ISO strings like "2014-06-30T00:00:00+00:00".
  // The <input type="date"> element requires "YYYY-MM-DD" — if it receives the
  // full ISO timestamp, the date picker shows blank. We take the first 10
  // chars (the date portion) to avoid timezone-shift bugs (new Date() would
  // shift the calendar day in some timezones).
  const rawWatchDate = isTV
    ? (row.completed_at ?? row.started_at ?? undefined)
    : (row.watched_on ?? undefined);
  const watchDate = rawWatchDate
    ? rawWatchDate.substring(0, 10)
    : undefined;

  const base: WatchlistItem = {
    id: String(row.tmdb_id),
    externalIds,
    media_type: row.media_type,
    status: STATUS_TO_UI[row.status] ?? "Planned",
    rating: row.rating ?? undefined,
    notes: row.notes ?? undefined,
    watchDate,
    addedAt: row.created_at,
    updatedAt: row.updated_at,
    // ── Re-watch tracking (movies + series) ──────────────────────────
    rewatchCount: row.rewatch_count ?? 0,
    rewatchDates: row.rewatch_dates ?? [],
    // ── Series per-season tracking (v2.3 columns) ───────────────────
    seasonDates:
      (row.season_dates as Record<string, { start: string; end: string }>) ??
      {},
    seasonRewatchCount: row.season_rewatch_count ?? 0,
    seasonRewatchDates:
      (row.season_rewatch_dates as Record<
        string,
        { start: string; end: string }
      >[]) ?? [],
    // TMDB display metadata — may be undefined if the TMDB fetch failed,
    // in which case the UI falls back to "Untitled" / "NO POSTER".
    title: tmdb?.title,
    name: tmdb?.name,
    poster_path: tmdb?.poster_path ?? undefined,
    backdrop_path: tmdb?.backdrop_path ?? undefined,
    release_date: tmdb?.release_date,
    first_air_date: tmdb?.first_air_date,
    // TMDB vote_average is a number; WatchlistItem stores ratings as strings.
    tmdbRating:
      tmdb?.vote_average != null ? String(tmdb.vote_average) : undefined,
    genresList: normalizeGenres(tmdb?.genres as unknown[] | undefined),
    // Read-only season metadata from TMDB. This is needed by Continue
    // Watching to move from a completed season to the first episode of the
    // next season; it does not touch any user-owned progress fields.
    seasons:
      row.media_type === "tv" && Array.isArray(tmdb?.seasons)
        ? tmdb.seasons
            .filter((s) => s.season_number > 0 && s.episode_count > 0)
            .map((s) => ({ number: s.season_number, count: s.episode_count }))
        : undefined,
    // ── Region filter hydration (v3) ─────────────────────────────────
    // TMDB returns origin_country (e.g. ["IN", "US"]) and spoken_languages
    // (array of { iso_639_1, name, english_name }) on both /movie/{id}
    // and /tv/{id}. We hydrate these onto the WatchlistItem so the Region
    // filter in vaultFilterUtils.ts can detect Indian vs International
    // titles even when the legacy `region` field is missing.
    //
    // Older cache entries (pre-2026-07) won't have these fields — the
    // Region filter's matchesRegion() safely falls back to the explicit
    // `region` field, so legacy items still work (they just won't match
    // "Indian" unless `region === "Indian"` was explicitly set).
    origin_country: Array.isArray(tmdb?.origin_country)
      ? tmdb.origin_country
      : undefined,
    spoken_languages: Array.isArray(tmdb?.spoken_languages)
      ? tmdb.spoken_languages
      : undefined,
    // ── Part 3 — original_language ────────────────────────────────────
    // TMDB returns `original_language` on every /movie/{id} and /tv/{id}
    // response as a 2-letter ISO 639-1 code (e.g. "hi", "ta", "es", "ja").
    // We persist it onto the WatchlistItem so the Library Language
    // filter (`matchesLanguage` in vaultFilterUtils.ts) can match
    // against the title's ORIGINAL language — preferred over
    // `spoken_languages` (which lists every language spoken in the
    // title, not the original). Normalized to lowercase for stable
    // comparison. Older cached TMDBTitle payloads that predate this
    // field being captured will have `original_language: undefined`
    // — the Language filter treats that as "no match" for any
    // specific language, so legacy items still appear under
    // "All Languages" but are excluded when a specific language is
    // picked (graceful fallback until the cache refreshes).
    originalLanguage:
      typeof tmdb?.original_language === "string"
        ? tmdb.original_language.toLowerCase()
        : undefined,
    // ── Runtime (minutes) — drives the "Hours Watched" stat ──────────
    // Movies: TMDB returns a single `runtime` (e.g. 120 min).
    // TV series: TMDB returns `episode_run_time` (array of typical
    //   episode lengths) and `number_of_episodes`. We multiply the
    //   typical episode length by the total episode count to get the
    //   full-series runtime. Older cache entries (pre-2026-07) won't
    //   have these fields — runtime stays undefined and the stats
    //   page treats it as 0 (graceful fallback until cache refreshes).
    runtime: computeRuntimeMinutes(row.media_type, tmdb),
    // ── Cast & Director — powers vault search by actor/director name ──
    // fetchTmdbMetadata (v3) requests append_to_response=credits and
    // extracts the director name + top 15 cast names onto the TMDBTitle
    // as `director` and `castList`. We hydrate these onto the
    // WatchlistItem so matchSearch() in vaultFilterUtils can match
    // queries like "Tom Holland" or "Christopher Nolan".
    //
    // FALLBACK CHAIN: CSV-imported / backup-restored items may already
    // have `director` or `castList` set from the import payload — in
    // that case we DON'T overwrite (the import data is authoritative
    // for those items). For items added via normal TMDB search, the
    // fields are undefined and we use the TMDB-derived values.
    //
    // Older cache entries (pre-this-change) won't have `director` /
    // `castList` on the cached TMDBTitle — the search just won't match
    // cast/director for those items until the cache expires (24h
    // localStorage / 7d server) and the next fetch populates them.
    director: tmdb?.director,
    castList: Array.isArray(tmdb?.castList) ? tmdb.castList : undefined,
    // ── Favorite / Pinned flags ──────────────────────────────────────
    // Mirrors the `is_favorite` and `is_pinned` columns on the vault table.
    // Default to false when null (handles rows created before these
    // columns existed). Used by useVault.toggleFavorite / togglePinned
    // to determine the CURRENT state before flipping it.
    isFavorite: row.is_favorite ?? false,
    isPinned: row.is_pinned ?? false,
    hasNewRelease: (row as { has_new_release?: boolean }).has_new_release ?? false,
    // Activity tracking fields (added 2026-09-01 migration). All
    // nullable; existing items (pre-migration) load with null/undefined
    // and the UI treats that as "not set".
    reaction: (row as { reaction?: string | null }).reaction ?? null,
    watchDevice: (row as { watch_device?: string | null }).watch_device ?? null,
    watchPlatform: (row as { watch_platform?: string | null }).watch_platform ?? null,
    favoriteCharacterId: (row as { favorite_character_id?: string | null }).favorite_character_id ?? null,
    favoriteCharacterName: (row as { favorite_character_name?: string | null }).favorite_character_name ?? null,
    favoriteCharacterProfile: (row as { favorite_character_profile?: string | null }).favorite_character_profile ?? null
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
// computeRuntimeMinutes — derive WatchlistItem.runtime from TMDB metadata
// ---------------------------------------------------------------------------

/**
 * Compute the runtime (in minutes) for a vault item from the cached TMDB
 * metadata. This drives the "Hours Watched" stat on the Stats page.
 *
 * Movies: TMDB's `/movie/{id}` returns `runtime` (single number, minutes).
 *   We pass it through directly.
 *
 * TV series: TMDB's `/tv/{id}` returns `episode_run_time` (array of
 *   typical episode lengths — different episodes can differ) and
 *   `number_of_episodes` (total across all seasons). We multiply the
 *   first (typical) episode runtime by the total episode count to get
 *   the full-series runtime. If `episode_run_time` is missing or empty,
 *   we fall back to a 40-minute-per-episode default before applying the
 *   episode count.
 *
 * Returns `undefined` when neither movie `runtime` nor TV episode data
 * is present (e.g. older cache entries written before this field was
 * captured). The Stats page treats undefined as 0 — graceful fallback
 * until the cache refreshes.
 *
 * @param mediaType "movie" | "tv"
 * @param tmdb      Cached TMDB metadata (may be null on cache miss + API failure)
 */
function computeRuntimeMinutes(
  mediaType: "movie" | "tv",
  tmdb: TMDBTitle | null | undefined
): number | undefined {
  if (!tmdb) return undefined;

  if (mediaType === "movie") {
    // TMDB movie runtime is a single integer (minutes). Validate so a
    // bad cache entry (string, NaN, negative) doesn't pollute the stat.
    const r = tmdb.runtime;
    if (typeof r === "number" && r > 0) return r;
    return undefined;
  }

  // TV — multiply typical episode length by total episode count.
  const episodeCount = tmdb.number_of_episodes;
  if (typeof episodeCount !== "number" || episodeCount <= 0) return undefined;

  const runtimes = tmdb.episode_run_time;
  const typicalEpisode =
    Array.isArray(runtimes) &&
    runtimes.length > 0 &&
    typeof runtimes[0] === "number" &&
    runtimes[0] > 0
      ? runtimes[0]
      : 40; // reasonable fallback for series with missing runtime data

  return typicalEpisode * episodeCount;
}

// ---------------------------------------------------------------------------
// fetchUserLibrary — the single vault-fetch function
// ---------------------------------------------------------------------------

/**
 * Fetch the user's complete vault (all non-deleted items) with episode
 * progress enrichment for TV titles AND TMDB display metadata for all
 * titles.
 *
 * Pipeline (optimised):
 *   1. DashboardRepository.getAllVaultItems — 1 Supabase query
 *   2. Episode progress + tmdb_cache lookup — PARALLEL (no dependency)
 *   3. fetchTmdbMetadataBatch — only for cache misses (dramatically fewer)
 *
 * The tmdb_cache layer (localStorage + server tmdb_cache table) means
 * that on a warm cache, step 3 is skipped entirely — load time drops
 * from 15-32 seconds to 2-3 seconds.
 *
 * @param userId    The Supabase auth uid of the current user.
 * @param abortSignal Optional AbortSignal. When aborted, the underlying
 *                    Supabase query is cancelled via `supabase.from(...).abortSignal(signal)`,
 *                    which rejects the in-flight promise with an AbortError.
 *                    This is plumbed in from `useUserLibrary`'s safety timer
 *                    so the browser's native loading indicator clears
 *                    immediately when the fetch is cancelled (rather than
 *                    staying stuck until the network layer times out).
 * @returns Array of WatchlistItem (empty if no items or error).
 */
export async function fetchUserLibrary(
  userId: string,
  abortSignal?: AbortSignal
): Promise<WatchlistItem[]> {
  const repo = getDashboardRepository();

  // 1. Fetch all vault items (single query)
  // PHASE 18 BUG FIX: pass the abort signal so the Supabase query can
  // be cancelled when the safety timer fires. Without this, the HTTP
  // request hangs in the network stack and the browser loading bar
  // stays stuck even after we set loading=false.
  const { data: vaultRows, error: vaultError } = await repo.getAllVaultItems(
    userId,
    abortSignal
  );
  if (vaultError) {
    console.error(
      "[userLibraryAdapter] Error fetching vault items:",
      vaultError
    );
  }

  const rows = vaultRows ?? [];

  if (rows.length === 0) return [];

  // If the fetch was aborted mid-flight, bail out before kicking off the
  // parallel episode-progress + TMDB enrichment (which would be wasted work).
  if (abortSignal?.aborted) {
    throw new DOMException("Vault fetch aborted", "AbortError");
  }

  // 2. PARALLEL: Episode progress, external IDs, and tmdb_cache lookup.
  //    These have no dependency on each other — each only needs vault rows.
  const tvVaultIds = rows.filter((r) => r.media_type === "tv").map((r) => r.id);
  const cacheKeys = rows.map((r) => buildCacheKey(r.media_type, r.tmdb_id));

  const [progressResult, externalIdsResult, cachedTmdbMap] = await Promise.all([
    // Episode progress for TV items
    tvVaultIds.length > 0
      ? getEpisodeProgressRepository().getLatestEpisodeProgressBatch(tvVaultIds)
      : Promise.resolve({
          data: new Map<string, EpisodeProgressRow>(),
          error: null
        }),
    // Preserve imported/synced IMDb, Trakt, and TVDB IDs for interoperable
    // exports. This read silently degrades when a user has no external IDs.
    getExternalIdsByVaultIds(rows.map((row) => row.id)),
    // Cached TMDB metadata (localStorage + server tmdb_cache table)
    cacheKeys.length > 0
      ? fetchCachedMetadataBatch(cacheKeys)
      : Promise.resolve(new Map<string, TMDBTitle>())
  ]);

  let progressMap = new Map<string, EpisodeProgressRow>();
  if (progressResult.error) {
    console.error(
      "[userLibraryAdapter] Error fetching episode progress:",
      progressResult.error
    );
  } else {
    progressMap = progressResult.data;
  }

  let externalIdsByVaultId: ExternalIdsByVaultId = new Map();
  if (externalIdsResult.error) {
    console.warn(
      "[userLibraryAdapter] Error fetching external IDs:",
      externalIdsResult.error
    );
  } else {
    externalIdsByVaultId = externalIdsResult.data;
  }

  // 3. Identify cache misses — items that need TMDB API calls
  const missingItems = rows.filter(
    (r) => !cachedTmdbMap.has(buildCacheKey(r.media_type, r.tmdb_id))
  );

  const tmdbMap = new Map<string, TMDBTitle>(cachedTmdbMap);

  if (missingItems.length > 0) {
    const missingTmdbItems = missingItems.map((r) => ({
      mediaType: r.media_type,
      tmdbId: r.tmdb_id
    }));

    // Fetch missing items from TMDB API
    const freshTmdbMap = await fetchTmdbMetadataBatch(missingTmdbItems);

    // Merge fresh results into the main map
    for (const [key, value] of freshTmdbMap) {
      tmdbMap.set(key, value);
    }

    // Cache the fresh results for future visits (fire-and-forget)
    const cacheEntries = Array.from(freshTmdbMap.entries()).map(
      ([key, data]) => {
        const [mediaType, tmdbIdStr] = key.split("/");
        return {
          key,
          tmdb_id: Number(tmdbIdStr),
          media_type: mediaType as "movie" | "tv",
          data
        };
      }
    );
    // Don't await — cache writes are best-effort and shouldn't block the UI
    cacheMetadataEntries(cacheEntries).catch((err) => { if (import.meta.env.DEV) console.warn("[userLibraryAdapter] cache write failed:", err); });
  }

  // 4. Map to WatchlistItem with episode progress + TMDB metadata enrichment
  return rows.map((row) => {
    const progress = progressMap.get(row.id);
    const tmdbKey = buildCacheKey(row.media_type, row.tmdb_id);
    const tmdb = tmdbMap.get(tmdbKey) ?? null;
    return vaultRowToWatchlistItem(
      row,
      progress,
      tmdb,
      externalIdsByVaultId.get(row.id)
    );
  });
}

/**
 * Get the current user's uid. Returns null if not signed in.
 */
export function getUserId(): string | null {
  return getCurrentUid();
}
