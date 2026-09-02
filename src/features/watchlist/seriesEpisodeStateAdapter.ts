import {
  getEpisodeProgressRepository,
  getVaultRepository
} from "~/lib/supabase/repositories";
import type { CachedSeasonInfo, WatchlistItem } from "~/shared/types";
import type { VaultStatus } from "~/lib/supabase/repositories";
import { STATUS_TO_DB } from "~/shared/utils/vaultStatus";
import {
  deriveSeriesStatus,
  episodeKey,
  getContiguousWatchedPrefix,
  getLastEpisodePosition,
  getTrackerPosition,
  getWatchedPrefixBefore,
  getWatchedPrefixThrough,
  listSeriesEpisodes,
  normalizeSeriesSeasons,
  type SeriesDerivedStatus,
  type SeriesEpisodeRef
} from "~/shared/utils/episodeState";
import { logActivity } from "~/lib/supabase/repositories/activityLog";

export interface SeriesEpisodeState {
  status: WatchlistItem["status"];
  season: number;
  episode: number;
  watchedCount: number;
  totalEpisodes: number;
  progressPct: number;
}

async function resolveVaultId(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"]
): Promise<string> {
  const { data, error } = await getVaultRepository().getVaultByTmdbId(
    userId,
    Number(itemId),
    mediaType
  );
  if (error || !data) {
    throw error ?? new Error(`Could not resolve vault item ${itemId}`);
  }
  return data.id;
}

async function persistStatus(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  status: WatchlistItem["status"]
): Promise<void> {
  const vaultStatus = (STATUS_TO_DB[status] ?? "planned") as VaultStatus;
  const { error } = await getVaultRepository().updateStatus(
    { userId, tmdbId: Number(itemId), mediaType },
    vaultStatus
  );
  if (error) throw error;

  void logActivity({
    userId,
    action: "vault_status_changed",
    tmdbId: itemId,
    entityType: mediaType,
    metadata: { status }
  });
}

function buildState(
  status: WatchlistItem["status"],
  prefix: readonly SeriesEpisodeRef[],
  seasons: readonly CachedSeasonInfo[] | undefined,
  fallback?: SeriesEpisodeRef
): SeriesEpisodeState {
  const totalEpisodes = listSeriesEpisodes(seasons).length;
  const watchedCount = prefix.length;
  const resolvedStatus =
    totalEpisodes > 0
      ? deriveSeriesStatus(watchedCount, totalEpisodes)
      : watchedCount > 0
        ? "Watching"
        : "Planned";
  const tracker = getTrackerPosition(prefix, seasons);
  return {
    status:
      status === "Dropped" || status === "Plan to Watch"
        ? status
        : (resolvedStatus as SeriesDerivedStatus),
    season: fallback?.season ?? tracker.season,
    episode: fallback?.episode ?? tracker.episode,
    watchedCount,
    totalEpisodes,
    progressPct:
      totalEpisodes > 0 ? Math.round((watchedCount / totalEpisodes) * 100) : 0
  };
}

function fallbackState(
  status: WatchlistItem["status"],
  prefix: readonly SeriesEpisodeRef[],
  seasons: readonly CachedSeasonInfo[] | undefined,
  fallback: SeriesEpisodeRef
): SeriesEpisodeState {
  const state = buildState(status, prefix, seasons);
  return { ...state, season: fallback.season, episode: fallback.episode };
}

/**
 * Persist one status change and keep TV episode rows synchronized.
 * Planned clears all episode rows; Completed fills every known episode;
 * Watching is derived from the existing contiguous prefix; Dropped remains
 * an explicit non-progress status for backward-compatible vault behavior.
 */
