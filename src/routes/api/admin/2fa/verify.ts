// src/routes/api/admin/2fa/verify.ts
//
// CineLog V2 — Admin 2FA Verification (Phase 6 Part 3 — Task 4)
// ---------------------------------------------------------------------
// POST /api/admin/2fa/verify
//   Body: { code: string }
//
// Completes the 2FA enrollment flow:
//   1. Loads the admin's pending 2FA secret from admin_2fa_secrets.
//   2. Verifies the provided 6-digit code against the secret.
//   3. If valid, sets enabled_at=now() — 2FA is now required for
//      future logins.
//   4. If invalid, returns 400 with a generic "Invalid code" error.
//
// The user must call /enroll first to generate a pending secret,
// then call /verify with a code from their authenticator app.
//
// Auth: requires an active admin session (admin cookie).

import { isServer } from "solid-js/web";
import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { decryptSecret, verifyTOTP } from "~/lib/server/totp";

interface APIEvent extends AdminAPIEvent {}

interface VerifyResponse {
  ok: true;
  enabled: true;
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

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ ok: false, error: "Server-only endpoint" }, 500);
  }

  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ ok: false, error: "Unauthorized" } as ErrorResponse, 401);
  }

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      code?: unknown;
    };
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!/^\d{6}$/.test(code)) {
      return jsonResponse(
        { ok: false, error: "Code must be exactly 6 digits." } as ErrorResponse,
        400
      );
    }

    const supabase = createAdminClient();
    const { data: row, error: fetchError } = await supabase
      .from("admin_2fa_secrets")
      .select("admin_id, secret_cipher, enabled_at")
      .eq("admin_id", adminResult.admin.id)
      .single();

    if (fetchError || !row) {
      // No pending secret — the user hasn't called /enroll yet.
      return jsonResponse(
        {
          ok: false,
          error: "No pending 2FA enrollment. Call /api/admin/2fa/enroll first."
        } as ErrorResponse,
        400
      );
    }

    let secretBase32: string;
    try {
      secretBase32 = decryptSecret(row.secret_cipher as string);
    } catch (err) {
      console.error("[admin/2fa/verify] Decrypt failed:", err);
      return jsonResponse(
        { ok: false, error: "Server misconfiguration — couldn't decrypt 2FA secret." } as ErrorResponse,
        500
      );
    }

    if (!verifyTOTP(secretBase32, code)) {
      // Don't reveal whether the secret exists or not — return the
      // same generic error as a wrong code.
      return jsonResponse(
        { ok: false, error: "Invalid code. Try again." } as ErrorResponse,
        400
      );
    }

    // Code is valid — enable 2FA.
    const { error: updateError } = await supabase
      .from("admin_2fa_secrets")
      .update({ enabled_at: new Date().toISOString() })
      .eq("admin_id", adminResult.admin.id);

    if (updateError) {
      console.error("[admin/2fa/verify] Enable update error:", updateError);
      return jsonResponse(
        { ok: false, error: "Failed to enable 2FA." } as ErrorResponse,
        500
      );
    }

    await logAdminAction(event, adminResult.admin, {
      action: "2fa.enabled",
      entity_type: "admin_2fa",
      entity_id: adminResult.admin.id,
      payload: {}
    });

    return jsonResponse({ ok: true, enabled: true } as VerifyResponse);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[admin/2fa/verify] Error:", detail);
    return jsonResponse(
      { ok: false, error: "Server error" } as ErrorResponse,
      500
    );
  }
}
