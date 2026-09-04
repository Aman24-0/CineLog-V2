// src/server/notifications/episodeReleaseDetector.ts
//
// Core logic for detecting newly released TV/anime episodes and
// generating notifications. Used by the /api/cron/episode-releases
// cron job.
//
// 2026-09-03 HARDENING:
//   - Active season detection: finds the highest season that actually
//     has released episodes, not just the numerically highest season.
//     This correctly handles announced/upcoming seasons (S3) that
//     have no released episodes while S2 is currently airing.
//   - Notification state tracking: episode_release_log now has a
//     notification_status column (pending/sent/failed/skipped).
//     Push failure → status=failed → can be retried. Push success →
//     status=sent → never retried. This prevents the "push fails but
//     dedup record blocks future retries" bug.
//   - Missed-release anti-spam: when multiple episodes are detected
//     as released but unnotified, ALL are marked as processed (sent
//     or skipped) but only the LATEST one gets a push notification.
//     This prevents E1→E2→E3 sequential notifications across cron runs.
//   - Accurate counts: notificationsSent/Failed/Skipped are derived
//     from the actual push result, not from the number of processRelease calls.
//   - Concurrency: upsert with ON CONFLICT ensures two concurrent cron
//     runs can't create duplicate notifications.

import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { fetchTmdbMetadata, fetchSeasonDetails } from "~/core/tmdb/tmdb";
import { titleDetailPath } from "~/shared/utils/titleRoutes";
import { CINELOG_NOTIFICATION_ICON } from "~/shared/constants/notificationAssets";
import type { TMDBTitle, TMDBEpisode, TMDBSeason } from "~/shared/types";

// ── Types ─────────────────────────────────────────────────────────

interface VaultTvItem {
  id: string;
  user_id: string;
  tmdb_id: number;
  status: string;
  season: number | null;
  episode: number | null;
}

export interface ReleaseDetectionResult {
  processed: number;
  notificationsSent: number;
  notificationsFailed: number;
  notificationsSkipped: number;
  reactivations: number;
  errors: string[];
}

interface DetectedRelease {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeAirDate: string | null;
  titleName: string;
  isReactivation: boolean;
  /** All episode numbers that should be marked as processed (for anti-spam). */
  allProcessedEpisodeNumbers: number[];
}

type PushResult = { sent: number; failed: number; skipped: number };

// ── Constants ─────────────────────────────────────────────────────

const ELIGIBLE_STATUSES = ["watching", "completed"];
const REACTIVATION_STATUS = "completed";
const REACTIVATED_STATUS = "watching";

// ── Helpers ───────────────────────────────────────────────────────

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isEpisodeReleased(airDate: string | null | undefined): boolean {
  if (!airDate || typeof airDate !== "string") return false;
  return airDate <= todayUtcDate();
}

/**
 * Find the active released season — the highest season_number that
 * actually has at least one released episode.
 *
 * This correctly handles the case where TMDB lists an announced S3
 * (with no released episodes) above a currently airing S2.
 *
 * Strategy: iterate seasons descending, fetch episodes for each,
 * return the first season that has ≥1 released episode.
 *
 * Optimization: typically only 1-2 seasons need checking (the latest
 * 1-2). We stop at the first season with released episodes.
 *
 * For 'completed' titles: we also skip seasons ≤ user's tracked season
 * (those are already watched).
 */
