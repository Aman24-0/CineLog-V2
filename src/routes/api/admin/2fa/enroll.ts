// src/routes/api/admin/2fa/enroll.ts
//
// CineLog V2 — Admin 2FA Enrollment (Phase 6 Part 3 — Task 4)
// ---------------------------------------------------------------------
// POST /api/admin/2fa/enroll
//
// Begins the 2FA enrollment flow for the current admin:
//   1. Generates a new random TOTP secret (20 bytes / 160 bits).
//   2. Encrypts it with ADMIN_2FA_ENCRYPTION_KEY.
//   3. Upserts it into admin_2fa_secrets with enabled_at=NULL (pending).
//      If a row already exists (already enrolled or pending), we
//      overwrite it — the user is re-rolling their secret.
//   4. Returns:
//        - secretBase32: for manual entry into the authenticator app.
//        - otpauthURL: for QR code generation.
//        - qrDataUrl: a data: URL containing the QR code PNG, so the
//          client doesn't need a QR library — just render an <img>.
//
// The secret is NOT yet enabled — the user must verify a code via
// /api/admin/2fa/verify to complete enrollment. This ensures the
// user has actually added the secret to their authenticator app
// before we require it for login.
//
// Auth: requires an active admin session (admin cookie).

import { isServer } from "solid-js/web";
import QRCode from "qrcode";
import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import {
  generateSecretBase32,
  buildOtpAuthURL,
  encryptSecret
} from "~/lib/server/totp";

interface APIEvent extends AdminAPIEvent {}

interface EnrollResponse {
  ok: true;
  secretBase32: string;
  otpauthURL: string;
  qrDataUrl: string;
}

interface ErrorResponse {
  ok: false;
  error: string;
  detail?: string;
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
    // Generate the new secret.
    const secretBase32 = generateSecretBase32();
    const secretCipher = encryptSecret(secretBase32);
    const otpauthURL = buildOtpAuthURL(adminResult.admin.email, secretBase32);

    // Render the QR code as a data: URL (PNG, base64). The client
    // just renders this in an <img src="..."> — no JS QR library
    // needed.
    const qrDataUrl = await QRCode.toDataURL(otpauthURL, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    });

    // Upsert into admin_2fa_secrets with enabled_at=NULL (pending).
    // We use the service-role admin client (already has RLS bypass).
    const supabase = createAdminClient();
    const { error: upsertError } = await supabase
      .from("admin_2fa_secrets")
      .upsert(
        {
          admin_id: adminResult.admin.id,
          secret_cipher: secretCipher,
          enabled_at: null // pending — not yet verified
        },
        { onConflict: "admin_id" }
      );

    if (upsertError) {
      console.error("[admin/2fa/enroll] Upsert error:", upsertError);
      return jsonResponse(
        {
          ok: false,
          error: "Failed to store 2FA secret",
          detail: upsertError.message
        } as ErrorResponse,
        500
      );
    }

    // Audit log (best-effort).
    await logAdminAction(event, adminResult.admin, {
      action: "2fa.enroll_started",
      entity_type: "admin_2fa",
      entity_id: adminResult.admin.id,
      payload: {}
    });

    return jsonResponse({
      ok: true,
      secretBase32,
      otpauthURL,
      qrDataUrl
    } as EnrollResponse);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[admin/2fa/enroll] Error:", detail);
    return jsonResponse(
      {
        ok: false,
        error: "Failed to begin 2FA enrollment",
        detail
      } as ErrorResponse,
      500
    );
  }
}
