// src/lib/supabase/admin/auditLog.ts
//
// CineLog V2 — Admin Audit Logger (Server-Only)
// ---------------------------------------------------------------------
// Writes rows to the `admin_actions` table for audit purposes.
//
// The table is INSERT-only (no UPDATE/DELETE RLS policies), so once
// an action is logged, it cannot be modified or deleted.
//
// USAGE in admin API routes:
//   ```ts
//   import { logAdminAction } from "~/lib/supabase/admin/auditLog";
//
//   await logAdminAction(event, admin, {
//     action: "feature_flag.toggle",
//     entity_type: "feature_flag",
//     entity_id: "imdb_integration",
//     payload: { old: false, new: true },
//   });
//   ```
//
// Errors are swallowed intentionally — audit logging should never
// break the actual operation. Failures are logged to stderr.

import { isServer } from "solid-js/web";
import { createAdminClient } from "./adminClient";
import {
  getClientIP,
  getUserAgent,
  type AdminAPIEvent,
  type AdminUser
} from "./adminGuard";

/** Audit log entry to be inserted. */
export interface AuditLogEntry {
  /** Dotted action name, e.g. "feature_flag.toggle", "user.disable". */
  action: string;
  /** Entity type being acted on, e.g. "feature_flag", "user", "announcement". */
  entity_type?: string | null;
  /** Entity ID being acted on, e.g. "imdb_integration", a user UUID. */
  entity_id?: string | null;
  /** Arbitrary JSON payload (old/new values, params, etc.). */
  payload?: Record<string, unknown> | null;
}

/**
 * Log an admin action to the audit trail. Server-only.
 *
 * This function NEVER throws — it catches its own errors and logs
 * them to stderr. The actual admin operation should never fail
 * because of an audit-logging failure.
 */
export async function logAdminAction(
  event: AdminAPIEvent,
  admin: AdminUser,
  entry: AuditLogEntry
): Promise<void> {
  if (!isServer) return;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("admin_actions").insert({
      admin_id: admin.id,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      payload: entry.payload ?? {},
      ip_address: getClientIP(event),
      user_agent: getUserAgent(event)
    });

    if (error) {
      console.error("[CineLog Admin] Failed to log audit action:", error);
    }
  } catch (err) {
    console.error("[CineLog Admin] Audit log exception:", err);
  }
}