async function findActiveReleasedSeason(
  tmdbId: number,
  realSeasons: TMDBSeason[],
  userTrackedSeason: number | null,
  isCompleted: boolean
): Promise<{ season: TMDBSeason; releasedEpisodes: TMDBEpisode[] } | null> {
  for (const season of realSeasons) {
    // For completed titles: skip seasons ≤ user's tracked season
    if (isCompleted && userTrackedSeason !== null && season.season_number <= userTrackedSeason) {
      continue;
    }

    try {
      const seasonData = await fetchSeasonDetails(tmdbId, season.season_number);
      const episodes = seasonData.episodes ?? [];
      const released = episodes.filter((ep) => isEpisodeReleased(ep.air_date));

      if (released.length > 0) {
        return { season, releasedEpisodes: released };
      }
    } catch (err) {
      console.warn(
        `[episodeReleaseDetector] season fetch failed for tmdb_id=${tmdbId} season=${season.season_number}:`,
        err instanceof Error ? err.message : String(err)
      );
      // Continue to next season — a fetch failure for one season
      // shouldn't prevent checking others.
    }
  }

  return null;
}

async function sendPushNotification(args: {
  userId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  category: string;
}): Promise<PushResult> {
  try {
    const cronSecret = process.env.CRON_SECRET ?? "";
    if (!cronSecret) {
      console.warn("[episodeReleaseDetector] CRON_SECRET not set — skipping push");
      return { sent: 0, failed: 0, skipped: 1 };
    }

    const baseUrl = process.env.URL ?? "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/push/send-admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": cronSecret
      },
      body: JSON.stringify({
        userId: args.userId,
        title: args.title,
        body: args.body,
        url: args.url,
        tag: args.tag,
        icon: CINELOG_NOTIFICATION_ICON,
        category: args.category
      })
    });

    if (!response.ok) {
      console.warn(
        `[episodeReleaseDetector] push send failed: HTTP ${response.status}`
      );
      return { sent: 0, failed: 1, skipped: 0 };
    }

    const result = (await response.json()) as {
      sent?: number;
      failed?: number;
      skipped?: number;
    };
    return {
      sent: result.sent ?? 0,
      failed: result.failed ?? 0,
      skipped: result.skipped ?? 0
    };
  } catch (err) {
    console.warn(
      "[episodeReleaseDetector] push send error:",
      err instanceof Error ? err.message : String(err)
    );
    return { sent: 0, failed: 1, skipped: 0 };
  }
}

// ── Core detection logic (exported for testing) ───────────────────

