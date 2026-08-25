// src/routes/api/push/send-admin.ts
//
// CineLog V2 — Admin Push Send Endpoint (Server-Only)
// ---------------------------------------------------------------------
// POST /api/push/send-admin
//   Headers: { X-Cron-Secret: <CRON_SECRET> }
//   Body: {
//     userId: string,            // the recipient's profile id
//     title: string,             // notification title
//     body?: string,             // notification body (default "")
//     url?: string,              // click-through URL (default "/")
//     tag?: string,              // notification tag (default "default")
//     icon?: string,             // icon URL (default "/favicon.ico")
//     badge?: string,            // badge URL (default "/favicon.ico")
//     image?: string,            // large poster/artwork URL
//     requireInteraction?: bool  // keep high-priority reminders visible
//     category?: PushCategory    // Phase 6 Task 3 — per-category opt-in
//   }
//   → 200 { sent: number, failed: number, skipped: number }  on success
//   → 401 on missing/invalid CRON_SECRET
//   → 400 on validation error
//   → 503 if VAPID keys are not configured
//
// WHAT THIS DOES:
//   Sends a Web Push notification to ALL of a user's subscribed devices.
//   This is the "server → user" send path used by the weekly recap
//   cron job (and future automated notifications).
//
// HOW IT DIFFERS FROM /api/push/send:
//   • /api/push/send requires the caller to be the recipient (callerUid
//     must match body.userId). This is correct for user-initiated sends
//     (test notifications, manual reminders).
//   • /api/push/send-admin allows the server to send to ANY user. This
//     is needed for automated notifications (weekly recap, admin
//     announcements, etc.) where there's no user session.
//   • Authentication is via a shared CRON_SECRET env var, not a user
//     session. The secret must be set on Vercel and in the pg_cron
//     job's HTTP request header.
//
// PHASE 6 TASK 3 — PER-CATEGORY OPT-IN:
//   The request body may include a `category` field identifying which
//   notification category the send belongs to (e.g. "weeklyRecap",
//   "newSeason"). When `category` is provided, the endpoint looks up
//   the user's per-category preference from
//   `user_preferences.prefs_json.notifPrefs` and SKIPS the send if the
//   user has opted out of that category. The response includes a
//   `skipped` count so the caller can distinguish "delivered" from
//   "suppressed by user preference".
//
//   When `category` is omitted (or an unknown value), the send proceeds
//   unconditionally — backward compatibility for callers that haven't
//   been updated yet. This is a deliberate fail-open: we'd rather
//   over-deliver to a user who forgot to toggle a category off than
//   silently suppress a notification they expected.
//
// SECURITY:
//   • The CRON_SECRET env var gates access. Only the cron job (and
//     server-side code with access to the env var) can call this.
//   • The VAPID private key is read from process.env.VAPID_PRIVATE_KEY
//     and NEVER reaches the browser bundle.
//   • No rate limit — the cron job runs once per week and sends to
//     all eligible users. Per-user rate limiting would block legitimate
//     recap sends.
//   • Quiet hours are NOT enforced here — the weekly recap runs at
//     the user's configured day/time, which is by definition the right
//     time to send. (If we add quiet-hours enforcement later, it would
//     suppress the recap entirely, which is not what the user wants.)
//
// See /api/push/send.ts for the user-initiated send path.

import { isServer } from "solid-js/web";
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import webPush from "web-push";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import {
  CINELOG_NOTIFICATION_BADGE,
  CINELOG_NOTIFICATION_ICON
} from "~/shared/constants/notificationAssets";

interface APIEvent {
  request: Request;
}

/**
 * Phase 6 Task 3 — The set of notification categories the user can
 * opt in / out of via `notifPrefs`. These match the keys on the
 * `NotificationPrefs` interface in `core/preferences/notifications.ts`.
 *
 * The string values are stable identifiers used in the `category`
 * field of the request body and in `prefs_json.notifPrefs`.
 */
type PushCategory =
  | "newSeason"
  | "continueWatching"
  | "weeklyRecap"
  | "recommendations"
  | "syncStatus";

