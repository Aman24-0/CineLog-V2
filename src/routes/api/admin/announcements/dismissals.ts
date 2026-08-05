// src/routes/api/admin/announcements/dismissals.ts
//
// CineLog V2 — Admin: Announcement Dismissal Stats (Phase 9 Chunk 4)
// ---------------------------------------------------------------------
// GET /api/admin/announcements/dismissals
//   → 200 { ok: true, counts: { [announcementId: string]: number } }
//   → 401 on missing admin session
//   → 500 on server error
//
// WHAT THIS DOES:
//   Returns the count of UNIQUE dismissers per announcement. Used by
//   the admin Communication Hub → Announcements page to show "X
//   dismissals" next to each row.
//
// "UNIQUE" DEFINITION:
//   A single user dismissing the same announcement 3 times counts
//   as 1 dismissal. We dedupe via:
//     • DISTINCT(profile_id) for authenticated users
//     • DISTINCT(guest_hash) for guests
//   Since the dismissals table enforces that exactly one of
//   (profile_id, guest_hash) is non-null per row, we can sum the
//   two distinct counts per announcement.
//
// SUPABASE RPC:
//   We could do this as a single SQL query, but Supabase's PostgREST
//   doesn't expose a "count distinct by group" operation directly.
//   We fetch raw rows (announcement_id + profile_id + guest_hash)
//   and dedupe in JS. The dataset is small (dismissals are bounded
//   by user count × announcement count) so this is fine.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

interface APIEvent extends AdminAPIEvent {}

interface DismissalRow {
  announcement_id: string;
  profile_id: string | null;
  guest_hash: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function GET(event: APIEvent) {
  // Auth: admin cookie required.
  const admin = await requireAdmin(event);
  if (!admin.ok) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createAdminClient();

    // Fetch all dismissal rows. We only need the dedup keys + the
    // announcement_id. If the table doesn't exist yet (migration
    // not applied), this returns an error and we fall back to
    // empty counts — the admin UI shows "—" in that case.
    const { data, error } = await supabase
      .from("announcement_dismissals")
      .select("announcement_id, profile_id, guest_hash");

    if (error) {
      // Table likely doesn't exist yet — return empty counts.
      return jsonResponse({ ok: true, counts: {} });
    }

    // Dedupe: for each announcement, count distinct (profile_id) +
    // distinct (guest_hash). A user dismissing twice = 1 dismissal.
    // A guest dismissing twice = 1 dismissal. A user + a guest
    // dismissing = 2 dismissals.
    const byAnnouncement = new Map<
      string,
      { users: Set<string>; guests: Set<string> }
    >();

    for (const row of (data ?? []) as DismissalRow[]) {
      let bucket = byAnnouncement.get(row.announcement_id);
      if (!bucket) {
        bucket = { users: new Set(), guests: new Set() };
        byAnnouncement.set(row.announcement_id, bucket);
      }
      if (row.profile_id) {
        bucket.users.add(row.profile_id);
      } else if (row.guest_hash) {
        bucket.guests.add(row.guest_hash);
      }
    }

    const counts: Record<string, number> = {};
    for (const [id, bucket] of byAnnouncement) {
      counts[id] = bucket.users.size + bucket.guests.size;
    }

    return jsonResponse({ ok: true, counts });
  } catch (err) {
    console.error("[admin/announcements/dismissals] error:", err);
    return jsonResponse({ ok: false, error: "Server error" }, 500);
  }
}