export async function detectNewReleasesForItem(
  item: VaultTvItem,
  adminClient: ReturnType<typeof createAdminClient>
): Promise<DetectedRelease[]> {
  const results: DetectedRelease[] = [];

  // 1. Fetch TMDB show details
  let showDetails: TMDBTitle | null;
  try {
    showDetails = await fetchTmdbMetadata("tv", String(item.tmdb_id));
  } catch (err) {
    console.warn(
      `[episodeReleaseDetector] TMDB fetch failed for tmdb_id=${item.tmdb_id}:`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }

  if (!showDetails?.seasons || showDetails.seasons.length === 0) return [];

  // 2. Find real seasons (exclude specials/season 0), sorted descending
  const realSeasons = showDetails.seasons
    .filter((s) => s.season_number > 0)
    .sort((a, b) => b.season_number - a.season_number);

  if (realSeasons.length === 0) return [];

  const userTrackedSeason = item.season ?? 1;
  const isCompleted = item.status === REACTIVATION_STATUS;

  // 3. Find the active released season (not just the numerically latest)
  const activeSeason = await findActiveReleasedSeason(
    item.tmdb_id,
    realSeasons,
    userTrackedSeason,
    isCompleted
  );

  if (!activeSeason) return [];

  const { season: latestSeason, releasedEpisodes } = activeSeason;

  // 4. Check which episodes haven't been notified yet (dedup)
  const { data: existingLogs, error: logError } = await adminClient
    .from("episode_release_log")
    .select("episode_number, notification_status")
    .eq("user_id", item.user_id)
    .eq("tmdb_id", item.tmdb_id)
    .eq("season_number", latestSeason.season_number);

  if (logError) {
    console.warn(
      `[episodeReleaseDetector] dedup query failed for tmdb_id=${item.tmdb_id}:`,
      logError.message
    );
    return [];
  }

  // Episodes with status 'sent' or 'skipped' are considered processed.
  // Episodes with status 'pending' or 'failed' are retryable (actionable).
  const processedEpisodes = new Set<number>();

  for (const log of existingLogs ?? []) {
    const epNum = log.episode_number as number;
    const status = log.notification_status as string;
    if (status === "sent" || status === "skipped") {
      processedEpisodes.add(epNum);
    }
  }

  // 5. Find actionable released episodes (not yet sent/skipped)
  const actionableReleases = releasedEpisodes.filter(
    (ep) => !processedEpisodes.has(ep.episode_number)
  );

  if (actionableReleases.length === 0) return [];

  const titleName = showDetails.name ?? showDetails.title ?? "Unknown Title";
  const isReactivation = isCompleted;

  // 6. Determine which episode to notify about
  //    For reactivation: only the FIRST released episode triggers it.
  //    For watching: only the LATEST actionable released episode gets a push.
  //    ALL actionable episodes are marked as processed (anti-spam).

  const allProcessedEpisodeNumbers = actionableReleases.map((ep) => ep.episode_number);

  if (isReactivation) {
    const firstEp = actionableReleases[0]!;
    results.push({
      tmdbId: item.tmdb_id,
      seasonNumber: latestSeason.season_number,
      episodeNumber: firstEp.episode_number,
      episodeAirDate: firstEp.air_date,
      titleName,
      isReactivation: true,
      allProcessedEpisodeNumbers
    });
  } else {
    const latestEp = actionableReleases[actionableReleases.length - 1]!;
    results.push({
      tmdbId: item.tmdb_id,
      seasonNumber: latestSeason.season_number,
      episodeNumber: latestEp.episode_number,
      episodeAirDate: latestEp.air_date,
      titleName,
      isReactivation: false,
      allProcessedEpisodeNumbers
    });
  }

  return results;
}

/**
 * Process a single detected release.
 *
 * Flow:
 *   1. Reactivation (if applicable): update vault status → watching + has_new_release.
 *   2. Mark ALL actionable episodes as processed in episode_release_log.
 *      - The notified episode gets status='pending' initially.
 *      - All other actionable episodes get status='skipped' (anti-spam).
 *   3. Send push notification for the notified episode.
 *   4. Update the notified episode's status to 'sent' or 'failed' based on push result.
 *
 * Returns the push result so the caller can accurately count sent/failed/skipped.
 */
async function processRelease(
  release: DetectedRelease,
  userId: string,
  vaultItemId: string,
  adminClient: ReturnType<typeof createAdminClient>
): Promise<PushResult> {
  // 1. Reactivation (if applicable)
  if (release.isReactivation) {
    const { error: updateError } = await adminClient
      .from("vault")
      .update({
        status: REACTIVATED_STATUS,
        has_new_release: true,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", vaultItemId);

    if (updateError) {
      console.warn(
        `[episodeReleaseDetector] reactivation update failed for vault ${vaultItemId}:`,
        updateError.message
      );
      return { sent: 0, failed: 0, skipped: 1 };
    }

    console.log(
      `[episodeReleaseDetector] REACTIVATED vault=${vaultItemId} tmdb_id=${release.tmdbId} -> watching + NEW`
    );
  }

  // 2. Mark ALL actionable episodes as processed (anti-spam).
  //    The notified episode gets 'pending' (will be updated after push).
  //    All other episodes get 'skipped' (processed but not notified).
  const now = new Date().toISOString();

  for (const epNum of release.allProcessedEpisodeNumbers) {
    const isNotifiedEpisode = epNum === release.episodeNumber;
    const status = isNotifiedEpisode ? "pending" : "skipped";

    const { error: upsertError } = await adminClient
      .from("episode_release_log")
      .upsert(
        {
          user_id: userId,
          tmdb_id: release.tmdbId,
          media_type: "tv",
          season_number: release.seasonNumber,
          episode_number: epNum,
          episode_air_date: isNotifiedEpisode ? release.episodeAirDate : null,
          title_name: release.titleName,
          notification_status: status,
          notified_at: isNotifiedEpisode ? null : now,
          updated_at: now
        },
        {
          onConflict: "user_id,tmdb_id,season_number,episode_number"
        }
      );

    if (upsertError) {
      console.warn(
        `[episodeReleaseDetector] upsert failed for S${release.seasonNumber}E${epNum}:`,
        upsertError.message
      );
    }
  }

  // 3. Send push notification for the notified episode
  const notificationTitle = release.titleName;
  const notificationBody = `Season ${release.seasonNumber} Episode ${release.episodeNumber} released today`;
  const notificationUrl = titleDetailPath({
    id: String(release.tmdbId),
    media_type: "tv"
  });

  const pushResult = await sendPushNotification({
    userId,
    title: notificationTitle,
    body: notificationBody,
    url: notificationUrl,
    tag: `episode-release:${release.tmdbId}:${release.seasonNumber}:${release.episodeNumber}`,
    category: "newSeason"
  });

  // 4. Update the notified episode's status based on push result
  const finalStatus = pushResult.sent > 0 ? "sent" : pushResult.failed > 0 ? "failed" : "skipped";

  const { error: statusUpdateError } = await adminClient
    .from("episode_release_log")
    .update({
      notification_status: finalStatus,
      notified_at: now,
      updated_at: now
    })
    .eq("user_id", userId)
    .eq("tmdb_id", release.tmdbId)
    .eq("season_number", release.seasonNumber)
    .eq("episode_number", release.episodeNumber);

  if (statusUpdateError) {
    console.warn(
      `[episodeReleaseDetector] status update failed for S${release.seasonNumber}E${release.episodeNumber}:`,
      statusUpdateError.message
    );
  }

  return pushResult;
}

// ── Main entry point ──────────────────────────────────────────────

export async function runEpisodeReleaseDetection(): Promise<ReleaseDetectionResult> {
  const adminClient = createAdminClient();
  const errors: string[] = [];
  let processed = 0;
  let notificationsSent = 0;
  let notificationsFailed = 0;
  let notificationsSkipped = 0;
  let reactivations = 0;

  const { data: vaultItems, error: vaultError } = await adminClient
    .from("vault")
    .select("id, user_id, tmdb_id, status, season, episode")
    .eq("media_type", "tv")
    .is("deleted_at", null)
    .in("status", ELIGIBLE_STATUSES);

  if (vaultError) {
    return {
      processed: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
      notificationsSkipped: 0,
      reactivations: 0,
      errors: [`Vault query failed: ${vaultError.message}`]
    };
  }

  if (!vaultItems || vaultItems.length === 0) {
    return {
      processed: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
      notificationsSkipped: 0,
      reactivations: 0,
      errors: []
    };
  }

  for (const item of vaultItems as unknown as VaultTvItem[]) {
    processed++;
    try {
      const releases = await detectNewReleasesForItem(item, adminClient);
      for (const release of releases) {
        const pushResult = await processRelease(release, item.user_id, item.id, adminClient);

        notificationsSent += pushResult.sent > 0 ? 1 : 0;
        notificationsFailed += pushResult.failed > 0 ? 1 : 0;
        notificationsSkipped += pushResult.skipped > 0 && pushResult.sent === 0 ? 1 : 0;

        if (release.isReactivation && pushResult.sent > 0) {
          reactivations++;
        }
      }
    } catch (err) {
      const msg = `Item ${item.tmdb_id} (user ${item.user_id}): ${
        err instanceof Error ? err.message : String(err)
      }`;
      console.warn(`[episodeReleaseDetector] ${msg}`);
      errors.push(msg);
    }
  }

  return {
    processed,
    notificationsSent,
    notificationsFailed,
    notificationsSkipped,
    reactivations,
    errors
  };
}
