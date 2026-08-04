// src/routes/api/push/send.ts
//
// CineLog V2 — Web Push Send Endpoint (Server-Only)
// ---------------------------------------------------------------------
// POST /api/push/send
//   Body: {
//     userId: string,            // the recipient's profile id
//     title: string,             // notification title
//     body?: string,             // notification body (default "")
//     url?: string,              // click-through URL (default "/")
//     tag?: string,              // notification tag (default "default")
//     icon?: string,             // icon URL (default "/favicon.ico")
//     badge?: string             // badge URL (default "/favicon.ico")
//   }
//   → 200 { sent: number, failed: number }  on success
//   → 400 on validation error
//   → 401 on missing session
//   → 403 on userId mismatch (caller can only send to themselves)
//   → 500 on server error
//   → 503 if VAPID keys are not configured
//
// WHAT THIS DOES:
//   1. Validates the caller's session (via access_token in body or
//      the Supabase cookie).
//   2. Verifies that the caller's uid matches the `userId` in the body
//      — a user can only send push notifications to their OWN devices,
//      never to another user's. This is the security boundary.
//   3. Reads the user's quiet-hours preference from the DB (server-
//      side enforcement, so a malicious client can't bypass it by
//      editing localStorage).
//   4. Fetches all of the user's push_subscriptions rows.
//   5. Filters out expired subscriptions.
//   6. Calls web-push.sendNotification() for each subscription.
//   7. If sendNotification fails with a 404/410 (endpoint no longer
//      valid), deletes the row from push_subscriptions so we don't
//      keep trying to send to a dead endpoint.
//   8. Returns the count of successful + failed sends.
//
// WHY A SERVERLESS FUNCTION (not a Supabase Edge Function):
//   CineLog is a SolidStart app on Vercel — serverless functions are
//   the natural fit. The web-push npm package is pure JS and runs
//   fine in a Vercel Node.js function. Supabase Edge Functions use
//   Deno, which would require a separate build pipeline.
//
// QUIET HOURS (Phase 1 audit carry-over):
//   The browser-side `fireDueBrowserNotifications` already checks
//   quiet hours via `isInQuietHours()`. But the server endpoint is
//   also called from non-reminder paths (e.g. test notifications sent
//   from the settings page), so we re-enforce quiet hours here using
//   the DB-stored preference (prefs_json on user_preferences).
//   Test notifications (tag === "test") bypass quiet hours — the user
//   explicitly requested a test, so we honor it.
//
// SECURITY:
//   • The VAPID private key is read from process.env.VAPID_PRIVATE_KEY
//     and NEVER reaches the browser bundle.
//   • The Supabase service-role key is used to read push_subscriptions
//     so we can fetch all rows for a user in one query (RLS would
//     otherwise restrict us to the caller's own rows, which is fine
//     here since we ARE the caller — but using the service-role client
//     avoids the per-row auth.uid() check overhead on a hot path).
//   • Rate-limited per user: max 30 sends per minute. A user firing
//     more than 30 notifications/min is almost certainly a bug.

import { createClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";
import webPush from "web-push";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";
import { checkAndIncrement } from "~/lib/server/rateLimiter";

interface APIEvent {
  request: Request;
}

interface SendRequestBody {
  userId?: unknown;
  title?: unknown;
  body?: unknown;
  url?: unknown;
  tag?: unknown;
  icon?: unknown;
  badge?: unknown;
  accessToken?: unknown;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expires_at: string | null;
}

// ─── Rate limiter (per user, DB-backed) ─────────────────────────────
//
// Replaces the previous in-memory Map that was a no-op on Vercel
// serverless (cold starts reset the Map). Now backed by the
// `rate_limit_buckets` table via the service-role client.
//
// Tracks the count of sends in the current 1-minute window. After
// 30 sends/minute, further sends are rejected with 429.
//
// Fails OPEN on DB error — a Supabase outage shouldn't block users
// from receiving notifications.

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Check whether the user's quiet hours are currently active, using
 * the prefs stored in user_preferences.prefs_json.
 *
 * The prefs_json column stores the same shape as the browser's
 * notifPrefs signal: { quietHoursEnabled, quietHoursStart, quietHoursEnd,
 * ... }. We read it via the service-role client (RLS would restrict
 * us to the caller's own row, which is fine here, but using the
 * service-role avoids an extra auth step).
 *
 * Returns false if quiet hours is disabled OR if the prefs row is
 * missing (no preferences set yet — default to "not in quiet hours").
 */
async function isUserInQuietHours(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await adminClient
      .from("user_preferences")
      .select("prefs_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data?.prefs_json) return false;

    const prefs = data.prefs_json as {
      quietHoursEnabled?: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
    };

    if (!prefs.quietHoursEnabled) return false;
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

    // Parse the start/end times (HH:MM) and compute the current
    // minute-of-day. Same algorithm as the client-side isInQuietHours.
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = prefs.quietHoursStart.split(":").map(Number);
    const [eh, em] = prefs.quietHoursEnd.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;

    if (start === end) return false;
    if (start < end) {
      return cur >= start && cur < end;
    }
    // wraps midnight
    return cur >= start || cur < end;
  } catch {
    // On any error, default to NOT in quiet hours (fail-open for the
    // user — better to send a notification they didn't want than to
    // suppress one they did).
    return false;
  }
}

// ─── Configure web-push once (cached on the module) ─────────────────
//
// web-push.setVapidDetails() is idempotent and cheap, but we cache
// the "configured" flag so we can return a clear 503 if the env vars
// are missing without re-reading them on every request.

let vapidConfigured = false;
let vapidConfigError: string | null = null;

function configureVapid(): void {
  if (vapidConfigured) return;

  // Trim whitespace and strip surrounding quotes — Vercel's dashboard
  // sometimes preserves surrounding quotes if the user pastes them,
  // which would cause setVapidDetails() to throw "Invalid key size".
  const rawPublic = process.env.VAPID_PUBLIC_KEY;
  const rawPrivate = process.env.VAPID_PRIVATE_KEY;
  let publicKey = rawPublic ? rawPublic.trim() : "";
  let privateKey = rawPrivate ? rawPrivate.trim() : "";
  if (
    (publicKey.startsWith('"') && publicKey.endsWith('"')) ||
    (publicKey.startsWith("'") && publicKey.endsWith("'"))
  ) {
    publicKey = publicKey.slice(1, -1).trim();
  }
  if (
    (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
    (privateKey.startsWith("'") && privateKey.endsWith("'"))
  ) {
    privateKey = privateKey.slice(1, -1).trim();
  }

  if (!publicKey || !privateKey) {
    vapidConfigError =
      "VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY env var is not set. " +
      "Generate with: npx web-push generate-vapid-keys --json";
    vapidConfigured = true; // don't re-check on next call
    return;
  }

  // The "mailto:" contact is required by the Web Push spec — it gives
  // the push service a way to contact the sender if there's a problem.
  // The value MUST be a valid URL: either a mailto: URL or an https URL.
  // If the admin set VAPID_CONTACT_EMAIL to a bare email (e.g.
  // "admin@example.com" without the "mailto:" prefix), normalize it by
  // prepending "mailto:" — otherwise webPush.setVapidDetails() throws
  // "Vapid subject is not a valid URL".
  const rawContact =
    process.env.VAPID_CONTACT_EMAIL ?? "admin@cinelog.app";
  let contact: string;
  if (
    rawContact.startsWith("mailto:") ||
    rawContact.startsWith("https://") ||
    rawContact.startsWith("http://")
  ) {
    contact = rawContact;
  } else if (rawContact.includes("@")) {
    // Bare email — prepend mailto:
    contact = `mailto:${rawContact}`;
  } else {
    // Not an email and not a URL — use the default. The admin probably
    // set the env var to something invalid; the default is safer than
    // letting setVapidDetails() throw.
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

// ─── POST handler ───────────────────────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  if (event.request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ─── Configure VAPID ────────────────────────────────────────────
  configureVapid();
  if (vapidConfigError) {
    console.error("[api/push/send] VAPID not configured:", vapidConfigError);
    return jsonResponse(
      { error: "Push notifications are not configured on the server." },
      503
    );
  }

  // ─── Parse + validate body ──────────────────────────────────────
  let body: SendRequestBody;
  try {
    body = (await event.request.json()) as SendRequestBody;
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

  const notifBody =
    typeof body.body === "string" ? body.body : "";
  const url = typeof body.url === "string" ? body.url : "/";
  const tag = typeof body.tag === "string" ? body.tag : "default";
  const icon = typeof body.icon === "string" ? body.icon : "/favicon.ico";
  const badge = typeof body.badge === "string" ? body.badge : "/favicon.ico";

  // ─── Resolve the access token ───────────────────────────────────
  // Same pattern as /api/account/delete: the browser client stores
  // sessions in localStorage (not cookies), so we accept the access
  // token in the body. Fall back to the cookie for cookie-based
  // sessions.
  const cookieHeader = event.request.headers.get("cookie") ?? "";
  const accessToken =
    typeof body.accessToken === "string" && body.accessToken.length > 0
      ? body.accessToken
      : getSupabaseAccessToken(cookieHeader);

  if (!accessToken) {
    return jsonResponse(
      { error: "No active session. Please sign in first." },
      401
    );
  }

  // ─── Verify the session ─────────────────────────────────────────
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[api/push/send] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
    );
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } =
    await verifyClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return jsonResponse(
      { error: "Your session has expired. Please sign in again." },
      401
    );
  }

  const callerUid = userData.user.id;

  // ─── Authorization check ────────────────────────────────────────
  // The caller can only send push notifications to THEIR OWN devices.
  // This is the security boundary — without it, any signed-in user
  // could spam push notifications to any other user.
  if (callerUid !== userId) {
    return jsonResponse(
      { error: "You can only send push notifications to yourself." },
      403
    );
  }

  // ─── Rate limit ─────────────────────────────────────────────────
  const rateLimitResult = await checkAndIncrement("pushSend", callerUid);
  if (!rateLimitResult.allowed) {
    return jsonResponse(
      {
        error: "Too many notifications sent in the last minute. Please wait."
      },
      429
    );
  }

  // ─── Quiet hours gate (server-side enforcement) ─────────────────
  // Test notifications (tag === "test") bypass quiet hours — the user
  // explicitly requested a test from the settings page.
  const adminClient = createAdminClient();
  if (tag !== "test") {
    const inQuietHours = await isUserInQuietHours(adminClient, callerUid);
    if (inQuietHours) {
      // Return success with sent=0 — the caller doesn't need to know
      // it was suppressed (avoid leaking whether the user has quiet
      // hours enabled). The reminder will be retried on the next page
      // load after the quiet window ends.
      return jsonResponse({ sent: 0, failed: 0, suppressed: true });
    }
  }

  // ─── Fetch all push subscriptions for the user ──────────────────
  const { data: subs, error: subsError } = (await adminClient
    .from("push_subscriptions")
    .select("id, user_id, endpoint, keys, expires_at")
    .eq("user_id", callerUid)) as {
    data: PushSubscriptionRow[] | null;
    error: { message: string } | null;
  };

  if (subsError) {
    console.error(
      "[api/push/send] Failed to fetch subscriptions:",
      subsError.message
    );
    return jsonResponse(
      { error: "Failed to fetch push subscriptions." },
      500
    );
  }

  if (!subs || subs.length === 0) {
    return jsonResponse({ sent: 0, failed: 0 });
  }

  // ─── Filter out expired subscriptions ───────────────────────────
  // Subscriptions with an expires_at in the past are dead — the push
  // service will return 410 Gone. Delete them and skip sending.
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

  // Delete expired subscriptions in one batch.
  if (expiredEndpoints.length > 0) {
    try {
      await adminClient
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    } catch (err) {
      // Non-fatal — log and continue. The send will still go to the
      // valid subscriptions.
      console.warn("[api/push/send] Failed to clean up expired subs:", err);
    }
  }

  if (validSubs.length === 0) {
    return jsonResponse({ sent: 0, failed: 0 });
  }

  // ─── Send to each subscription ──────────────────────────────────
  const payload = JSON.stringify({
    title,
    body: notifBody,
    url,
    tag,
    icon,
    badge,
  });

  let sent = 0;
  let failed = 0;
  const deadEndpoints: string[] = [];

  await Promise.all(
    validSubs.map(async (sub) => {
      try {
        // web-push accepts the subscription in the shape returned by
        // PushManager.subscribe(). We reconstruct that shape from our
        // DB row.
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys,
        } as webPush.PushSubscription;

        await webPush.sendNotification(pushSubscription, payload);
        sent += 1;
      } catch (err) {
        failed += 1;
        // web-push errors carry a statusCode. 404/410 mean the endpoint
        // is gone forever — delete the row so we stop trying.
        const statusCode =
          err instanceof Error && "statusCode" in err
            ? (err as unknown as { statusCode: number }).statusCode
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          deadEndpoints.push(sub.endpoint);
        } else {
          // 429 (rate limited by push service), 400 (bad request),
          // etc. — log but don't delete. The next send attempt may
          // succeed.
          console.warn(
            `[api/push/send] sendNotification failed for endpoint ${sub.endpoint}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    })
  );

  // ─── Clean up dead endpoints ────────────────────────────────────
  if (deadEndpoints.length > 0) {
    try {
      await adminClient
        .from("push_subscriptions")
        .delete()
        .in("endpoint", deadEndpoints);
    } catch (err) {
      console.warn(
        "[api/push/send] Failed to clean up dead endpoints:",
        err
      );
    }
  }

  return jsonResponse({ sent, failed });
}

// Reject GET / other methods.
export async function GET(): Promise<Response> {
  return jsonResponse(
    { error: "GET not supported. Use POST with a JSON body." },
    405
  );
}
