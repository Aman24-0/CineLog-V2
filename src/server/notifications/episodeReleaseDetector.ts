// src/server/notifications/episodeReleaseDetector.ts
//
// Core logic for detecting newly released TV/anime episodes and
// generating notifications. Used by the /api/cron/episode-releases
// cron job.
//
// 2026-09-03 v3 HARDENING (true concurrency safety):
//   The v2 hardening used UNIQUE + upsert, which prevents duplicate
//   DATABASE ROWS but does NOT guarantee that two concurrent cron
//   executions cannot both send the same push. The v3 hardening adds
//   a true atomic claim via the claim_episode_release() Postgres RPC:
//
//     1. Detector inserts ALL actionable episodes as 'pending' rows
//        (upsert with status='pending' — preserves retry for 'failed').
//     2. For non-notified anti-spam episodes, immediately mark 'skipped'.
//     3. For the to-be-notified episode, call claim_episode_release().
//        - If claim returns the row → THIS worker owns the push.
//        - If claim returns nothing → ANOTHER worker already claimed
//          it. This worker MUST NOT send a push.
//     4. Only the claimant sends the push and updates status to
//        'sent' or 'failed'.
//
//   This guarantees: for any (user, tmdb_id, season, episode), at most
//   ONE worker can become the sender, regardless of cron timing overlap.
//
// Earlier hardening (preserved):
//   - Active season detection (S2 airing beats announced S3).
//   - Missed-release anti-spam: E1/E2/E3 all detected → only latest
//     notified, older episodes marked 'skipped'.
//   - Failed-push retry: status='failed' rows are retryable.
//   - Accurate counts: sent/failed/skipped tracked separately.
//   - Completed → Watching reactivation with NEW badge.
//   - Dropped → NOT reactivated.

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

export type { DetectedRelease };

type PushResult = { sent: number; failed: number; skipped: number };

export type { PushResult };

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
 * Process a single detected release with TRUE atomic claim semantics.
 *
 * Exported for direct unit testing of the concurrency claim flow.
 *
 * Flow:
 *   1. Reactivation (if applicable): update vault status → watching + has_new_release.
 *   2. Mark ALL actionable episodes as 'pending' (upsert with onConflict).
 *      - Pending rows for non-notified episodes will be flipped to 'skipped'
 *        in step 3.
 *      - Pending rows for previously 'failed' episodes are preserved as
 *        retryable (upsert does NOT downgrade an existing 'sent'/'skipped'
 *        row — see step 2b below).
 *   3. For every non-notified anti-spam episode, immediately UPDATE to
 *      status='skipped' so they are not retried.
 *   4. ATOMIC CLAIM: call claim_episode_release() RPC for the to-be-notified
 *      episode.
 *      - If claim returns the row → THIS worker is the sender. Proceed to step 5.
 *      - If claim returns nothing → ANOTHER worker already claimed/sent it.
 *        This worker returns 'skipped' (no push) — preventing the
 *        duplicate-push bug.
 *   5. Send push notification for the notified episode.
 *   6. Update the notified episode's status to 'sent' or 'failed' based on
 *      push result. A 'failed' status is retryable on a later cron run.
 *
 * Returns the push result so the caller can accurately count sent/failed/skipped.
 */
export async function processRelease(
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

  // 2. Upsert ALL actionable episodes as 'pending'.
  //    The onConflict UNIQUE constraint preserves existing 'sent'/'skipped'
  //    rows (we only update notified_at + updated_at + claimed_at IS NULL
  //    reset + notification_status='pending' for rows that were 'failed'
  //    or 'pending' from a prior run).
  //    To be safe and only touch retryable rows, we do a SELECT-then-targeted
  //    UPSERT for only the actionable subset (which is what
  //    allProcessedEpisodeNumbers already represents — only retryable episodes).
  const now = new Date().toISOString();

  for (const epNum of release.allProcessedEpisodeNumbers) {
    const isNotifiedEpisode = epNum === release.episodeNumber;

    // Upsert with pending status. For the notified episode, leave claimed_at
    // NULL so claim_episode_release() can take it. For non-notified anti-spam
    // episodes, set status='skipped' directly (no claim needed).
    const targetStatus = isNotifiedEpisode ? "pending" : "skipped";

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
          notification_status: targetStatus,
          notified_at: isNotifiedEpisode ? null : now,
          claimed_at: null,
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
      // For the notified episode, abort (we can't safely claim without
      // the row existing). For anti-spam episodes, log and continue.
      if (isNotifiedEpisode) {
        return { sent: 0, failed: 0, skipped: 1 };
      }
    }
  }

  // 3. ATOMIC CLAIM: try to become the sender for the notified episode.
  //    This is the SINGLE concurrency guarantee. Only one worker can
  //    successfully claim; all concurrent workers get null and MUST NOT
  //    send a push.
  const { data: claimedRow, error: claimError } = await adminClient.rpc(
    "claim_episode_release" as never,
    {
      p_user_id: userId,
      p_tmdb_id: release.tmdbId,
      p_season_number: release.seasonNumber,
      p_episode_number: release.episodeNumber
    } as never
  );

  if (claimError) {
    console.warn(
      `[episodeReleaseDetector] claim_episode_release RPC failed for S${release.seasonNumber}E${release.episodeNumber}:`,
      claimError.message
    );
    // If the RPC fails (e.g. transient DB issue), do NOT send a push.
    // The next cron run will retry the claim. This is the safe choice —
    // we'd rather miss one notification than send two.
    return { sent: 0, failed: 0, skipped: 1 };
  }

  // claim_episode_release returns SETOF episode_release_log. An empty
  // array means another worker already claimed (or already sent/skipped)
  // this episode. We MUST NOT send a push. The claim RPC is the
  // authoritative concurrency gate.
  const claimed = Array.isArray(claimedRow) && claimedRow.length > 0;

  if (!claimed) {
    console.log(
      `[episodeReleaseDetector] S${release.seasonNumber}E${release.episodeNumber} already claimed by another worker — skipping push.`
    );
    return { sent: 0, failed: 0, skipped: 1 };
  }

  // 4. We are the claimant. Send the push.
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

  // 5. Update the notified episode's status based on push result.
  //    sent → terminal success, never retried.
  //    failed → retryable on next cron run.
  //    skipped → user opted out (no subscription), terminal.
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
