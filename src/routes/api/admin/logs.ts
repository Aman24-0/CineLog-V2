// src/routes/api/admin/logs.ts
//
// CineLog V2 — Admin Audit Logs API
// ---------------------------------------------------------------------
// GET /api/admin/logs?action=&admin_id=&entity_type=&page=&limit=&from=&to=
//
// Returns the most recent admin_actions entries, with optional filters.

import { requireAdmin, type AdminAPIEvent } from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

interface APIEvent extends AdminAPIEvent {}

interface AuditLogRow {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  // Joined:
  admin_username: string | null;
  admin_display_name: string | null;
}

interface ListLogsResponse {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const url = new URL(event.request.url);
    const action = url.searchParams.get("action")?.trim();
    const adminId = url.searchParams.get("admin_id")?.trim();
    const entityType = url.searchParams.get("entity_type")?.trim();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

    const supabase = createAdminClient();
    const offset = (page - 1) * limit;

    let query = supabase
      .from("admin_actions")
      .select(
        "id, admin_id, action, entity_type, entity_id, payload, ip_address, user_agent, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) query = query.eq("action", action);
    if (adminId) query = query.eq("admin_id", adminId);
    if (entityType) query = query.eq("entity_type", entityType);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data: logs, error, count } = await query;

    if (error) {
      console.error("[CineLog Admin] Logs list error:", error);
      return jsonResponse({ error: "Failed to fetch logs" }, 500);
    }

    // Fetch admin display info for the unique admin_ids in this batch
    const adminIds = [...new Set((logs ?? []).map((l) => l.admin_id))];
    const adminInfo: Record<string, { username: string; display_name: string }> = {};
    if (adminIds.length > 0) {
      const { data: admins } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", adminIds);
      for (const a of admins ?? []) {
        adminInfo[a.id] = { username: a.username, display_name: a.display_name };
      }
    }

    const enrichedLogs: AuditLogRow[] = (logs ?? []).map((l) => {
      const row = l as Omit<AuditLogRow, "admin_username" | "admin_display_name">;
      const info = adminInfo[row.admin_id];
      return {
        ...row,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        admin_username: info?.username ?? null,
        admin_display_name: info?.display_name ?? null,
      };
    });

    const response: ListLogsResponse = {
      logs: enrichedLogs,
      total: count ?? 0,
      page,
      limit,
    };

    return jsonResponse(response);
  } catch (err) {
    console.error("[CineLog Admin] Logs GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
