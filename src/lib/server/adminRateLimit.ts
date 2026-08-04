// src/lib/server/adminRateLimit.ts
//
// CineLog V2 — Admin Mutation Rate Limiter (Server-Only)
// ---------------------------------------------------------------------
// Per-admin-per-action rate limiting for all POST/PATCH/PUT/DELETE
// routes under /api/admin/*. Closes the audit finding Maj-3:
// "Admin mutation routes have NO rate limiting. Only requireAdmin() is
//  called. A compromised admin token could spam DB writes."
//
// USAGE in admin API routes:
//
//   ```ts
//   import { requireAdmin } from "~/lib/supabase/admin/adminGuard";
//   import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";
//
//   export async function POST(event) {
//     const adminResult = await requireAdmin(event);
//     if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);
//
//     const limited = await enforceAdminMutationRateLimit(
//       event, adminResult.admin, "announcement.create"
//     );
//     if (limited) return limited;
//
//     // ... existing handler logic ...
//   }
//   ```
//
// LIMIT:
//   60 mutations per minute per admin per action.
//   The limit is per-action (not aggregate) so an admin doing 60
//   announcement.create calls in a minute is fine, but 61 triggers 429.
//   This is generous enough for legitimate admin UI use (which never
//   approaches 60 mutations/min) while preventing a compromised token
//   from spamming writes.
//
// FAIL-OPEN:
//   If the rate-limit DB call fails, the limiter fails OPEN — the
//   mutation is allowed. This matches the consumer-facing rate limiters'
//   failure mode. The error is logged to stderr.

import type { AdminAPIEvent, AdminUser } from "~/lib/supabase/admin/adminGuard";
import { checkAndIncrement } from "./rateLimiter";

/**
 * Check the per-admin-per-action mutation rate limit.
 *
 * @param _event — the API event (unused, kept for symmetry + future IP-based limits)
 * @param admin — the verified admin user
 * @param action — dotted action name, e.g. "announcement.create"
 * @returns A 429 Response if rate-limited, or null if allowed.
 */
export async function enforceAdminMutationRateLimit(
  _event: AdminAPIEvent,
  admin: AdminUser,
  action: string
): Promise<Response | null> {
  // Key by admin_id + action so each (admin, action) pair has its own
  // counter. Two admins don't share a counter, and one admin's
  // announcement.create limit is independent of their announcement.delete.
  const key = `${admin.id}:${action}`;

  const result = await checkAndIncrement("adminMutation", key);

  if (result.allowed) {
    return null;
  }

  // Build a 429 response with standard rate-limit headers.
  const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
  const body = JSON.stringify({
    error: "Too many admin mutations. Please slow down.",
    action,
    retryAfterSeconds: retryAfterSec
  });

  return new Response(body, {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSec || 60)
    }
  });
}
