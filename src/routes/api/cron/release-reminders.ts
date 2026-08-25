//
// CineLog V2 — Release Reminder Cron Job
// ---------------------------------------------------------------------
// POST /api/cron/release-reminders
//
// Called by Supabase pg_cron/pg_net. It does not require a user session:
// the endpoint is protected by the same CRON_SECRET that is already set on
// the Vercel project. It claims each due reminder before sending so two
// overlapping cron invocations cannot normally deliver the same reminder.
// A short claim lease lets a later run recover if a function instance dies
// after claiming but before completing delivery.
//
// The job deliberately uses the release_date stored on user_reminders. The
// browser writes the real movie release date and the configured lead-adjusted
// date for TV episodes. User-local calendar dates are applied only when
// deciding whether a stored date is due.

import { isServer } from "solid-js/web";
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { relatedTitleDetailPath } from "~/shared/utils/titleRoutes";

interface APIEvent {
  request: Request;
}

export interface ReminderRow {
  id: string;
  user_id: string;
  tmdb_id: string;
  title_type: "movie" | "series";
  title_name: string | null;
  poster_path: string | null;
  release_date: string;
  notification_sent: boolean;
  notification_claimed_at?: string | null;
}

interface ProfileRow {
  id: string;
  timezone: string | null;
  deleted_at: string | null;
}

interface PushResult {
  sent?: number;
  failed?: number;
  skipped?: number;
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

function getPresentedSecret(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return (request.headers.get("x-cron-secret") ?? "").trim();
}

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  return secretsEqual(getPresentedSecret(request), expected);
}

export function localDateString(timezone: string | null | undefined): string {
  const safeTimezone = timezone || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function posterUrl(posterPath: string | null): string | undefined {
  if (!posterPath) return undefined;
  if (/^https?:\/\//i.test(posterPath)) return posterPath;
  if (!posterPath.startsWith("/")) return undefined;
  return `https://image.tmdb.org/t/p/w342${posterPath}`;
}

function titleName(
  reminder: Pick<ReminderRow, "title_name">
): string {
  const name = reminder.title_name?.trim();
  return name || "Your tracked title";
}

export function buildNotification(reminder: Pick<ReminderRow, "id" | "tmdb_id" | "title_type" | "title_name" | "poster_path">) {
  const name = titleName(reminder);
  const poster = posterUrl(reminder.poster_path);
  return {
    title: `${name} is out today`,
    body: `Tap to open ${name} in CineLog.`,
    url: relatedTitleDetailPath(reminder.tmdb_id, reminder.title_type),
    tag: `release-reminder-${reminder.id}`,
    icon: poster ?? "/favicon.ico",
    badge: "/favicon.ico",
    image: poster,
    requireInteraction: true
  };
}

async function sendPush(
  request: Request,
  cronSecret: string,
  reminder: ReminderRow
): Promise<{ ok: boolean; result: PushResult }> {
  const endpoint = new URL("/api/push/send-admin", request.url).toString();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": cronSecret
      },
      body: JSON.stringify({
        userId: reminder.user_id,
        ...buildNotification(reminder)
      })
    });
    const result = (await response.json().catch(() => ({}))) as PushResult;
    return { ok: response.ok, result };
  } catch {
    return { ok: false, result: { failed: 1 } };
  }
}

async function claimReminder(
  adminClient: ReturnType<typeof createAdminClient>,
  reminderId: string
): Promise<ReminderRow | null> {
  const { data, error } = await adminClient.rpc(
    "claim_due_user_reminder" as never,
    { p_reminder_id: reminderId } as never
  );
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as ReminderRow;
}

async function releaseClaim(
  adminClient: ReturnType<typeof createAdminClient>,
  reminderId: string
): Promise<void> {
  await adminClient
    .from("user_reminders")
    .update({ notification_claimed_at: null })
    .eq("id", reminderId)
    .eq("notification_sent", false);
}

async function markDelivered(
  adminClient: ReturnType<typeof createAdminClient>,
  reminder: ReminderRow
): Promise<boolean> {
  const { error } = await adminClient
    .from("user_reminders")
    .update({ notification_sent: true, notification_claimed_at: null })
    .eq("id", reminder.id)
    .eq("notification_sent", false);
  if (error) return false;

  const notification = buildNotification(reminder);
  await adminClient.from("notifications").insert({
    user_id: reminder.user_id,
    title: notification.title,
    message: notification.body,
    type: "reminder",
    related_title_id: reminder.tmdb_id,
    related_title_type: reminder.title_type,
    scheduled_for: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    is_read: false
  });
  return true;
}

export async function POST(event: APIEvent): Promise<Response> {
  if (!isAuthorized(event.request)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  const adminClient = createAdminClient();

  const { data: reminders, error: reminderError } = await adminClient
    .from("user_reminders")
    .select(
      "id, user_id, tmdb_id, title_type, title_name, poster_path, release_date, notification_sent, notification_claimed_at"
    )
    .eq("is_scheduled", true)
    .eq("notification_sent", false)
    .limit(1000);
  if (reminderError) {
    console.error("[release-reminders] reminder query failed:", reminderError);
    return jsonResponse({ error: "Reminder query failed" }, 500);
  }

  const rows = (reminders ?? []) as ReminderRow[];
  if (rows.length === 0) {
    return jsonResponse({ processed: 0, sent: 0, skipped: 0, failed: 0 });
  }

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles, error: profileError } = await adminClient
    .from("profiles")
    .select("id, timezone, deleted_at")
    .in("id", userIds)
    .limit(1000);
  if (profileError) {
    console.error("[release-reminders] profile query failed:", profileError);
    return jsonResponse({ error: "Profile query failed" }, 500);
  }

  const profilesById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile])
  );
  const due = rows.filter((row) => {
    const profile = profilesById.get(row.user_id);
    if (!profile || profile.deleted_at) return false;
    return row.release_date <= localDateString(profile.timezone);
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const candidate of due) {
    const reminder = await claimReminder(adminClient, candidate.id);
    if (!reminder) {
      skipped++;
      continue;
    }

    const push = await sendPush(event.request, cronSecret, reminder);
    const delivered = push.ok && (push.result.sent ?? 0) > 0;
    if (delivered && (await markDelivered(adminClient, reminder))) {
      sent++;
    } else {
      await releaseClaim(adminClient, reminder.id);
      if ((push.result.sent ?? 0) === 0 && (push.result.failed ?? 0) === 0) {
        skipped++;
      } else {
        failed++;
      }
    }
  }

  return jsonResponse({
    processed: due.length,
    sent,
    skipped,
    failed
  });
}
