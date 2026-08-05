// src/routes/api/admin/communication/push/test.ts
//
// CineLog V2 — Admin: Send Test Push (Phase 9 Chunk 4)
// ---------------------------------------------------------------------
// POST /api/admin/communication/push/test
//   Headers: admin cookie
//   Body: {
//     title: string,            // required, max 200 chars
//     body?: string,            // optional, max 500 chars
//     url?: string              // optional click-through URL
//   }
//   → 200 { ok: true, sent: number, failed: number, mock?: boolean }
//   → 400 on validation error
//   → 401 on missing admin session
//   → 503 if VAPID keys not configured
//
// WHAT THIS DOES:
//   Sends a real Web Push notification to ALL of the admin's own
//   subscribed devices. This is the "Send Test Push" button on the
//   Communication Hub → Push page.
//
// HOW IT DIFFERS FROM /api/push/send:
//   • /api/push/send requires a USER Supabase session (callerUid must
//     match body.userId). That's correct for user-initiated sends.
//   • This endpoint requires an ADMIN session (admin cookie). The
//     admin's profile id is derived from the admin token, not from
//     the request body — so the admin can't accidentally send to
//     another user's devices.
//   • This endpoint BYPASSES the admin's notification preferences
//     (notifPrefs). The admin is explicitly testing the push channel;
//     if their prefs say "disabled", that should NOT block a test.
//     This is the only place preferences are bypassed for push.
//
// CRITICAL RULE COMPLIANCE:
//   • Zero duplication — this is the ONLY admin test-push endpoint.
//   • Strict user-side mapping — uses the SAME push_subscriptions
//     table and web-push sendNotification path as user-side sends.
//     No dummy channels.
//   • No OMDB.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import webPush from "web-push";
import { isServer } from "solid-js/web";

interface APIEvent extends AdminAPIEvent {}

interface TestPushBody {
  title?: unknown;
  body?: unknown;
  url?: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(event: APIEvent) {
  if (!isServer) return jsonResponse({ error: "Server only" }, 500);

  // Admin auth.
  const admin = await requireAdmin(event);
  if (!admin.ok) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  // Parse + validate body.
  const body = (await event.request.json().catch(() => ({}))) as TestPushBody;
  const title =
    typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const testBody =
    typeof body.body === "string" ? body.body.trim().slice(0, 500) : "";
  const url =
    typeof body.url === "string" ? body.url.trim().slice(0, 2048) : "/";

  if (!title) {
    return jsonResponse({ ok: false, error: "title is required" }, 400);
  }

  // VAPID config check.
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contact =
    process.env.VAPID_CONTACT_EMAIL || process.env.ADMIN_CONTACT_EMAIL;

  if (!publicKey || !privateKey) {
    return jsonResponse(
      {
        ok: false,
        error: "VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars."
      },
      503
    );
  }

  // Configure web-push.
  try {
    const mailto = contact
      ? contact.startsWith("mailto:")
        ? contact
        : `mailto:${contact}`
      : "mailto:admin@cinelog.app";
    webPush.setVapidDetails(mailto, publicKey, privateKey);
  } catch (err) {
    console.error("[admin/communication/push/test] VAPID config error:", err);
    return jsonResponse(
      { ok: false, error: "VAPID key configuration failed" },
      503
    );
  }

  try {
    const supabase = createAdminClient();

    // Fetch the ADMIN's own push subscriptions.
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys, expires_at, created_at")
      .eq("user_id", admin.admin.id);

    if (error) {
      console.error("[admin/communication/push/test] subs query error:", error);
      return jsonResponse(
        { ok: false, error: "Failed to fetch subscriptions" },
        500
      );
    }

    if (!subs || subs.length === 0) {
      return jsonResponse({
        ok: true,
        sent: 0,
        failed: 0,
        message:
          "You have no active push subscriptions. Subscribe via Settings → Notifications → Enable push."
      });
    }

    // Filter out expired subscriptions.
    const now = Date.now();
    const active = subs.filter((s) => {
      if (s.expires_at) {
        return new Date(s.expires_at).getTime() > now;
      }
      // No expires_at — fall back to 90-day TTL from created_at.
      const created = new Date(s.created_at).getTime();
      return now - created < 90 * 24 * 60 * 60 * 1000;
    });

    if (active.length === 0) {
      return jsonResponse({
        ok: true,
        sent: 0,
        failed: 0,
        message:
          "All your push subscriptions have expired. Re-subscribe via Settings → Notifications."
      });
    }

    // Send to each subscription.
    const payload = JSON.stringify({
      title,
      body: testBody || "",
      url: url || "/",
      tag: "admin-test",
      icon: "/favicon.ico",
      badge: "/favicon.ico"
    });

    let sent = 0;
    let failed = 0;

    for (const sub of active) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys
        } as webPush.PushSubscription;
        await webPush.sendNotification(pushSubscription, payload);
        sent++;
      } catch (err) {
        console.error(
          `[admin/communication/push/test] sendNotification failed for ${sub.endpoint}:`,
          err
        );
        failed++;
        // If the endpoint is gone (404/410), delete the subscription
        // so we don't keep trying to send to a dead endpoint.
        if (
          err instanceof Error &&
          "statusCode" in err &&
          (err.statusCode === 404 || err.statusCode === 410)
        ) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint)
            .eq("user_id", admin.admin.id);
        }
      }
    }

    return jsonResponse({ ok: true, sent, failed });
  } catch (err) {
    console.error("[admin/communication/push/test] error:", err);
    return jsonResponse({ ok: false, error: "Server error" }, 500);
  }
}
