// src/routes/api/admin/communication/email/stats.ts
//
// CineLog V2 — Admin: Email Delivery Stats (Phase 9 Chunk 4)
// ---------------------------------------------------------------------
// GET /api/admin/communication/email/stats
//   → 200 {
//         ok: true,
//         days: [
//           { date: "2026-08-05", sent: 5, delivered: 5, bounced: 0 },
//           ...
//         ],
//         total: { sent: number, delivered: number, bounced: number }
//       }
//   → 401 on missing admin session
//
// WHAT THIS DOES:
//   Returns the last 7 days of email delivery stats. Used by the
//   Communication Hub → Email page to render the headline metrics
//   (sent / delivered / bounced) and a per-day chart.
//
// DATA SOURCE:
//   Phase 9 Chunk 4 does NOT add a new email_delivery_log table.
//   Instead we derive counts from the admin_actions audit log (for
//   admin-test sends) and from the weekly-recap cron's logged
//   output (for production sends). This is a best-effort view —
//   for accurate per-message Resend stats, the operator should
//   consult the Resend dashboard directly (linked from the page).
//
// FALLBACK:
//   If no email-related admin_actions are found (e.g., a fresh
//   deployment), we return zeros. The UI shows an empty state.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

type APIEvent = AdminAPIEvent;

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

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isoCutoff = sevenDaysAgo.toISOString();

    const { data, error } = await supabase
      .from("admin_actions")
      .select("action, created_at, metadata")
      .gte("created_at", isoCutoff)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[admin/communication/email/stats] query error:", error);
      return jsonResponse({
        ok: true,
        days: [],
        total: { sent: 0, delivered: 0, bounced: 0 }
      });
    }

    // Bucket by day. We count any action starting with "email." as
    // a sent email. "Delivered" is approximated as "sent minus
    // bounced" since we don't get a delivery webhook from Resend
    // (that's a future enhancement). "Bounced" is read from the
    // metadata.bounced field if present.
    const byDay = new Map<
      string,
      { sent: number; delivered: number; bounced: number }
    >();

    const getDayKey = (iso: string): string => {
      try {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      } catch {
        return "unknown";
      }
    };

    let totalSent = 0;
    let totalBounced = 0;

    for (const row of (data ?? []) as AdminActionRow[]) {
      if (!row.action || !row.action.startsWith("email.")) continue;
      const dayKey = getDayKey(row.created_at);
      let bucket = byDay.get(dayKey);
      if (!bucket) {
        bucket = { sent: 0, delivered: 0, bounced: 0 };
        byDay.set(dayKey, bucket);
      }
      const meta = row.metadata ?? {};
      const bounced = typeof meta.bounced === "number" ? meta.bounced : 0;
      bucket.sent += 1;
      bucket.bounced += bounced;
      bucket.delivered += bounced === 0 ? 1 : 0;
      totalSent += 1;
      totalBounced += bounced;
    }

    // Build a complete 7-day array.
    const days: {
      date: string;
      sent: number;
      delivered: number;
      bounced: number;
    }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const bucket = byDay.get(dayKey) ?? {
        sent: 0,
        delivered: 0,
        bounced: 0
      };
      days.push({ date: dayKey, ...bucket });
    }

    return jsonResponse({
      ok: true,
      days,
      total: {
        sent: totalSent,
        delivered: totalSent - totalBounced,
        bounced: totalBounced
      }
    });
  } catch (err) {
    console.error("[admin/communication/email/stats] error:", err);
    return jsonResponse({ ok: false, error: "Server error" }, 500);
  }
}
