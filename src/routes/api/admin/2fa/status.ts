// src/routes/api/admin/2fa/status.ts
//
// CineLog V2 — Admin 2FA Status (Phase 6 Part 3 — Task 4)
// ---------------------------------------------------------------------
// GET /api/admin/2fa/status
//
// Returns whether 2FA is enabled for the current admin.
//
// Response:
//   { ok: true, enabled: boolean, pending: boolean }
//     enabled  — true if 2FA is required for login (enabled_at IS NOT NULL)
//     pending  — true if there's a secret row but enabled_at IS NULL
//                (user called /enroll but hasn't verified yet)
//
// Auth: requires an active admin session (admin cookie).

import { isServer } from "solid-js/web";
import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

type APIEvent = AdminAPIEvent;

interface StatusResponse {
  ok: true;
  enabled: boolean;
  pending: boolean;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ ok: false, error: "Server-only endpoint" }, 500);
  }

  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ ok: false, error: "Unauthorized" } as ErrorResponse, 401);
  }

  try {
    const supabase = createAdminClient();
    const { data: row, error } = await supabase
      .from("admin_2fa_secrets")
      .select("enabled_at")
      .eq("admin_id", adminResult.admin.id)
      .maybeSingle();

    if (error) {
      console.error("[admin/2fa/status] Query error:", error);
      return jsonResponse(
        { ok: false, error: "Failed to fetch 2FA status" } as ErrorResponse,
        500
      );
    }

    if (!row) {
      return jsonResponse({
        ok: true,
        enabled: false,
        pending: false
      } as StatusResponse);
    }

    const enabled = row.enabled_at !== null;
    return jsonResponse({
      ok: true,
      enabled,
      pending: !enabled
    } as StatusResponse);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[admin/2fa/status] Error:", detail);
    return jsonResponse(
      { ok: false, error: "Server error" } as ErrorResponse,
      500
    );
  }
}
