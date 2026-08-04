// src/routes/api/cron/weekly-recap.ts
//
// CineLog V2 — Weekly Recap Cron Job (Server-Only)
// ---------------------------------------------------------------------
// POST /api/cron/weekly-recap
//   Headers: { X-Cron-Secret: <CRON_SECRET> }
//   Body (optional): { day?: number }  // override "today" for testing
//   → 200 { processed: number, sent: number, skipped: number, errors: string[] }
//
// WHAT THIS DOES:
//   1. Determines the target day (default: today's day-of-week, 0=Sun..6=Sat).
//   2. Calls get_users_for_weekly_recap(target_day) to find all users
//      who should receive a recap today.
//   3. For each user:
//      a. Queries their vault activity from the past 7 days:
//         - Titles completed (status='completed' AND updated_at >= cutoff)
//         - Titles rated (rating IS NOT NULL AND updated_at >= cutoff)
//         - Titles added (created_at >= cutoff)
//      b. Fetches the highest-rated title's name from tmdb_cache.
//      c. Generates a recap message.
//      d. Inserts a notification row into the notifications table.
//      e. Calls /api/push/send-admin to deliver a push notification
//         to all the user's subscribed devices.
//      f. Marks weekly_recap_last_sent = now() to prevent duplicates.
//   4. Returns a summary.
//
// SCHEDULING:
//   This endpoint is invoked by pg_cron every Monday at 09:00 UTC
//   (see migration 20260803_add_weekly_recap_preferences.sql for the
//   cron.schedule call). It can also be invoked manually for testing
//   by POSTing with the CRON_SECRET header.
//
// WHY A SOLIDSTART ROUTE (not a Supabase Edge Function):
//   The codebase deliberately uses SolidStart API routes for all
//   server-side logic (see /api/push/send.ts:39-43 for the rationale).
//   This keeps the build pipeline unified and lets us reuse the
//   existing admin client + web-push setup.
//
// ERROR HANDLING:
//   Each user is processed independently — a failure for one user
//   (e.g. vault query fails, push send fails) does NOT abort the
//   whole job. Errors are collected and returned in the response.
//   The weekly_recap_last_sent is only updated on SUCCESS, so a
//   failed user will be retried on the next cron run (within the
//   6-day grace period).

import { isServer } from "solid-js/web";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import { renderEmailTemplate } from "~/lib/email/renderer";

interface APIEvent {
  request: Request;
}

interface RecapUser {
  user_id: string;
  display_name: string;
  username: string;
}

interface VaultActivityRow {
  id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  status: string;
  rating: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface TmdbCacheRow {
  tmdb_id: number;
  media_type: "movie" | "tv";
  data: unknown;
}

interface UserActivity {
  completed: number;
  rated: number;
  added: number;
  highestRated: {
    tmdb_id: number;
    media_type: "movie" | "tv";
    rating: number;
    title: string;
  } | null;
}

interface RecapResult {
  userId: string;
  username: string;
  activity: UserActivity;
  message: string;
  pushSent: number;
  pushFailed: number;
  emailSent: boolean;
  emailSuppressed: boolean;
  error: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Constant-time secret comparison (prevents timing attacks) ────────

function secretsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    nodeTimingSafeEqual(bufA, bufA); // keep timing constant
    return false;
  }
  return nodeTimingSafeEqual(bufA, bufB);
}

// ─── Helpers ──────────────────────────────────────────────────────────

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday"
];

/**
 * Extract the title from a TMDB cache row's `data` JSON.
 * TMDB stores movies with `title` and TV shows with `name`.
 * Falls back to "Untitled" if neither is present.
 */
function extractTitle(data: unknown): string {
  if (!data || typeof data !== "object") return "Untitled";
  const obj = data as Record<string, unknown>;
  const title = obj.title;
  const name = obj.name;
  if (typeof title === "string" && title.length > 0) return title;
  if (typeof name === "string" && name.length > 0) return name;
  return "Untitled";
}

/**
 * Compute the user's vault activity for the past 7 days.
 *
 * Definitions:
 *   - "completed": vault rows with status='completed' AND updated_at >= cutoff
 *     (We use updated_at because completed_at is nullable and only set in
 *     some flows. updated_at is bumped by the trigger whenever status changes.)
 *   - "rated": vault rows with rating IS NOT NULL AND updated_at >= cutoff
 *   - "added": vault rows with created_at >= cutoff (new entries this week)
 *
 * We fetch all vault rows updated in the past 7 days in a single query
 * and compute the three counts client-side. This is more efficient than
 * three separate queries.
 */