export async function setSeriesStatusInSupabase(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  requestedStatus: WatchlistItem["status"],
  seasons?: readonly CachedSeasonInfo[]
): Promise<SeriesEpisodeState> {
  const normalizedSeasons = normalizeSeriesSeasons(seasons);
  if (mediaType !== "tv") {
    await persistStatus(userId, itemId, mediaType, requestedStatus);
    return {
      status: requestedStatus,
      season: 1,
      episode: 1,
      watchedCount: 0,
      totalEpisodes: 0,
      progressPct: 0
    };
  }

  const vaultId = await resolveVaultId(userId, itemId, mediaType);
  const progressRepo = getEpisodeProgressRepository();
  const existingResult =
    await progressRepo.getEpisodeProgressForVaultItem(vaultId);
  if (existingResult.error) throw existingResult.error;

  if (requestedStatus === "Dropped") {
    const prefix = getContiguousWatchedPrefix(
      normalizedSeasons,
      existingResult.data,
      (row) =>
        row.is_completed || row.watched_at
          ? episodeKey(row.season_number, row.episode_number)
          : null
    );
    await persistStatus(userId, itemId, mediaType, "Dropped");
    return buildState("Dropped", prefix, normalizedSeasons);
  }

  if (requestedStatus === "Planned" || requestedStatus === "Plan to Watch") {
    const { error } = await progressRepo.resetEpisodeProgress(vaultId);
    if (error) throw error;
    await persistStatus(userId, itemId, mediaType, requestedStatus);
    return fallbackState(requestedStatus, [], normalizedSeasons, {
      season: 1,
      episode: 1
    });
  }

  if (requestedStatus === "Completed") {
    const episodes = listSeriesEpisodes(normalizedSeasons);
    const episodesToWrite =
      episodes.length > 0
        ? episodes
        : existingResult.data.map((row) => ({
            season: row.season_number,
            episode: row.episode_number
          }));
    const timestamp = Date.now();
    const { error } = await Promise.all(
      episodesToWrite.map((episode, index) =>
        progressRepo
          .upsertEpisodeProgress({
            vaultId,
            seasonNumber: episode.season,
            episodeNumber: episode.episode,
            isCompleted: true,
            progressMinutes: 0,
            watchedAt: new Date(timestamp + index).toISOString()
          })
          .then((result) => result.error)
      )
    ).then((errors) => ({ error: errors.find(Boolean) ?? null }));
    if (error) throw error;

    await persistStatus(userId, itemId, mediaType, "Completed");
    return {
      status: "Completed",
      ...getLastEpisodePosition(normalizedSeasons),
      watchedCount: episodesToWrite.length,
      totalEpisodes: episodes.length,
      progressPct: episodes.length > 0 ? 100 : 0
    };
  }

  // ── 2026-09-03 fix — explicit "Watching" request ──────────────────
  // When the user explicitly sets the status to "Watching" (via the
  // ActionDock's Watching button), persist "Watching" as-is. The
  // previous fall-through code derived the status from episode progress
  // via deriveSeriesStatus(), which meant:
  //   - Completed → Watching on a fully-watched series: derived back to
  //     "Completed" (all episodes watched) → the UI stayed on Completed
  //     and the toast said "Status: Completed". BUG.
  //   - Planned → Watching on a series with no watched episodes: derived
  //     back to "Planned" (no episodes watched) → the UI stayed on
  //     Planned and the toast said "Status: Planned". BUG.
  //
  // The episode cleanup (deleting future episodes beyond the watched
  // prefix) is still correct — we keep the contiguous watched prefix
  // and remove anything after the first gap. But the STATUS is
  // "Watching" because the user explicitly asked for it. The derivation
  // is only appropriate for the markEpisodeWatchedAndSync /
  // unwatchEpisodeAndSync flows (where the user is interacting with
  // individual episodes, not explicitly setting a status).
  if (requestedStatus === "Watching") {
    const prefix = getContiguousWatchedPrefix(
      normalizedSeasons,
      existingResult.data,
      (row) =>
        row.is_completed || row.watched_at
          ? episodeKey(row.season_number, row.episode_number)
          : null
    );
    const episodes = listSeriesEpisodes(normalizedSeasons);
    // Delete any episode progress AFTER the contiguous watched prefix.
    // This keeps the prefix intact (the user's watched history up to the
    // first gap) and removes any stray progress beyond the gap that
    // would otherwise imply a later episode was watched.
    if (episodes.length > prefix.length) {
      const firstGap = episodes[prefix.length];
      const { error } = await progressRepo.deleteEpisodeProgressFrom(
        vaultId,
        firstGap!.season,
        firstGap!.episode
      );
      if (error) throw error;
    }
    // Persist "Watching" — NOT the derived status. The user explicitly
    // requested it.
    await persistStatus(userId, itemId, mediaType, "Watching");
    // Return the state with status="Watching". We use fallbackState
    // (which calls buildState) but buildState re-derives the status —
    // so we override the status field to "Watching" after the call.
    // The tracker position (season/episode) is still derived from the
    // prefix, which is correct.
    const state = fallbackState("Watching", prefix, normalizedSeasons, {
      season: 1,
      episode: 1
    });
    return { ...state, status: "Watching" };
  }

  // ── Fall-through: derived status (used by markEpisodeWatchedAndSync
  // and unwatchEpisodeAndSync, which interact with individual episodes
  // and need the status to be derived from the resulting episode state) ──
  const prefix = getContiguousWatchedPrefix(
    normalizedSeasons,
    existingResult.data,
    (row) =>
      row.is_completed || row.watched_at
        ? episodeKey(row.season_number, row.episode_number)
        : null
  );
  const episodes = listSeriesEpisodes(normalizedSeasons);
  if (episodes.length > prefix.length) {
    const firstGap = episodes[prefix.length];
    const { error } = await progressRepo.deleteEpisodeProgressFrom(
      vaultId,
      firstGap!.season,
      firstGap!.episode
    );
    if (error) throw error;
  }
  const resolvedStatus =
    episodes.length > 0
      ? deriveSeriesStatus(prefix.length, episodes.length)
      : prefix.length > 0
        ? "Watching"
        : "Planned";
  await persistStatus(userId, itemId, mediaType, resolvedStatus);
  return buildState(resolvedStatus, prefix, normalizedSeasons);
}

