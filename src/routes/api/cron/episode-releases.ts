// src/routes/api/cron/episode-releases.ts
//
// CineLog V2 — Episode Release Detection Cron Job (Server-Only)
// ---------------------------------------------------------------------
// POST /api/cron/episode-releases
//   Headers: { X-Cron-Secret: <CRON_SECRET> }
//   → 200 { processed, notificationsSent, reactivations, errors }
//
// Called by Supabase pg_cron/pg_net (or Vercel Cron). Protected by
// the same CRON_SECRET used by the existing release-reminders and
// weekly-recap cron jobs.
//
// WHAT THIS DOES:
//   1. Fetches all vault TV items with status 'watching' or 'completed'.
//   2. For each item, checks TMDB for newly released episodes.
//   3. For 'completed' titles with a new season: auto-reactivates to
//      'watching' + sets has_new_release = true (NEW badge).
//   4. Sends push notifications via /api/push/send-admin with
//      category: "newSeason" (respects user notification preferences).
//   5. Records each notification in episode_release_log (dedup table)
//      to prevent duplicate notifications across multiple cron runs.
//
// SCHEDULING:
//   This endpoint should be called by pg_cron every 6 hours (4x daily)
//   to catch new episode releases promptly without excessive API usage.
//   Example pg_cron schedule:
//     SELECT cron.schedule(
//       'episode-releases',
//       '0 */6 * * *',
//       $$SELECT net.http_post(
//         url := 'https://cinelog.app/api/cron/episode-releases',
//         headers := jsonb_build_object(
//           'Content-Type', 'application/json',
//           'X-Cron-Secret', current_setting('app.cron_secret')
//         ),
//         body := '{}'::jsonb
//       )$$
//     );
//
// ERROR HANDLING:
//   Each vault item is processed independently — a failure for one
//   item (TMDB fetch fails, season fetch fails) does NOT abort the
//   whole job. Errors are collected and returned in the response.

import { isServer } from "solid-js/web";
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import { runEpisodeReleaseDetection } from "~/server/notifications/episodeReleaseDetector";

interface APIEvent {
  request: Request;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function secretsEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    nodeTimingSafeEqual(aBuffer, aBuffer);
    return false;
  }
  return nodeTimingSafeEqual(aBuffer, bBuffer);
}

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  const presented =
    auth.startsWith("Bearer ")
      ? auth.slice("Bearer ".length).trim()
      : (request.headers.get("x-cron-secret") ?? "").trim();
  return secretsEqual(presented, expected);
}

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) return jsonResponse({ error: "Server only" }, 500);

  if (!isAuthorized(event.request)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await runEpisodeReleaseDetection();
    console.log(
      `[cron/episode-releases] processed=${result.processed} ` +
        `sent=${result.notificationsSent} ` +
        `failed=${result.notificationsFailed} ` +
        `skipped=${result.notificationsSkipped} ` +
        `reactivations=${result.reactivations} ` +
        `errors=${result.errors.length}`
    );
    return jsonResponse(result);
  } catch (err) {
    console.error("[cron/episode-releases] fatal error:", err);
    return jsonResponse(
      { error: "Internal server error", details: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}

export async function GET(): Promise<Response> {
  return jsonResponse({ error: "Use POST" }, 405);
}