async function getUserActivity(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<UserActivity> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const { data, error } = (await adminClient
    .from("vault")
    .select(
      "id, tmdb_id, media_type, status, rating, created_at, updated_at, completed_at"
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("updated_at", cutoff.toISOString())) as {
    data: VaultActivityRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(`vault query failed: ${error.message}`);
  }

  const rows = data ?? [];

  const completed = rows.filter((r) => r.status === "completed").length;
  const rated = rows.filter((r) => r.rating !== null).length;
  const added = rows.filter(
    (r) => new Date(r.created_at) >= cutoff
  ).length;

  // Find the highest-rated title among those rated this week.
  const ratedRows = rows
    .filter((r) => r.rating !== null && r.rating > 0)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const topRow = ratedRows[0] ?? null;

  let highestRated: UserActivity["highestRated"] = null;
  if (topRow) {
    // Fetch the title from tmdb_cache.
    const { data: cacheRow } = (await adminClient
      .from("tmdb_cache")
      .select("tmdb_id, media_type, data")
      .eq("tmdb_id", topRow.tmdb_id)
      .eq("media_type", topRow.media_type)
      .maybeSingle()) as {
      data: TmdbCacheRow | null;
      error: { message: string } | null;
    };

    highestRated = {
      tmdb_id: topRow.tmdb_id,
      media_type: topRow.media_type,
      rating: topRow.rating ?? 0,
      title: cacheRow ? extractTitle(cacheRow.data) : "Untitled",
    };
  }

  return { completed, rated, added, highestRated };
}

/**
 * Build the recap message body from the user's activity.
 *
 * The message is plain text (no markdown) so it renders cleanly in:
 *   - The notifications table (rendered as plain text in the UI)
 *   - The push notification body (plain text)
 *
 * If the user had no activity, we still send a friendly nudge.
 */
function generateRecapMessage(
  activity: UserActivity,
  displayName: string
): string {
  const firstName = displayName.split(" ")[0] || displayName;
  const parts: string[] = [];

  if (activity.completed > 0) {
    parts.push(
      `You completed ${activity.completed} title${activity.completed === 1 ? "" : "s"} this week.`
    );
  }
  if (activity.rated > 0) {
    parts.push(
      `You rated ${activity.rated} title${activity.rated === 1 ? "" : "s"}.`
    );
  }
  if (activity.added > 0) {
    parts.push(
      `You added ${activity.added} title${activity.added === 1 ? "" : "s"} to your vault.`
    );
  }
  if (activity.highestRated) {
    parts.push(
      `Your highest rated: ${activity.highestRated.title} (${activity.highestRated.rating}/10).`
    );
  }

  if (parts.length === 0) {
    return `Hi ${firstName} — no activity this week. Ready to discover something new? Your watchlist is waiting.`;
  }

  return `Hi ${firstName} — here's your week:\n\n${parts.join("\n")}`;
}

/**
 * Insert a notification row for the user.
 * Uses the admin client (service-role) to bypass RLS — the cron job
 * has no user session, so it can't insert via the browser client.
 */
async function insertRecapNotification(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  title: string,
  message: string
): Promise<void> {
  const { error } = await adminClient.from("notifications").insert({
    user_id: userId,
    title,
    message,
    type: "weekly_recap",
    is_read: false,
  });

  if (error) {
    throw new Error(`notification insert failed: ${error.message}`);
  }
}

/**
 * Send a push notification to all the user's devices via the admin
 * push endpoint. We call /api/push/send-admin as an internal HTTP
 * request (not a direct function call) so the endpoint's VAPID
 * config + CRON_SECRET auth is reused.
 *
 * The URL is built from the request's own host header so this works
 * in both production and preview environments.
 */
async function sendRecapPush(
  request: Request,
  cronSecret: string,
  userId: string,
  title: string,
  body: string
): Promise<{ sent: number; failed: number }> {
  // Build the URL to /api/push/send-admin on the same host.
  const url = new URL("/api/push/send-admin", request.url).toString();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": cronSecret,
      },
      body: JSON.stringify({
        userId,
        title,
        body,
        tag: "weekly-recap",
        url: "/upcoming",
        // Phase 6 Task 3 — pass the category so /api/push/send-admin
        // can skip users who have opted out of "weeklyRecap" via their
        // notifPrefs. The category check is fail-open: if the user
        // has no preferences row yet, the send proceeds.
        category: "weeklyRecap",
      }),
    });

    if (!response.ok) {
      const errBody = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        errBody?.error ?? `HTTP ${response.status}`
      );
    }

    const data = (await response.json()) as { sent?: number; failed?: number };
    return {
      sent: data.sent ?? 0,
      failed: data.failed ?? 0,
    };
  } catch (err) {
    throw new Error(
      `push send failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Send the weekly recap email as a FALLBACK when push delivery failed
 * (or the user has no push subscription). Phase 2 — Task 15.
 *
 * We call /api/email/send as an internal HTTP request (same pattern
 * as sendRecapPush) so the endpoint's preference check + rate-limit
 * + Resend integration is reused. The cron authenticates via
 * CRON_SECRET, which lets /api/email/send bypass the user-session
 * auth requirement and the per-user rate limit (the cron only sends
 * one email per week per user, so the rate limit doesn't apply).
 *
 * We need the user's email address to send the email. We look it up
 * from auth.users via the admin client (the cron has no user session,
 * so we can't read it from the request).
 *
 * Returns { sent, suppressed }:
 *   - sent: true if the email was sent (or mocked — RESEND_API_KEY missing)
 *   - suppressed: true if the user has email notifications disabled
 *
 * Both fields are non-fatal — the in-app notification row was already
 * inserted by insertRecapNotification, so the user will see the recap
 * in their feed regardless of whether the email was sent.
 */
async function sendRecapEmail(
  request: Request,
  cronSecret: string,
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  activity: UserActivity,
  title: string,
  message: string
): Promise<{ sent: boolean; suppressed: boolean }> {
  // Look up the user's email from auth.users. The admin client can
  // read auth.users via the auth.admin API.
  let userEmail: string | null = null;
  try {
    const { data: userRecord, error: userErr } =
      await adminClient.auth.admin.getUserById(userId);
    if (userErr || !userRecord?.user?.email) {
      // No email on file — can't send the email. Not an error.
      return { sent: false, suppressed: false };
    }
    userEmail = userRecord.user.email;
  } catch (err) {
    console.warn(
      `[api/cron/weekly-recap] Failed to fetch email for user ${userId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return { sent: false, suppressed: false };
  }

  // Render the email HTML. We map the cron's UserActivity shape to
  // the renderer's WeeklyRecapActivity shape (they're structurally
  // identical, but the cron's highestRated has extra fields the
  // email template doesn't need).
  const html = renderEmailTemplate("weekly_recap", {
    activity: {
      completed: activity.completed,
      rated: activity.rated,
      added: activity.added,
      highestRated: activity.highestRated
        ? {
            title: activity.highestRated.title,
            rating: activity.highestRated.rating,
          }
        : null,
    },
  });

  // Build the URL to /api/email/send on the same host.
  const url = new URL("/api/email/send", request.url).toString();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": cronSecret,
      },
      body: JSON.stringify({
        to: userEmail,
        subject: title,
        html,
        text: message,
        userId,
        notificationType: "weekly_recap",
        // Bypass the per-user rate limit — the cron only sends one
        // email per week per user, so the rate limit doesn't apply.
        bypassRateLimit: true,
      }),
    });

    const result = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      mock?: boolean;
      suppressed?: boolean;
      error?: string;
    };

    if (!response.ok) {
      console.warn(
        `[api/cron/weekly-recap] Email send failed for user ${userId}:`,
        result.error ?? `HTTP ${response.status}`
      );
      return { sent: false, suppressed: false };
    }

    return {
      sent: Boolean(result.success),
      suppressed: Boolean(result.suppressed),
    };
  } catch (err) {
    console.warn(
      `[api/cron/weekly-recap] Email send threw for user ${userId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return { sent: false, suppressed: false };
  }
}

// ─── POST handler ─────────────────────────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  // ─── Authenticate via CRON_SECRET ──────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(
      "[api/cron/weekly-recap] CRON_SECRET env var is not set."
    );
    return jsonResponse(
      { error: "Server misconfigured: CRON_SECRET not set." },
      500
    );
  }

  const providedSecret =
    event.request.headers.get("x-cron-secret") ?? "";
  const authHeader = event.request.headers.get("authorization") ?? "";
  const bearerSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  const secret = providedSecret || bearerSecret;
  if (!secret || !secretsEqual(secret, cronSecret)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ─── Determine target day ───────────────────────────────────────────
  // Default: today's day-of-week (0=Sun..6=Sat).
  // Allow override via body.day for testing.
  let body: { day?: unknown } = {};
  try {
    body = (await event.request.json()) as { day?: unknown };
  } catch {
    // Empty body is fine — use today.
  }

  let targetDay: number;
  if (
    typeof body.day === "number" &&
    Number.isInteger(body.day) &&
    body.day >= 0 &&
    body.day <= 6
  ) {
    targetDay = body.day;
  } else {
    targetDay = new Date().getDay();
  }

  console.info(
    `[api/cron/weekly-recap] Starting weekly recap for day=${targetDay} (${DAY_NAMES[targetDay]}).`
  );

  // ─── Fetch eligible users ───────────────────────────────────────────
  const adminClient = createAdminClient();
  const { data: users, error: usersError } = (await adminClient.rpc(
    "get_users_for_weekly_recap",
    { target_day: targetDay }
  )) as {
    data: RecapUser[] | null;
    error: { message: string } | null;
  };

  if (usersError) {
    console.error(
      "[api/cron/weekly-recap] get_users_for_weekly_recap failed:",
      usersError.message
    );
    return jsonResponse(
      { error: "Failed to fetch users for recap.", details: usersError.message },
      500
    );
  }

  if (!users || users.length === 0) {
    console.info(
      "[api/cron/weekly-recap] No users to recap today. Done."
    );
    return jsonResponse({
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: [],
      day: DAY_NAMES[targetDay],
    });
  }

  console.info(
    `[api/cron/weekly-recap] Processing ${users.length} user(s).`
  );

  // ─── Process each user ──────────────────────────────────────────────
  const results: RecapResult[] = [];
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      const activity = await getUserActivity(adminClient, user.user_id);
      const message = generateRecapMessage(activity, user.display_name);
      const title = "Your Weekly CineLog Recap";

      // Insert the notification row first (always succeeds if no error).
      await insertRecapNotification(
        adminClient,
        user.user_id,
        title,
        message
      );

      // Send push (may fail silently — the in-app notification is the
      // primary delivery channel; push is a bonus).
      let pushSent = 0;
      let pushFailed = 0;
      try {
        const pushResult = await sendRecapPush(
          event.request,
          cronSecret,
          user.user_id,
          title,
          message
        );
        pushSent = pushResult.sent;
        pushFailed = pushResult.failed;
      } catch (pushErr) {
        // Push failure is non-fatal — the notification row was already
        // inserted. Log and continue.
        console.warn(
          `[api/cron/weekly-recap] Push failed for user ${user.user_id}:`,
          pushErr instanceof Error ? pushErr.message : String(pushErr)
        );
      }

      // ─── Email fallback (Phase 2 — Task 15) ──────────────────────
      // If push delivered 0 notifications (user has no subscriptions,
      // or all subscriptions were dead endpoints), try sending an
      // email instead. The email endpoint re-checks the user's email
      // prefs (emailEnabled + emailWeeklyRecap) server-side, so a
      // user who has disabled email won't receive one.
      //
      // We don't trigger the email if push succeeded — the user
      // already got the recap via push, no need to double-deliver.
      let emailSent = false;
      let emailSuppressed = false;
      if (pushSent === 0) {
        try {
          const emailResult = await sendRecapEmail(
            event.request,
            cronSecret,
            adminClient,
            user.user_id,
            activity,
            title,
            message
          );
          emailSent = emailResult.sent;
          emailSuppressed = emailResult.suppressed;
        } catch (emailErr) {
          // Email failure is non-fatal — the in-app notification row
          // was already inserted. Log and continue.
          console.warn(
            `[api/cron/weekly-recap] Email fallback failed for user ${user.user_id}:`,
            emailErr instanceof Error ? emailErr.message : String(emailErr)
          );
        }
      }

      // Mark as sent (prevents duplicate recaps for 6 days).
      const { error: markError } = (await adminClient.rpc(
        "mark_weekly_recap_sent",
        { target_user_id: user.user_id }
      )) as { error: { message: string } | null };

      if (markError) {
        throw new Error(
          `mark_weekly_recap_sent failed: ${markError.message}`
        );
      }

      sent += 1;
      results.push({
        userId: user.user_id,
        username: user.username,
        activity,
        message,
        pushSent,
        pushFailed,
        emailSent,
        emailSuppressed,
        error: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`user ${user.user_id} (${user.username}): ${msg}`);
      skipped += 1;
      console.error(
        `[api/cron/weekly-recap] Failed for user ${user.user_id} (${user.username}):`,
        msg
      );
    }
  }

  console.info(
    `[api/cron/weekly-recap] Done. Sent=${sent}, Skipped=${skipped}, Errors=${errors.length}.`
  );

  return jsonResponse({
    processed: users.length,
    sent,
    skipped,
    errors,
    day: DAY_NAMES[targetDay],
    // Include per-user details for debugging (omit in production if
    // this becomes too verbose).
    details: results.map((r) => ({
      userId: r.userId,
      username: r.username,
      completed: r.activity.completed,
      rated: r.activity.rated,
      added: r.activity.added,
      pushSent: r.pushSent,
      pushFailed: r.pushFailed,
      emailSent: r.emailSent,
      emailSuppressed: r.emailSuppressed,
    })),
  });
}

// Reject GET / other methods.
export async function GET(): Promise<Response> {
  return jsonResponse(
    { error: "GET not supported. Use POST with X-Cron-Secret header." },
    405
  );
}
