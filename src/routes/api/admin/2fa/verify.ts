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
//
// ─────────────────────────────────────────────────────────────────────
// Phase 13 Chunk 2 — Bug #2 & #4: Rate Limiting + Replay Protection
// ─────────────────────────────────────────────────────────────────────
// RATE LIMITING (Bug #2):
//   5 attempts per 5 minutes per admin. After the limit is hit, the
//   account is locked out for 15 minutes (3x the window). This
//   prevents brute-forcing the 6-digit TOTP code (1M possibilities
//   → at 5 per 5 min, full search takes ~3.5 days, which gives the
//   security team plenty of time to notice + lock the account).
//
//   The limit is enforced via the DB-backed `rate_limit_buckets`
//   table (the in-memory Map limiters used in early phases were
//   no-ops on Vercel serverless — every cold start reset the Map).
//
// TOTP REPLAY PROTECTION (Bug #4):
//   The `admin_2fa_secrets` table has a `last_used_counter` column
//   (migration 20260814_add_admin_2fa_replay_protection.sql). On
//   every successful verification, we persist the time-step counter
//   that produced the accepted code. Future verifications reject
//   any code whose counter is <= `last_used_counter`.
//
//   This closes the 90-second replay window that RFC 6238's ±1 step
//   drift tolerance creates: even if an attacker intercepts a valid
//   code, they cannot reuse it within the window because the counter
//   has already been recorded.

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

/**
 * Build the rate-limit key for the 2FA verify bucket.
 *
 * Per-admin (NOT per-IP) so a NAT'd office of admins each get their
 * own bucket — a single compromised account can't lock out everyone.
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
  // If the admin is currently locked out (after 5 failures in 5 min),
  // short-circuit with a 429. We do this BEFORE any DB/TOTP work so
  // a locked-out attacker can't even probe the system.
  const rlKey = rateLimitKey(adminResult.admin.id);
  if (await isRateLimited("admin2faVerify", rlKey)) {
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
      // Format failure — count toward rate limit so a script that
      // spams garbage doesn't get free attempts.
      await recordFailure("admin2faVerify", rlKey);
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
      // No pending secret — the user hasn't called /enroll yet.
      // Don't count toward rate limit (this is a state error, not
      // a brute-force attempt).
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

    // ── Phase 13 Chunk 2 — Replay-protected verification (Bug #4) ──
    // `verifyTOTPWithReplay` returns BOTH the validity flag AND the
    // time-step counter that matched. We persist the counter on
    // success so future verifications reject codes whose counter is
    // <= this value (closing the 90s replay window created by the
    // ±1 step drift tolerance).
    const lastUsedCounter =
      typeof row.last_used_counter === "number" ? row.last_used_counter : null;
    const totpResult = verifyTOTPWithReplay(
      secretBase32,
      code,
      lastUsedCounter
    );

    if (!totpResult.valid) {
      // Record the failure toward the rate-limit bucket.
      await recordFailure("admin2faVerify", rlKey);
      // Don't reveal whether the secret exists, the code was stale,
      // or the code was just wrong — return the same generic error.
      // (Logging at debug-level only — never expose in the response.)
      if (totpResult.matchedCounter !== null) {
        // The code MATCHED a step but was rejected due to replay
        // protection — this is suspicious; log it for the security
        // team but still return the generic "Invalid code" so we
        // don't tip off an attacker that replay was the issue.
        console.warn(
          `[admin/2fa/verify] Replay rejected for admin ${adminResult.admin.id}: ` +
            `counter ${totpResult.matchedCounter} <= last_used ${lastUsedCounter ?? 0}`
        );
      }
      return jsonResponse(
        { ok: false, error: "Invalid code. Try again." } as ErrorResponse,
        400
      );
    }

    // Code is valid AND not a replay — enable 2FA + persist the
    // counter so this code can never be reused.
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("admin_2fa_secrets")
      .update({
        enabled_at: nowIso,
        last_used_counter: totpResult.matchedCounter
      })
      .eq("admin_id", adminResult.admin.id);

    if (updateError) {
      console.error("[admin/2fa/verify] Enable update error:", updateError);
      return jsonResponse(
        { ok: false, error: "Failed to enable 2FA." } as ErrorResponse,
        500
      );
    }

    // Successful verification — clear any accumulated failures so
    // the admin starts the next window with a fresh counter.
    await clearFailures("admin2faVerify", rlKey);

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
