// src/server/notifications/episodeReleaseDetector.ts
//
// Core logic for detecting newly released TV/anime episodes and
// generating notifications. Used by the /api/cron/episode-releases
// cron job.
//
// ARCHITECTURE:
//   1. Fetch all vault items with status 'watching' or 'completed'
//      and media_type 'tv' (the only types that can have new episodes).
//   2. For each item, fetch TMDB show details to get seasons list.
//   3. For the latest season, fetch episode list via fetchSeasonDetails.
//   4. Check for episodes with air_date <= today that haven't been
//      logged in episode_release_log (dedup table).
//   5. For 'completed' titles with a NEW season (season_number >
//      user's tracked season): auto-change to 'watching' + set
//      has_new_release = true.
//   6. For 'watching' titles: just send notification.
//   7. Insert dedup records into episode_release_log.
//   8. Send push notifications via /api/push/send-admin.
//
// DEDUP: The episode_release_log table has a UNIQUE constraint on
// (user_id, tmdb_id, season_number, episode_number). An upsert with
// ON CONFLICT DO NOTHING ensures idempotency.
//
// DATE HANDLING: An episode is considered "released" when its air_date
// (YYYY-MM-DD from TMDB) is <= today's date in UTC. TMDB air dates are
// typically midnight UTC on the release day. Using UTC avoids timezone
// ambiguity. This is consistent with CineLog's existing release-reminders
// cron which also uses UTC date comparison.
//
// DROPPED titles are NEVER auto-reactivated. Only 'completed' titles
// are eligible for auto-reactivation to 'watching'.
//
// MISSED RELEASES: If the app was closed for multiple days, the cron
// job will detect ALL released episodes that haven't been notified yet.
// However, for 'completed' titles, only the FIRST released episode of
// a new season triggers reactivation + notification. Subsequent episodes
// in the same run are skipped (they'll be caught in the next cron run
// once the title is 'watching'). For 'watching' titles, only the LATEST
// released episode generates a notification per cron run — earlier
// missed episodes are deduped by the episode_release_log table.
//
// This means: if the user was away for a week and 3 episodes released,
// they get 1 notification (for the latest episode), not 3. This is the
// "sensible notification policy for missed releases" — avoid spamming
// the user with historical notifications.

import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { fetchTmdbMetadata, fetchSeasonDetails } from "~/core/tmdb/tmdb";
import { titleDetailPath } from "~/shared/utils/titleRoutes";
import { CINELOG_NOTIFICATION_ICON } from "~/shared/constants/notificationAssets";
import type { TMDBTitle, TMDBEpisode } from "~/shared/types";

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
}

// ── Constants ─────────────────────────────────────────────────────

const ELIGIBLE_STATUSES = ["watching", "completed"];
const REACTIVATION_STATUS = "completed";
const REACTIVATED_STATUS = "watching";

// ── Helpers ───────────────────────────────────────────────────────

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Check if an episode's air_date indicates it has been released. Exported for testing. */
export function isEpisodeReleased(airDate: string | null | undefined): boolean {
  if (!airDate || typeof airDate !== "string") return false;
  return airDate <= todayUtcDate();
}

