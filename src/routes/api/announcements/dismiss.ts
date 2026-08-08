// src/routes/api/announcements/dismiss.ts
//
// CineLog V2 — Announcement Dismissal Endpoint (Phase 9 Chunk 4)
// ---------------------------------------------------------------------
// POST /api/announcements/dismiss
//   Body: { announcementId: string }
//   → 200 { ok: true }                on success (ALWAYS returns 200,
//                                       even on duplicate / unknown id,
//                                       so the UI never blocks on
//                                       dismissal)
//   → 400 on missing announcementId
//
// WHAT THIS DOES:
//   Records a single dismissal of an announcement. Used by the
//   consumer AnnouncementsBanner / Toast / Modal components when
//   the user clicks the X button.
//
// AUTH:
//   • If the caller has a valid Supabase session, the dismissal is
//     recorded with their profile_id.
//   • If the caller is anonymous (guest), the dismissal is recorded
//     with a sha256 hash of (IP + User-Agent). This lets us dedupe
//     per-browser without storing PII.
//
// IDEMPOTENT:
//   The endpoint does NOT enforce uniqueness on
//   (announcement_id, profile_id) or (announcement_id, guest_hash)
//   because:
//     1. The client already filters dismissed announcements via
//        localStorage (24h cache) — repeated calls within 24h are
//        already prevented client-side.
//     2. After 24h, the same user dismissing again is a valid new
//        signal (the announcement was re-shown and re-dismissed).
//   The admin stats endpoint counts DISTINCT (profile_id, guest_hash)
//   per announcement, so duplicate rows don't inflate the count.
//
// NON-BLOCKING:
//   The consumer dismiss() function fires this as a fire-and-forget
//   beacon — if the network fails, the dismissal is still applied
//   client-side (localStorage) so the UI is responsive. We return
//   200 even on errors so the consumer doesn't log scary warnings.

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

interface APIEvent {
  request: Request;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(event: APIEvent) {
  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      announcementId?: unknown;
    };

    if (
      typeof body.announcementId !== "string" ||
      !body.announcementId.trim()
    ) {
      return jsonResponse({ ok: false, error: "announcementId is required" }, 400);
    }

    const announcementId = body.announcementId.trim();

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey) {
      // Server misconfiguration — return ok so the UI doesn't break.
      return jsonResponse({ ok: true });
    }

    // Try to identify the caller via their Supabase session.
    // We use the anon client + access_token from the Authorization
    // header (the standard CineLog client pattern).
    const authHeader = event.request.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    let profileId: string | null = null;

    if (accessToken) {
      try {
        const authClient = createClient(supabaseUrl, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        const { data: userData } = await authClient.auth.getUser(accessToken);
        if (userData.user) {
          profileId = userData.user.id;
        }
      } catch {
        // Ignore — treat as guest.
      }
    }

    // Compute guest_hash for anonymous callers.
    let guestHash: string | null = null;
    if (!profileId) {
      const ip =
        event.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        event.request.headers.get("x-real-ip") ||
        "unknown";
      const ua = event.request.headers.get("user-agent") || "unknown";
      guestHash = createHash("sha256")
        .update(`${ip}|${ua}`)
        .digest("hex");
    }

    // Insert via service role (the anon client can't insert with
    // profile_id set unless RLS recognizes auth.uid() — and we want
    // to support both authenticated and anon inserts uniformly).
    if (serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      await adminClient.from("announcement_dismissals").insert({
        announcement_id: announcementId,
        profile_id: profileId,
        guest_hash: guestHash
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[announcements/dismiss] error:", err);
    // Return ok so the UI doesn't break — dismissal is best-effort.
    return jsonResponse({ ok: true });
  }
}
