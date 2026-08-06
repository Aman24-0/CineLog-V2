// src/routes/api/admin/2fa/disable.ts
//
// CineLog V2 — Admin 2FA Disable (Phase 6 Part 3 — Task 4)
// ---------------------------------------------------------------------
// POST /api/admin/2fa/disable
//   Body: { code?: string }
//
// Disables 2FA for the current admin. Requires a valid TOTP code
// from the user's authenticator app as confirmation (so a stolen
// admin session can't be used to disable 2FA without the user's
// phone).
//
// After disabling, the row in admin_2fa_secrets is DELETED (not
// just enabled_at=NULL) so the user can re-enroll from scratch.
//
// Auth: requires an active admin session (admin cookie).
//
// ─────────────────────────────────────────────────────────────────────
// Phase 13 Chunk 2 — Bug #2 & #4: Rate Limiting + Replay Protection
// ─────────────────────────────────────────────────────────────────────
// Same protections as /verify (see that file for the full rationale):
//   • 5 attempts per 5 min per admin, 15-min lockout after the limit
//     is hit (DB-backed via `rate_limit_buckets`).
//   • TOTP replay protection via `last_used_counter` — even though
//     the row is DELETED on success (so the counter is wiped), this
//     still matters because:
//       - It prevents an attacker who intercepted the disable code
//         from racing the legitimate request (the second request
//         would be rejected as a replay).
//       - If the disable fails for any reason AFTER the TOTP check
//         passes (e.g. DB error), the counter is still updated, so
//         the attacker can't reuse the same code on the retry.

import { isServer } from "solid-js/web";
import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { decryptSecret, verifyTOTPWithReplay } from "~/lib/server/totp";
import {
  isRateLimited,
  recordFailure,
  clearFailures
} from "~/lib/server/rateLimiter";

type APIEvent = AdminAPIEvent;

interface DisableResponse {
  ok: true;
  disabled: true;
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

/**
 * Build the rate-limit key for the 2FA disable bucket.
 * Per-admin (NOT per-IP).
 */
function rateLimitKey(adminId: string): string {
  return adminId;
}

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ ok: false, error: "Server-only endpoint" }, 500);
  }

  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ ok: false, error: "Unauthorized" } as ErrorResponse, 401);
  }

  // ── Phase 13 Chunk 2 — Rate limit check (Bug #2) ──────────────────
  const rlKey = rateLimitKey(adminResult.admin.id);
  if (await isRateLimited("admin2faDisable", rlKey)) {
    return jsonResponse(
      {
        ok: false,
        error: "Too many attempts. Please wait a few minutes before trying again."
      } as ErrorResponse,
      429
    );
  }

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      code?: unknown;
    };
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!/^\d{6}$/.test(code)) {
      await recordFailure("admin2faDisable", rlKey);
      return jsonResponse(
        { ok: false, error: "Code must be exactly 6 digits." } as ErrorResponse,
        400
      );
    }

    const supabase = createAdminClient();
    const { data: row, error: fetchError } = await supabase
      .from("admin_2fa_secrets")
      .select("admin_id, secret_cipher, enabled_at, last_used_counter")
      .eq("admin_id", adminResult.admin.id)
      .single();

    if (fetchError || !row) {
      return jsonResponse(
        { ok: false, error: "2FA is not enabled for your account." } as ErrorResponse,
        400
      );
    }

    let secretBase32: string;
    try {
      secretBase32 = decryptSecret(row.secret_cipher as string);
    } catch (err) {
      console.error("[admin/2fa/disable] Decrypt failed:", err);
      return jsonResponse(
        { ok: false, error: "Server misconfiguration — couldn't decrypt 2FA secret." } as ErrorResponse,
        500
      );
    }

    // ── Phase 13 Chunk 2 — Replay-protected verification (Bug #4) ──
    const lastUsedCounter =
      typeof row.last_used_counter === "number" ? row.last_used_counter : null;
    const totpResult = verifyTOTPWithReplay(
      secretBase32,
      code,
      lastUsedCounter
    );

    if (!totpResult.valid) {
      await recordFailure("admin2faDisable", rlKey);
      if (totpResult.matchedCounter !== null) {
        console.warn(
          `[admin/2fa/disable] Replay rejected for admin ${adminResult.admin.id}: ` +
            `counter ${totpResult.matchedCounter} <= last_used ${lastUsedCounter ?? 0}`
        );
      }
      return jsonResponse(
        { ok: false, error: "Invalid code. Try again." } as ErrorResponse,
        400
      );
    }

    // Code is valid AND not a replay — persist the counter BEFORE
    // deleting the row. This is defensive: if the DELETE fails (e.g.
    // transient DB error), the counter is still updated, so a retry
    // with the SAME code is rejected as a replay. The user would
    // need to wait for a fresh 30-second step to retry.
    const { error: counterUpdateError } = await supabase
      .from("admin_2fa_secrets")
      .update({ last_used_counter: totpResult.matchedCounter })
      .eq("admin_id", adminResult.admin.id);

    if (counterUpdateError) {
      // Non-fatal — log + continue. We'd rather disable 2FA on the
      // legitimate request than block it because of a counter-write
      // issue (the row is about to be deleted anyway).
      console.warn(
        "[admin/2fa/disable] Failed to update last_used_counter (continuing):",
        counterUpdateError.message
      );
    }

    // Code valid — delete the row (which also clears enabled_at and
    // the counter).
    const { error: deleteError } = await supabase
      .from("admin_2fa_secrets")
      .delete()
      .eq("admin_id", adminResult.admin.id);

    if (deleteError) {
      console.error("[admin/2fa/disable] Delete error:", deleteError);
      return jsonResponse(
        { ok: false, error: "Failed to disable 2FA." } as ErrorResponse,
        500
      );
    }

    // Success — clear any accumulated failures.
    await clearFailures("admin2faDisable", rlKey);

    await logAdminAction(event, adminResult.admin, {
      action: "2fa.disabled",
      entity_type: "admin_2fa",
      entity_id: adminResult.admin.id,
      payload: {}
    });

    return jsonResponse({ ok: true, disabled: true } as DisableResponse);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[admin/2fa/disable] Error:", detail);
    return jsonResponse(
      { ok: false, error: "Server error" } as ErrorResponse,
      500
    );
  }
}