async function sendPushNotification(args: {
  userId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  category: string;
}): Promise<{ sent: number; failed: number; skipped: number }> {
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

/**
 * Detect newly released episodes for a single vault TV item.
 *
 * Returns a list of DetectedRelease objects — one per newly released
 * episode that hasn't been notified yet.
 *
 * For 'completed' titles: only the FIRST released episode of a new
 * season is returned (triggers reactivation). Subsequent episodes
 * will be caught in the next cron run once the title is 'watching'.
 *
 * For 'watching' titles: only the LATEST released unnotified episode
 * is returned (avoids spamming missed releases).
 */
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

  // 2. Find seasons with number > 0 (exclude specials). TMDBTitle.seasons
  //    uses TMDBSeason which has season_number.
  const realSeasons = showDetails.seasons
    .filter((s) => s.season_number > 0)
    .sort((a, b) => b.season_number - a.season_number);

  if (realSeasons.length === 0) return [];

  const latestSeason = realSeasons[0]!;
  const userTrackedSeason = item.season ?? 1;

  // For 'completed' titles: only check if the latest season is NEW
  if (item.status === REACTIVATION_STATUS) {
    if (latestSeason.season_number <= userTrackedSeason) {
      return []; // No new season
    }
  }

  // 3. Fetch the latest season's episode list
  let episodes: TMDBEpisode[];
  try {
    const seasonData = await fetchSeasonDetails(
      item.tmdb_id,
      latestSeason.season_number
    );
    episodes = seasonData.episodes ?? [];
  } catch (err) {
    console.warn(
      `[episodeReleaseDetector] season fetch failed for tmdb_id=${item.tmdb_id} season=${latestSeason.season_number}:`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }

  if (episodes.length === 0) return [];

  // 4. Filter to released episodes (air_date <= today, UTC)
  const releasedEpisodes = episodes.filter((ep) =>
    isEpisodeReleased(ep.air_date)
  );

  if (releasedEpisodes.length === 0) return [];

  // 5. Check which episodes haven't been notified yet (dedup)
  const { data: existingLogs, error: logError } = await adminClient
    .from("episode_release_log")
    .select("episode_number")
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

  const notifiedEpisodeNumbers = new Set(
    (existingLogs ?? []).map((r) => r.episode_number as number)
  );

  // 6. Build the list of new releases
  const titleName = showDetails.name ?? showDetails.title ?? "Unknown Title";
  const isReactivation = item.status === REACTIVATION_STATUS;

  // Filter to unnotified released episodes
  const unnotifiedReleases = releasedEpisodes.filter(
    (ep) => !notifiedEpisodeNumbers.has(ep.episode_number)
  );

  if (unnotifiedReleases.length === 0) return [];

  if (isReactivation) {
    // For reactivation: only the FIRST released episode triggers it.
    const firstEp = unnotifiedReleases[0]!;
    results.push({
      tmdbId: item.tmdb_id,
      seasonNumber: latestSeason.season_number,
      episodeNumber: firstEp.episode_number,
      episodeAirDate: firstEp.air_date,
      titleName,
      isReactivation: true
    });
  } else {
    // For 'watching' titles: only notify the LATEST unnotified released
    // episode (avoids spamming missed releases). Earlier missed episodes
    // are deduped by the episode_release_log table.
    const latestEp = unnotifiedReleases[unnotifiedReleases.length - 1]!;
    results.push({
      tmdbId: item.tmdb_id,
      seasonNumber: latestSeason.season_number,
      episodeNumber: latestEp.episode_number,
      episodeAirDate: latestEp.air_date,
      titleName,
      isReactivation: false
    });
  }

  return results;
}

/**
 * Process a single detected release:
 *   1. If reactivation: update vault status to 'watching' + set has_new_release.
 *   2. Insert dedup record into episode_release_log (idempotent).
 *   3. Send push notification.
 */
async function processRelease(
  release: DetectedRelease,
  userId: string,
  vaultItemId: string,
  adminClient: ReturnType<typeof createAdminClient>
): Promise<void> {
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
      return;
    }

    console.log(
      `[episodeReleaseDetector] REACTIVATED vault=${vaultItemId} tmdb_id=${release.tmdbId} -> watching + NEW`
    );
  }

  // 2. Insert dedup record (idempotent — ON CONFLICT DO NOTHING)
  const { error: dedupError } = await adminClient
    .from("episode_release_log")
    .upsert(
      {
        user_id: userId,
        tmdb_id: release.tmdbId,
        media_type: "tv",
        season_number: release.seasonNumber,
        episode_number: release.episodeNumber,
        episode_air_date: release.episodeAirDate,
        title_name: release.titleName,
        notified_at: new Date().toISOString()
      },
      {
        onConflict: "user_id,tmdb_id,season_number,episode_number",
        ignoreDuplicates: true
      }
    );

  if (dedupError) {
    console.warn(
      `[episodeReleaseDetector] dedup insert failed for tmdb_id=${release.tmdbId} S${release.seasonNumber}E${release.episodeNumber}:`,
      dedupError.message
    );
  }

  // 3. Send push notification
  const notificationTitle = release.titleName;
  const notificationBody = `Season ${release.seasonNumber} Episode ${release.episodeNumber} released today`;
  const notificationUrl = titleDetailPath({
    id: String(release.tmdbId),
    media_type: "tv"
  });

  await sendPushNotification({
    userId,
    title: notificationTitle,
    body: notificationBody,
    url: notificationUrl,
    tag: `episode-release:${release.tmdbId}:${release.seasonNumber}:${release.episodeNumber}`,
    category: "newSeason"
  });
}

// ── Main entry point ──────────────────────────────────────────────

/**
 * Run the episode release detection job.
 * Idempotent — running multiple times will not produce duplicate notifications.
 */
export async function runEpisodeReleaseDetection(): Promise<ReleaseDetectionResult> {
  const adminClient = createAdminClient();
  const errors: string[] = [];
  let processed = 0;
  let notificationsSent = 0;
  let reactivations = 0;

  // 1. Fetch all eligible vault items (TV only, watching or completed)
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
      reactivations: 0,
      errors: [`Vault query failed: ${vaultError.message}`]
    };
  }

  if (!vaultItems || vaultItems.length === 0) {
    return { processed: 0, notificationsSent: 0, reactivations: 0, errors: [] };
  }

  // 2. Process each item
  for (const item of vaultItems as unknown as VaultTvItem[]) {
    processed++;
    try {
      const releases = await detectNewReleasesForItem(item, adminClient);
      for (const release of releases) {
        await processRelease(release, item.user_id, item.id, adminClient);
        notificationsSent++;
        if (release.isReactivation) reactivations++;
      }
    } catch (err) {
      const msg = `Item ${item.tmdb_id} (user ${item.user_id}): ${
        err instanceof Error ? err.message : String(err)
      }`;
      console.warn(`[episodeReleaseDetector] ${msg}`);
      errors.push(msg);
    }
  }

  return { processed, notificationsSent, reactivations, errors };
}
