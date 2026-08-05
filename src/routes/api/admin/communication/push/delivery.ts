// src/routes/api/admin/communication/push/delivery.ts
//
// CineLog V2 — Admin: Push Delivery Stats (Phase 9 Chunk 4)
// ---------------------------------------------------------------------
// GET /api/admin/communication/push/delivery
//   → 200 {
//         ok: true,
//         days: [
//           { date: "2026-08-05", sent: 12, failed: 1 },
//           ...
//         ]
//       }
//   → 401 on missing admin session
//
// WHAT THIS DOES:
//   Returns the last 7 days of push delivery stats (sent / failed
//   per day). Used by the Communication Hub → Push page to render
//   the delivery bar chart.
//
// DATA SOURCE:
//   Phase 9 Chunk 4 does NOT add a new push_delivery_log table —
//   instead we derive the counts from the admin_actions audit log,
//   which already records every /api/push/send and
//   /api/push/send-admin call. We filter by action prefix
//   "push.send" and extract the result from the metadata JSON.
//
// FALLBACK:
//   If the admin_actions table doesn't have push send entries
//   (e.g., a fresh deployment with no sends yet), we return an
//   empty days array. The UI shows an empty state.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

interface APIEvent extends AdminAPIEvent {}

interface AdminActionRow {
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function GET(event: APIEvent) {
  const admin = await requireAdmin(event);
  if (!admin.ok) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createAdminClient();

    // Fetch admin_actions with push-related action names from the
    // last 7 days. We don't filter at the DB level beyond date
    // because the action field has multiple push-related values
    // (push.send, push.send-admin, etc.).
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isoCutoff = sevenDaysAgo.toISOString();

    const { data, error } = await supabase
      .from("admin_actions")
      .select("action, created_at, metadata")
      .gte("created_at", isoCutoff)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[admin/communication/push/delivery] query error:", error);
      return jsonResponse({ ok: true, days: [] });
    }

    // Bucket by day and count sent/failed.
    // We look for actions starting with "push." and read the
    // sent/failed counts from the metadata JSON.
    const byDay = new Map<string, { sent: number; failed: number }>();

    const getDayKey = (iso: string): string => {
      try {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      } catch {
        return "unknown";
      }
    };

    for (const row of (data ?? []) as AdminActionRow[]) {
      if (!row.action || !row.action.startsWith("push.")) continue;
      const dayKey = getDayKey(row.created_at);
      let bucket = byDay.get(dayKey);
      if (!bucket) {
        bucket = { sent: 0, failed: 0 };
        byDay.set(dayKey, bucket);
      }
      const meta = row.metadata ?? {};
      const sent = typeof meta.sent === "number" ? meta.sent : 0;
      const failed = typeof meta.failed === "number" ? meta.failed : 0;
      bucket.sent += sent;
      bucket.failed += failed;
    }

    // Build a complete 7-day array (fill missing days with zeros).
    const days: { date: string; sent: number; failed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const bucket = byDay.get(dayKey) ?? { sent: 0, failed: 0 };
      days.push({ date: dayKey, ...bucket });
    }

    return jsonResponse({ ok: true, days });
  } catch (err) {
    console.error("[admin/communication/push/delivery] error:", err);
    return jsonResponse({ ok: false, error: "Server error" }, 500);
  }
}
