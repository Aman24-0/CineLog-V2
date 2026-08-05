// src/routes/api/admin/services/web-push/cleanup-expired.ts
//
// CineLog V2 — Admin Web Push Cleanup API (Phase 9 Chunk 2)
// ---------------------------------------------------------------------
// POST /api/admin/services/web-push/cleanup-expired
//   → 200 { ok: true, deleted: <number> }
//   → 401 { error: "Unauthorized" }
//   → 500 { error: "..." }
//
// WHAT THIS DOES:
//   Deletes rows from `push_subscriptions` whose `expires_at` is in
//   the past (or null + older than 90 days, since some browsers —
//   Firefox/Mozilla — set a long expiry while Chrome leaves it null).
//   These rows are dead weight: every push send to an expired endpoint
//   comes back as a 410/404 from the browser push service, costing a
//   network round-trip per dead subscription.
//
// WHY THIS IS A SEPARATE ENDPOINT (vs inline in /api/push/send):
//   Push send is in the hot path — we don't want it doing destructive
//   writes. Cleanup is a maintenance operation the admin should
//   trigger explicitly from the Web Push Services Hub page (or via a
//   future cron). Keeping it separate also means we can audit-log it
//   without polluting the push-send audit trail.
//
// AUDIT:
//   Yes — one logAdminAction row per call, with the deleted count in
//   the payload. This is a destructive operation; we want a paper
//   trail.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

interface APIEvent extends AdminAPIEvent {}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(event: APIEvent): Promise<Response> {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Rate-limit: 1 cleanup per minute per admin. The operation is
  // idempotent and fast, but we don't want a misbehaving admin client
  // to churn the table.
  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "web-push.cleanup-expired"
  );
  if (rateLimited) return rateLimited;

  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    // 90 days ago — fallback cutoff for rows with null expires_at
    // (Chrome never sets expirationTime, so we treat anything older
    // than 90d as stale). 90d matches the typical Chrome subscription
    // refresh window.
    const staleCutoffIso = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Two-pass delete so we can report a single combined count:
    //   1. expires_at IS NOT NULL AND expires_at < now
    //   2. expires_at IS NULL AND created_at < (now - 90d)
    // (We use created_at as a proxy for "this sub hasn't been refreshed
    //  in a long time" — the only other timestamp is updated_at, which
    //  is set whenever the user re-subscribes the same endpoint.)
    let deleted = 0;

    const { data: d1, error: e1 } = await supabase
      .from("push_subscriptions")
      .delete()
      .lt("expires_at", nowIso);
    if (e1) {
      return jsonResponse(
        { error: `Failed to delete expired rows: ${e1.message}` },
        500
      );
    }
    // supabase-js v2 returns the deleted rows in `data` when using
    // .select() alongside .delete(); without .select(), `data` is null
    // but the operation still succeeded. We re-count via a head count
    // before/after to get a stable number.
    void d1;

    const { count: beforeCount, error: ce1 } = await supabase
      .from("push_subscriptions")
      .select("*", { count: "exact", head: true });
    if (ce1) {
      return jsonResponse(
        { error: `Pre-count failed: ${ce1.message}` },
        500
      );
    }

    // Re-query for null-expires_at + stale rows. Use the count
    // difference to determine how many were removed in pass 1.
    const { error: e2 } = await supabase
      .from("push_subscriptions")
      .delete()
      .is("expires_at", null)
      .lt("created_at", staleCutoffIso);
    if (e2) {
      return jsonResponse(
        { error: `Failed to delete stale rows: ${e2.message}` },
        500
      );
    }

    const { count: afterCount, error: ce2 } = await supabase
      .from("push_subscriptions")
      .select("*", { count: "exact", head: true });
    if (ce2) {
      return jsonResponse(
        { error: `Post-count failed: ${ce2.message}` },
        500
      );
    }

    deleted = (beforeCount ?? 0) - (afterCount ?? 0);
    if (deleted < 0) deleted = 0; // defensive — shouldn't happen

    await logAdminAction(event, adminResult.admin, {
      action: "web-push.cleanup-expired",
      entity_type: "push_subscriptions",
      entity_id: null,
      payload: { deleted, before: beforeCount ?? 0, after: afterCount ?? 0 }
    });

    return jsonResponse({ ok: true, deleted });
  } catch (err) {
    console.error("[admin/services/web-push/cleanup-expired] error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Server error" },
      500
    );
  }
}
