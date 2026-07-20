// src/lib/supabase/admin/index.ts
//
// Barrel export for the admin server-side library.
//
// Server-only. Importing any of these from client code will fail
// at build time because `adminClient.ts` throws if `isServer` is false.

export { createAdminClient } from "./adminClient";
export {
  signAdminToken,
  verifyAdminToken,
  adminCookieName,
  adminTokenLifetime,
  type AdminTokenPayload,
} from "./adminJwt";
export {
  requireAdmin,
  getClientIP,
  getUserAgent,
  type AdminUser,
  type AdminAPIEvent,
  type RequireAdminResult,
} from "./adminGuard";
export { logAdminAction, type AuditLogEntry } from "./auditLog";