/** Mark the requested episode and every preceding episode as watched. */
export async function markEpisodeWatchedAndSync(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  season: number,
  episode: number,
  seasons?: readonly CachedSeasonInfo[]
): Promise<SeriesEpisodeState> {
  if (mediaType !== "tv") {
    return setSeriesStatusInSupabase(
      userId,
      itemId,
      mediaType,
      "Watching",
      seasons
    );
  }

  const normalizedSeasons = normalizeSeriesSeasons(seasons);
  const vaultId = await resolveVaultId(userId, itemId, mediaType);
  const progressRepo = getEpisodeProgressRepository();
  const existingResult =
    await progressRepo.getEpisodeProgressForVaultItem(vaultId);
  if (existingResult.error) throw existingResult.error;
  const existingPrefix = getContiguousWatchedPrefix(
    normalizedSeasons,
    existingResult.data,
    (row) =>
      row.is_completed || row.watched_at
        ? episodeKey(row.season_number, row.episode_number)
        : null
  );
  const requestedPrefix = getWatchedPrefixThrough(
    normalizedSeasons,
    season,
    episode
  );
  const requestedEpisodes =
    requestedPrefix.length > 0
      ? requestedPrefix
      : [{ season, episode } satisfies SeriesEpisodeRef];
  const episodesToWrite =
    existingPrefix.length > requestedEpisodes.length
      ? existingPrefix
      : requestedEpisodes;
  const allEpisodes = listSeriesEpisodes(normalizedSeasons);
  if (allEpisodes.length > episodesToWrite.length) {
    const firstUnwatched = allEpisodes[episodesToWrite.length];
    const { error } = await progressRepo.deleteEpisodeProgressFrom(
      vaultId,
      firstUnwatched.season,
      firstUnwatched.episode
    );
    if (error) throw error;
  }
  const timestamp = Date.now();
  const errors = await Promise.all(
    episodesToWrite.map((current, index) =>
      progressRepo
        .upsertEpisodeProgress({
          vaultId,
          seasonNumber: current.season,
          episodeNumber: current.episode,
          isCompleted: true,
          progressMinutes: 0,
          watchedAt: new Date(timestamp + index).toISOString()
        })
        .then((result) => result.error)
    )
  );
  const error = errors.find(Boolean);
  if (error) throw error;

  const totalEpisodes = listSeriesEpisodes(normalizedSeasons).length;
  const status =
    totalEpisodes > 0
      ? deriveSeriesStatus(episodesToWrite.length, totalEpisodes)
      : "Watching";
  await persistStatus(userId, itemId, mediaType, status);
  return buildState(status, episodesToWrite, normalizedSeasons);
}

/** Unwatch the requested episode and every later episode, including later seasons. */
export async function unwatchEpisodeAndSync(
  userId: string,
  itemId: string,
  mediaType: WatchlistItem["media_type"],
  unmarkSeason: number,
  unmarkEpisode: number,
  fallbackTracker: SeriesEpisodeRef,
  seasons?: readonly CachedSeasonInfo[]
): Promise<SeriesEpisodeState> {
  if (mediaType !== "tv") {
    return setSeriesStatusInSupabase(
      userId,
      itemId,
      mediaType,
      "Planned",
      seasons
    );
  }

  const normalizedSeasons = normalizeSeriesSeasons(seasons);
  const vaultId = await resolveVaultId(userId, itemId, mediaType);
  const progressRepo = getEpisodeProgressRepository();
  const existingResult =
    await progressRepo.getEpisodeProgressForVaultItem(vaultId);
  if (existingResult.error) throw existingResult.error;
  const existingPrefix = getContiguousWatchedPrefix(
    normalizedSeasons,
    existingResult.data,
    (row) =>
      row.is_completed || row.watched_at
        ? episodeKey(row.season_number, row.episode_number)
        : null
  );
  const requestedPrefix = getWatchedPrefixBefore(
    normalizedSeasons,
    unmarkSeason,
    unmarkEpisode
  );
  const prefix = existingPrefix.slice(0, requestedPrefix.length);

  const { error } = await progressRepo.deleteEpisodeProgressFrom(
    vaultId,
    unmarkSeason,
    unmarkEpisode
  );
  if (error) throw error;
  const totalEpisodes = listSeriesEpisodes(normalizedSeasons).length;
  const status =
    totalEpisodes > 0
      ? deriveSeriesStatus(prefix.length, totalEpisodes)
      : prefix.length > 0
        ? "Watching"
        : "Planned";
  await persistStatus(userId, itemId, mediaType, status);
  const tracker =
    prefix.length > 0
      ? getTrackerPosition(prefix, normalizedSeasons)
      : fallbackTracker;
  return fallbackState(status, prefix, normalizedSeasons, tracker);
}
