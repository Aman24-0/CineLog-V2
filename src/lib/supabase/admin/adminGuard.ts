// src/lib/supabase/admin/adminGuard.ts
//
// CineLog V2 — Admin Route Guard (Server-Only)
// ---------------------------------------------------------------------
// Verifies that an incoming request to /api/admin/* is from a
// properly authenticated admin user.
//
// THREE-LAYER VERIFICATION:
//   1. Admin session cookie (cinelog_admin_session) — signed JWT
//      containing admin_id + email + exp. Set by POST /api/admin/auth.
//   2. Database lookup — confirms the user is still an admin and
//      hasn't been disabled since the cookie was issued.
//   3. The PIN was already verified when the cookie was issued, so
//      we don't re-check it here.
//
// USAGE in API routes:
//   ```ts
//   import { requireAdmin } from "~/lib/supabase/admin/adminGuard";
//
//   export async function POST(event) {
//     const admin = await requireAdmin(event);
//     if (!admin.ok) {
//       return new Response("Unauthorized", { status: 401 });
//     }
//     // admin.admin is { id, email, username, display_name }
//     // ... do admin stuff ...
//   }
//   ```
//
// AUDIT LOGGING:
//   This module does NOT log admin actions — that's the responsibility
//   of the calling route, via `logAdminAction()`.

import { isServer } from "solid-js/web";
import { createAdminClient } from "./adminClient";
import { verifyAdminToken, adminCookieName } from "./adminJwt";

/** Minimal event shape — matches the H3 event from SolidStart/Nitro. */
export interface AdminAPIEvent {
  request: Request;
}

/** Admin user shape returned on successful verification. */
export interface AdminUser {
  /** profiles.id */
  id: string;
  /** Admin's email (from auth.users, joined via profiles). */
  email: string;
  /** Admin's username (from profiles). */
  username: string;
  /** Admin's display name (from profiles). */
  display_name: string;
}

/** Result of `requireAdmin` — discriminated union for ergonomic handling. */
export type RequireAdminResult =
  | { ok: true; admin: AdminUser }
  | {
      ok: false;
      reason:
        | "no_cookie"
        | "invalid_token"
        | "not_admin"
        | "disabled"
        | "lookup_failed";
    };

/**
 * Extract the admin session cookie from a Request's Cookie header.
 */
function getAdminCookie(event: AdminAPIEvent): string | null {
  const cookieHeader = event.request.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";");
  for (const c of cookies) {
    const [name, ...rest] = c.trim().split("=");
    if (name === adminCookieName()) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/**
 * Verify that the request is from an authenticated admin.
 *
 * Returns `{ ok: true, admin }` on success, or `{ ok: false, reason }` on failure.
 * NEVER throws — callers can simply check `if (!admin.ok) return 401`.
 */
export async function requireAdmin(
  event: AdminAPIEvent
): Promise<RequireAdminResult> {
  if (!isServer) {
    return { ok: false, reason: "not_admin" };
  }

  // Layer 1: cookie + JWT verification
  const token = getAdminCookie(event);
  const payload = verifyAdminToken(token);
  if (!payload) {
    return { ok: false, reason: token ? "invalid_token" : "no_cookie" };
  }

  // Layer 2: database lookup — confirm user is still an admin
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, is_admin, admin_disabled_at")
      .eq("id", payload.admin_id)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      return { ok: false, reason: "lookup_failed" };
    }

    if (!data.is_admin) {
      return { ok: false, reason: "not_admin" };
    }

    if (data.admin_disabled_at) {
      return { ok: false, reason: "disabled" };
    }

    return {
      ok: true,
      admin: {
        id: data.id,
        email: payload.email,
        username: data.username,
        display_name: data.display_name
      }
    };
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}

/**
 * Get the client IP from a request, for audit logging.
 * Checks X-Forwarded-For, then X-Real-IP, then falls back to "unknown".
 */
export function getClientIP(event: AdminAPIEvent): string | null {
  const xff = event.request.headers.get("x-forwarded-for");
  if (xff) {
    // X-Forwarded-For can be a comma-separated list; the first IP is the client.
    return xff.split(",")[0].trim();
  }
  const xri = event.request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return null;
}

/**
 * Get the User-Agent from a request, for audit logging.
 */
export function getUserAgent(event: AdminAPIEvent): string | null {
  return event.request.headers.get("user-agent");
}