const VALID_CATEGORIES: ReadonlySet<PushCategory> = new Set([
  "newSeason",
  "continueWatching",
  "weeklyRecap",
  "recommendations",
  "syncStatus"
]);

interface SendAdminRequestBody {
  userId?: unknown;
  title?: unknown;
  body?: unknown;
  url?: unknown;
  tag?: unknown;
  icon?: unknown;
  badge?: unknown;
  image?: unknown;
  requireInteraction?: unknown;
  /** Phase 6 Task 3 — per-category opt-in check. */
  category?: unknown;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expires_at: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ─── VAPID configuration (cached on the module) ──────────────────────
//
// Same logic as /api/push/send.ts — duplicated rather than imported
// because the send.ts module caches state in module-level variables
// and we want this endpoint to be independent (so a bug in send.ts
// doesn't break the admin path).

let vapidConfigured = false;
let vapidConfigError: string | null = null;

/**
 * Trim whitespace and strip a single pair of surrounding quotes
 * (either single or double) from an env var value. Vercel's dashboard
 * sometimes preserves surrounding quotes if the user pastes them.
 */
function stripQuotes(raw: string | undefined, dq: string, sq: string): string {
  if (!raw) return "";
  let v = raw.trim();
  if (
    (v.startsWith(dq) && v.endsWith(dq)) ||
    (v.startsWith(sq) && v.endsWith(sq))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Constant-time string comparison to prevent timing attacks on the
 * CRON_SECRET. Node's `crypto.timingSafeEqual` requires Buffers, so
 * we wrap it. If the lengths differ, we still do a comparison (against
 * the longer string) to keep the timing constant — the result is
 * already known to be false in that case.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    nodeTimingSafeEqual(bufA, bufA); // keep timing constant
    return false;
  }
  return nodeTimingSafeEqual(bufA, bufB);
}

function configureVapid(): void {
  if (vapidConfigured) return;

  const rawPublic = process.env.VAPID_PUBLIC_KEY;
  const rawPrivate = process.env.VAPID_PRIVATE_KEY;
  // Strip whitespace and surrounding quotes. We use String.fromCharCode
  // to avoid quote-escaping issues in string literals (TS was mangling
  // the mixed single and double quotes).
  const DQ = String.fromCharCode(34); // double quote
  const SQ = String.fromCharCode(39); // single quote
  const publicKey = stripQuotes(rawPublic, DQ, SQ);
  const privateKey = stripQuotes(rawPrivate, DQ, SQ);

  if (!publicKey || !privateKey) {
    vapidConfigError =
      "VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY env var is not set.";
    vapidConfigured = true;
    return;
  }

  // Normalize the contact email — web-push requires a mailto: or https:
  // URL. Auto-prepend mailto: to bare emails.
  const rawContact = process.env.VAPID_CONTACT_EMAIL ?? "admin@cinelog.app";
  let contact: string;
  if (
    rawContact.startsWith("mailto:") ||
    rawContact.startsWith("https://") ||
    rawContact.startsWith("http://")
  ) {
    contact = rawContact;
  } else if (rawContact.includes("@")) {
    contact = `mailto:${rawContact}`;
  } else {
    contact = "mailto:admin@cinelog.app";
  }

  try {
    webPush.setVapidDetails(contact, publicKey, privateKey);
    vapidConfigError = null;
  } catch (err) {
    vapidConfigError =
      "Failed to configure VAPID: " +
      (err instanceof Error ? err.message : String(err));
  }
  vapidConfigured = true;
}

// ─── Phase 6 Task 3: per-category opt-in check ──────────────────────
//
// The user's per-category preferences are stored in
// `user_preferences.prefs_json.notifPrefs` (mirrored from the browser's
// localStorage by `preferencesSync.ts`). The shape matches the
// `NotificationPrefs` interface:
//
//   {
//     newSeason: boolean,
//     continueWatching: boolean,
//     weeklyRecap: boolean,
//     recommendations: boolean,
//     syncStatus: boolean,
//     ... (quiet hours, email prefs, etc.)
//   }
//
// `true` means the user has opted IN to that category. When the field
// is missing (older snapshots), we default to opted-IN — same fail-open
// rationale as the rest of the endpoint. The browser-side default
// (`DEFAULT_NOTIF_PREFS`) has most categories ON, so this matches the
// user's expected initial state.
//
// We read via the service-role admin client because:
//   1. There's no user session (this endpoint is called by the cron).
//   2. RLS on user_preferences restricts reads to the owner, which
//      would block the server from checking the preference. The
//      service-role bypasses RLS — same pattern as the existing
//      `isUserInQuietHours` helper in /api/push/send.ts.
async function isCategoryOptedIn(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  category: PushCategory
): Promise<boolean> {
  try {
    const { data, error } = await adminClient
      .from("user_preferences")
      .select("prefs_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data?.prefs_json) {
      // No preferences row yet — fail open (deliver). The user hasn't
      // explicitly opted out, so we honor the send.
      return true;
    }

    // prefs_json is stored as JSONB. The shape is the full
    // PreferencesSnapshot (see preferencesSync.ts) — we only care
    // about the notifPrefs sub-object.
    const snapshot = data.prefs_json as {
      notifPrefs?: Record<string, unknown>;
    };
    const prefs = snapshot.notifPrefs;
    if (!prefs || typeof prefs !== "object") {
      // No notifPrefs sub-object — fail open.
      return true;
    }

    const value = prefs[category];
    // Explicit `false` → opted out. Anything else (true, undefined,
    // wrong type) → opted in (fail open).
    return value !== false;
  } catch {
    // On any error, fail open — better to deliver than to silently
    // suppress a notification the user expected.
    return true;
  }
}

// ─── POST handler ─────────────────────────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  // ─── Authenticate via CRON_SECRET ──────────────────────────────────
  //
  // The caller must send the secret in the X-Cron-Secret header (or
  // Authorization: Bearer <secret>). This prevents random users from
  // hitting /api/push/send-admin and spamming push notifications.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(
      "[api/push/send-admin] CRON_SECRET env var is not set. " +
        "Generate one with `openssl rand -hex 32` and set it in Vercel."
    );
    return jsonResponse(
      { error: "Server misconfigured: CRON_SECRET not set." },
      500
    );
  }

  const authHeader = event.request.headers.get("authorization") ?? "";
  const xCronHeader = event.request.headers.get("x-cron-secret") ?? "";
  const providedSecret =
    xCronHeader ||
    (authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "");

  // Constant-time comparison to prevent timing attacks.
  if (
    providedSecret.length !== cronSecret.length ||
    !timingSafeEqual(providedSecret, cronSecret)
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ─── Configure VAPID ────────────────────────────────────────────────
  configureVapid();
  if (vapidConfigError) {
    console.error(
      "[api/push/send-admin] VAPID not configured:",
      vapidConfigError
    );
    return jsonResponse(
      { error: "Push notifications are not configured on the server." },
      503
    );
  }

  // ─── Parse + validate body ──────────────────────────────────────────
  let body: SendAdminRequestBody;
  try {
    body = (await event.request.json()) as SendAdminRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return jsonResponse({ error: "Body must be a JSON object" }, 400);
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!userId) {
    return jsonResponse({ error: "Missing userId" }, 400);
  }
  if (!title) {
    return jsonResponse({ error: "Missing title" }, 400);
  }

  const notifBody = typeof body.body === "string" ? body.body : "";
  const url = typeof body.url === "string" ? body.url : "/";
  const tag = typeof body.tag === "string" ? body.tag : "default";
  // Keep the small system identity branded; title artwork belongs in image.
  const icon = CINELOG_NOTIFICATION_ICON;
  const badge = CINELOG_NOTIFICATION_BADGE;
  const image = typeof body.image === "string" ? body.image : undefined;
  const requireInteraction = body.requireInteraction === true;

  // Phase 6 Task 3 — validate the category field. Unknown values are
  // treated as "no category" (the send proceeds unconditionally) so a
  // typo by the caller doesn't accidentally suppress notifications.
  const rawCategory =
    typeof body.category === "string" ? body.category : undefined;
  const category: PushCategory | undefined =
    rawCategory && VALID_CATEGORIES.has(rawCategory as PushCategory)
      ? (rawCategory as PushCategory)
      : undefined;

  // ─── Fetch all push subscriptions for the user ──────────────────────
  const adminClient = createAdminClient();

  // Phase 6 Task 3 — per-category opt-in check. When `category` is
  // provided, look up the user's notifPrefs and skip the send if they
  // opted out of this category. We do this BEFORE the subscription
  // fetch to avoid a wasted query when we're going to skip anyway.
  // Returns `skipped: 1` so the caller can distinguish "suppressed by
  // user preference" from "no subscriptions".
  if (category) {
    const optedIn = await isCategoryOptedIn(adminClient, userId, category);
    if (!optedIn) {
      // The user has explicitly opted out of this category. We return
      // 200 (not 403 or similar) because the request itself was valid
      // — we just chose not to deliver. The `skipped` field tells the
      // caller what happened.
      return jsonResponse({ sent: 0, failed: 0, skipped: 1 });
    }
  }

  const { data: subs, error: subsError } = (await adminClient
    .from("push_subscriptions")
    .select("id, user_id, endpoint, keys, expires_at")
    .eq("user_id", userId)) as {
    data: PushSubscriptionRow[] | null;
    error: { message: string } | null;
  };

  if (subsError) {
    console.error(
      "[api/push/send-admin] Failed to fetch subscriptions:",
      subsError.message
    );
    return jsonResponse({ error: "Failed to fetch push subscriptions." }, 500);
  }

  if (!subs || subs.length === 0) {
    // No subscriptions — user hasn't enabled push on any device.
    // Not an error; the in-app notification row was already inserted
    // by the caller.
    return jsonResponse({ sent: 0, failed: 0, skipped: 0 });
  }

  // ─── Filter out expired subscriptions ───────────────────────────────
  const now = Date.now();
  const validSubs: PushSubscriptionRow[] = [];
  const expiredEndpoints: string[] = [];
  for (const sub of subs) {
    if (sub.expires_at) {
      const expiry = Date.parse(sub.expires_at);
      if (Number.isFinite(expiry) && expiry < now) {
        expiredEndpoints.push(sub.endpoint);
        continue;
      }
    }
    validSubs.push(sub);
  }

  if (expiredEndpoints.length > 0) {
    try {
      await adminClient
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    } catch (err) {
      console.warn(
        "[api/push/send-admin] Failed to clean up expired subs:",
        err
      );
    }
  }

  if (validSubs.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, skipped: 0 });
  }

  // ─── Send to each subscription ──────────────────────────────────────
  const payload = JSON.stringify({
    title,
    body: notifBody,
    url,
    tag,
    icon,
    badge,
    image,
    requireInteraction
  });

  let sent = 0;
  let failed = 0;
  const deadEndpoints: string[] = [];

  await Promise.all(
    validSubs.map(async (sub) => {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys
        } as webPush.PushSubscription;
        await webPush.sendNotification(pushSubscription, payload);
        sent += 1;
      } catch (err) {
        failed += 1;
        const statusCode =
          err instanceof Error && "statusCode" in err
            ? (err as unknown as { statusCode: number }).statusCode
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          deadEndpoints.push(sub.endpoint);
        } else {
          console.warn(
            `[api/push/send-admin] sendNotification failed for endpoint ${sub.endpoint}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    })
  );

  // ─── Clean up dead endpoints ────────────────────────────────────────
  if (deadEndpoints.length > 0) {
    try {
      await adminClient
        .from("push_subscriptions")
        .delete()
        .in("endpoint", deadEndpoints);
    } catch (err) {
      console.warn(
        "[api/push/send-admin] Failed to clean up dead endpoints:",
        err
      );
    }
  }

  return jsonResponse({ sent, failed, skipped: 0 });
}

// Reject GET / other methods.
export async function GET(): Promise<Response> {
  return jsonResponse(
    { error: "GET not supported. Use POST with a JSON body." },
    405
  );
}
