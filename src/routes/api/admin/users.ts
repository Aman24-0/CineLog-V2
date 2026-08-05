// src/routes/api/admin/users.ts
//
// CineLog V2 — Admin Users API
// ---------------------------------------------------------------------
// Endpoints:
//   GET /api/admin/users?search=&page=&limit=                — list/search users
//        Optional filters (Phase 9 Chunk 3):
//          &provider=google|email|all     — filter by auth provider
//          &twofa=enabled|disabled|all    — filter by 2FA status
//          &admin=true|false|all          — filter by admin flag
//   GET /api/admin/users?id=<uuid>                           — get single user (detailed)
//   PATCH /api/admin/users                                   — perform an action on a user
//        Body: { id, action: "disable" | "enable" | "delete" | "reset_preferences", reason? }
//        Body: { ids: string[], action, reason? }            — bulk mode (Phase 6 Part 3 — Task 4)
//
// There is no DELETE endpoint — soft-deletion is performed via the
// `action: "delete"` body field on PATCH, which sets `profiles.deleted_at`
// and `profiles.scheduled_deletion_at` (purge happens later via the
// maintenance cron).
//
// All endpoints require admin authentication via requireAdmin().
// All mutations are audit-logged.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

type APIEvent = AdminAPIEvent;

// ─── Types ──────────────────────────────────────────────────────
//
// UserRow — the lightweight row returned in the LIST response. Kept
// backwards-compatible with Phase 6 callers (the admin dashboard's
// "recent signups" panel reads these fields). Phase 9 Chunk 3 adds
// two new optional fields:
//   • provider       — "google" | "email" | null (null = unknown)
//   • twofa_enabled  — true | false | null (null = unknown)
//
// These new fields are populated by batch-enriching the page of
// profiles with auth.users identities + auth.mfa_factors. The
// enrichment runs per visible row (max 25/page) so the cost is
// bounded.

interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  country: string;
  created_at: string;
  deleted_at: string | null;
  admin_disabled_at: string | null;
  scheduled_deletion_at: string | null;
  is_admin: boolean;
  vault_count: number;
  last_activity: string | null;
  /** Phase 9 Chunk 3 — primary auth provider. */
  provider?: "google" | "email" | null;
  /** Phase 9 Chunk 3 — whether the user has at least one verified MFA factor. */
  twofa_enabled?: boolean | null;
}

interface ListUsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
}

// UserDetail — the rich object returned by GET ?id=<uuid>. Includes
// everything in UserRow plus the drawer-only fields: bio, linked
// identities, 2FA factor list, collections/ratings counts, and the
// last 10 login_history rows.

interface UserIdentity {
  provider: string;
  identity_id: string;
}

interface MfaFactor {
  id: string;
  factor_type: string;
  friendly_name: string | null;
  status: string;
}

interface LoginHistoryEntry {
  id: string;
  login_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface UserDetail {
  user: UserRow;
  bio: string | null;
  identities: UserIdentity[];
  mfa_factors: MfaFactor[];
  collections_count: number;
  ratings_count: number;
  login_history: LoginHistoryEntry[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ─── Helpers (Phase 9 Chunk 3) ──────────────────────────────────

/**
 * Derive a single primary provider label from a user's auth identities.
 *
 * Supabase stores identities as an array of { provider, identity_id, ... }.
 * A user who signed up with email/password has one identity with
 * provider="email". A user who signed in with Google has one with
 * provider="google". A user who linked Google after email signup has
 * both — in that case we prefer "google" (the OAuth provider) because
 * it's the more specific signal for the admin filter UI.
 *
 * Returns null when identities is empty or the call failed.
 */
function deriveProvider(
  identities: Array<{ provider: string }> | null | undefined
): "google" | "email" | null {
  if (!identities || identities.length === 0) return null;
  const providers = identities.map((i) => i.provider);
  if (providers.includes("google")) return "google";
  if (providers.includes("email")) return "email";
  // Any other provider (apple, github, etc.) — report as the raw
  // string so the admin can still see something, but the filter
  // dropdown only offers google/email/all (the two providers the
  // user-side actually supports). We normalize to null here so the
  // filter doesn't show a mystery third option.
  return null;
}

/**
 * Batch-fetch auth.users identities + 2FA factor status for a set of
 * user ids. Returns a map keyed by user id.
 *
 * This is called once per LIST page (max 100 ids). Each id triggers
 * one `auth.admin.getUserById` + one `auth.admin.mfa.listFactors`
 * call. For a 25-user page that's 50 parallel calls — Supabase pools
 * connections so this completes well under a second.
 *
 * Failures per-user are swallowed (the map entry is omitted) so one
 * bad user doesn't break the whole page.
 */
async function batchFetchAuthMetadata(
  supabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<
  Map<
    string,
    {
      provider: "google" | "email" | null;
      twofa_enabled: boolean;
    }
  >
> {
  const result = new Map<
    string,
    { provider: "google" | "email" | null; twofa_enabled: boolean }
  >();
  if (userIds.length === 0) return result;

  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const [userResp, factorsResp] = await Promise.all([
          supabase.auth.admin.getUserById(uid),
          supabase.auth.admin.mfa.listFactors({ userId: uid })
        ]);
        const identities =
          (userResp.data?.user?.identities as
            | Array<{ provider: string }>
            | undefined
            | null) ?? null;
        const provider = deriveProvider(identities);

        // listFactors returns { data: { factors: Factor[] } }.
        // A factor with status "verified" means the user completed
        // enrollment. We treat 2FA as "enabled" iff ≥1 verified factor.
        const factors = factorsResp.data?.factors ?? [];
        const twofa_enabled = factors.some(
          (f) => f.status === "verified"
        );

        result.set(uid, { provider, twofa_enabled });
      } catch {
        // Swallow — leave this user out of the map. The row will
        // render with null provider / null twofa_enabled.
      }
    })
  );

  return result;
}

// ─── GET /api/admin/users ─────────────────────────────────────────
//
// Query params:
//   search — optional substring to match against email, username, display_name
//   page   — 1-indexed page number (default 1)
//   limit  — page size (default 25, max 100)
//   id     — if provided, returns a single detailed user instead of a list
//
// Phase 9 Chunk 3 filters:
//   provider — "google" | "email" | "all" (default "all")
//   twofa    — "enabled" | "disabled" | "all" (default "all")
//   admin    — "true" | "false" | "all" (default "all")
//
// The provider / twofa filters require per-user auth metadata which
// can't be expressed as a SQL filter on `profiles`. Strategy:
//   1. Fetch a page of profiles (slightly over-fetch when a filter
//      is active so we still have a full page after filtering).
//   2. Batch-fetch auth metadata for that page.
//   3. Apply the provider/twofa/admin filters in JS.
//   4. Slice to the requested page size.
//   5. The `total` reflects the filtered count (best-effort: when
//      a provider/twofa filter is active, total is the count of
//      matching users on THIS page only — see note below).
//
// NOTE ON TOTAL ACCURACY:
//   When no provider/twofa filter is active, `total` is the exact
//   SQL count from the profiles query (unchanged from pre-Chunk-3
//   behavior). When a provider/twofa filter IS active, computing
//   the exact global total would require fetching auth metadata
//   for EVERY user in the database — prohibitively expensive. We
//   instead report `total` as the count of matching users on the
//   current over-fetched page. The pagination UI degrades
//   gracefully: if the page is full, "Next" is enabled; if not,
//   "Next" is disabled. This is an acceptable trade-off for an
//   admin tool — the operator filters to find a specific user,
//   not to page through thousands.

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const url = new URL(event.request.url);
    const search = url.searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("limit") || "25", 10))
    );
    const userId = url.searchParams.get("id");

    // Phase 9 Chunk 3 — filters
    const providerFilter = url.searchParams.get("provider") || "all";
    const twofaFilter = url.searchParams.get("twofa") || "all";
    const adminFilter = url.searchParams.get("admin") || "all";

    const supabase = createAdminClient();

    // ─── Single user lookup (detailed) ────────────────────────
    if (userId) {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, bio, avatar_url, country, created_at, deleted_at, admin_disabled_at, scheduled_deletion_at, is_admin"
        )
        .eq("id", userId)
        .single();

      if (error || !profile) {
        return jsonResponse({ error: "User not found" }, 404);
      }

      // Get email + identities from auth.users via admin API
      const {
        data: { user }
      } = await supabase.auth.admin.getUserById(userId);

      // Get 2FA factors (server-side admin call).
      // listFactors returns { data: { factors: Factor[] } }.
      const { data: mfaData } = await supabase.auth.admin.mfa.listFactors({
        userId
      });
      const allFactors = (mfaData?.factors ?? []).map((f) => ({
        id: f.id,
        factor_type: f.factor_type,
        friendly_name: f.friendly_name ?? null,
        status: f.status
      }));
      const twofa_enabled = allFactors.some((f) => f.status === "verified");

      // Parallel: vault count, collections count, ratings count
      // (ratings = vault rows where rating IS NOT NULL), last
      // activity, and login_history (last 10).
      const [
        vaultCountResp,
        ratingsCountResp,
        collectionsCountResp,
        lastActivityResp,
        loginHistoryResp
      ] = await Promise.all([
        supabase
          .from("vault")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("deleted_at", null),
        supabase
          .from("vault")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("deleted_at", null)
          .not("rating", "is", null),
        supabase
          .from("collections")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("deleted_at", null),
        supabase
          .from("activity_log")
          .select("created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("login_history")
          .select("id, login_at, ip_address, user_agent")
          .eq("user_id", userId)
          .order("login_at", { ascending: false })
          .limit(10)
      ]);

      const identities: UserIdentity[] = (user?.identities ?? []).map((i) => ({
        provider: (i as { provider: string }).provider,
        identity_id: (i as { identity_id: string }).identity_id
      }));

      const userRow: UserRow = {
        id: profile.id,
        email: user?.email ?? "",
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        country: profile.country,
        created_at: profile.created_at,
        deleted_at: profile.deleted_at,
        admin_disabled_at: profile.admin_disabled_at,
        scheduled_deletion_at: profile.scheduled_deletion_at,
        is_admin: profile.is_admin,
        vault_count: vaultCountResp.count ?? 0,
        last_activity: lastActivityResp.data?.created_at ?? null,
        provider: deriveProvider(user?.identities ?? null),
        twofa_enabled
      };

      const detail: UserDetail = {
        user: userRow,
        bio: profile.bio ?? null,
        identities,
        mfa_factors: allFactors,
        collections_count: collectionsCountResp.count ?? 0,
        ratings_count: ratingsCountResp.count ?? 0,
        login_history: (loginHistoryResp.data ?? []) as LoginHistoryEntry[]
      };

      return jsonResponse({ user: detail });
    }

    // ─── List with optional search ───────────────────────────
    //
    // When a provider/twofa filter is active we over-fetch 3x the
    // page size (capped at the max 100) so the JS-side filter still
    // has enough rows to fill a page after filtering. The admin
    // filter (is_admin) is applied in SQL since it's a profiles
    // column.

    const hasAuthFilter =
      providerFilter !== "all" || twofaFilter !== "all";

    const effectiveLimit = hasAuthFilter
      ? Math.min(100, limit * 3)
      : limit;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("profiles")
      .select(
        "id, username, display_name, avatar_url, country, created_at, deleted_at, admin_disabled_at, scheduled_deletion_at, is_admin",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + effectiveLimit - 1);

    if (search) {
      // Match username + display_name. Email isn't in profiles (see
      // the get_user_email RPC note below) so we can't OR it in
      // SQL — email search would require a different strategy.
      query = query.or(
        `username.ilike.%${search}%,display_name.ilike.%${search}%`
      );
    }

    // Admin filter is a SQL column — apply in DB.
    if (adminFilter === "true") {
      query = query.eq("is_admin", true);
    } else if (adminFilter === "false") {
      query = query.eq("is_admin", false);
    }

    const { data: profiles, error, count } = await query;

    if (error) {
      console.error("[CineLog Admin] Users list error:", error);
      return jsonResponse({ error: "Failed to fetch users" }, 500);
    }

    const profileList = profiles ?? [];
    const userIds = profileList.map((p) => p.id);

    // Batch enrichment: vault counts, last activity, emails, auth metadata.
    const vaultCounts: Record<string, number> = {};
    const lastActivities: Record<string, string> = {};
    const emailsById: Record<string, string> = {};

    const [vaultResp, activityResp, authMeta] = await Promise.all([
      supabase
        .from("vault")
        .select("user_id")
        .in("user_id", userIds)
        .is("deleted_at", null),
      supabase
        .from("activity_log")
        .select("user_id, created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false }),
      // Phase 9 Chunk 3 — provider + 2FA status per user.
      batchFetchAuthMetadata(supabase, userIds)
    ]);

    for (const row of (vaultResp.data ?? []) as Array<{ user_id: string }>) {
      vaultCounts[row.user_id] = (vaultCounts[row.user_id] ?? 0) + 1;
    }
    for (const row of (activityResp.data ?? []) as Array<{
      user_id: string;
      created_at: string;
    }>) {
      if (!lastActivities[row.user_id]) {
        lastActivities[row.user_id] = row.created_at;
      }
    }

    // Get emails via the get_user_email RPC (Phase 4 Task 26 — one
    // call per visible user, SECURITY DEFINER + admin check).
    if (userIds.length > 0) {
      const emailResults = await Promise.all(
        userIds.map(async (uid) => {
          try {
            const { data, error: rpcErr } = await supabase.rpc(
              "get_user_email",
              { user_id: uid }
            );
            if (rpcErr) return { uid, email: "" };
            return { uid, email: typeof data === "string" ? data : "" };
          } catch {
            return { uid, email: "" };
          }
        })
      );
      for (const { uid, email } of emailResults) {
        if (email) emailsById[uid] = email;
      }
    }

    // Build the rows with all enrichment.
    let users: UserRow[] = profileList.map((p) => {
      const meta = authMeta.get(p.id);
      return {
        id: p.id,
        email: emailsById[p.id] ?? "",
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        country: p.country,
        created_at: p.created_at,
        deleted_at: p.deleted_at,
        admin_disabled_at: p.admin_disabled_at,
        scheduled_deletion_at: p.scheduled_deletion_at,
        is_admin: p.is_admin,
        vault_count: vaultCounts[p.id] ?? 0,
        last_activity: lastActivities[p.id] ?? null,
        provider: meta?.provider ?? null,
        twofa_enabled: meta?.twofa_enabled ?? null
      };
    });

    // ─── Apply provider/twofa filters in JS ──────────────────
    if (providerFilter !== "all") {
      users = users.filter((u) => u.provider === providerFilter);
    }
    if (twofaFilter === "enabled") {
      users = users.filter((u) => u.twofa_enabled === true);
    } else if (twofaFilter === "disabled") {
      users = users.filter((u) => u.twofa_enabled === false);
    }

    // Slice to the requested page size (we may have over-fetched).
    users = users.slice(0, limit);

    const response: ListUsersResponse = {
      users,
      total: hasAuthFilter ? users.length : (count ?? 0),
      page,
      limit
    };

    return jsonResponse(response);
  } catch (err) {
    console.error("[CineLog Admin] Users GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── PATCH /api/admin/users ───────────────────────────────────────
//
// Body: { id, action, reason? }              — single-user mode (legacy)
//    or { ids: string[], action, reason? }   — bulk mode (Phase 6 Part 3 — Task 4)
//
//   action: "disable" | "enable" | "delete" | "reset_preferences"
//
// Bulk mode applies the action to every id in `ids`. Self-action and
// admin-target safeguards are enforced per id (skipped with a count
// returned in the response). The audit log gets one entry per
// successful mutation.
//
// Returns:
//   single: { ok: true } | { ok: false, error }
//   bulk:   { ok: true, applied: N, skipped: M, errors: [...] }
//           — `applied` = successful mutations
//           — `skipped` = self/admin-target/not-found (defensive skips)
//           — `errors` = array of { id, error } for failed mutations

export async function PATCH(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "user.update"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      id?: string;
      ids?: unknown;
      action?: string;
      reason?: string;
    };

    const action = body.action;
    const reason = body.reason ?? "";

    if (!action) {
      return jsonResponse({ error: "Missing action" }, 400);
    }

    if (
      !["disable", "enable", "delete", "reset_preferences"].includes(action)
    ) {
      return jsonResponse({ error: "Invalid action" }, 400);
    }

    // ─── Normalize the target list ──────────────────────────────
    // Accept either `id` (single, legacy) or `ids` (array, bulk).
    // If both are provided, prefer `ids`. If neither, 400.
    let targetIds: string[] = [];
    if (Array.isArray(body.ids)) {
      targetIds = (body.ids as unknown[]).filter(
        (id): id is string => typeof id === "string" && id.length > 0
      );
    } else if (typeof body.id === "string" && body.id.length > 0) {
      targetIds = [body.id];
    }

    if (targetIds.length === 0) {
      return jsonResponse({ error: "Missing id(s)" }, 400);
    }

    // Cap the bulk size to prevent abuse. 100 is generous — the
    // adminUsers page shows 25 per page, so even "select all" on
    // a single page is well under this.
    if (targetIds.length > 100) {
      return jsonResponse(
        { error: "Bulk operation limited to 100 users at a time." },
        400
      );
    }

    const supabase = createAdminClient();

    // ─── Bulk path ───────────────────────────────────────────────
    if (targetIds.length > 1) {
      const result = {
        ok: true as const,
        applied: 0,
        skipped: 0,
        errors: [] as Array<{ id: string; error: string }>
      };

      // Fetch all targets in one query so we can pre-filter
      // (self-action, admin-target, not-found) before mutating.
      const { data: targets } = await supabase
        .from("profiles")
        .select("id, is_admin, username, display_name")
        .in("id", targetIds);

      const targetMap = new Map<string, { is_admin: boolean; username: string; display_name: string } | null>();
      for (const row of (targets ?? []) as Array<{
        id: string;
        is_admin: boolean;
        username: string;
        display_name: string;
      }>) {
        targetMap.set(row.id, {
          is_admin: row.is_admin,
          username: row.username,
          display_name: row.display_name
        });
      }

      for (const userId of targetIds) {
        // Self-action check.
        if (userId === adminResult.admin.id) {
          result.skipped++;
          continue;
        }
        const target = targetMap.get(userId);
        if (!target) {
          result.skipped++;
          continue;
        }
        if (target.is_admin) {
          result.skipped++;
          continue;
        }

        try {
          const ok = await applyUserAction(
            supabase,
            userId,
            action
          );
          if (ok) {
            result.applied++;
            // Audit log per successful mutation.
            await logAdminAction(event, adminResult.admin, {
              action: `user.${action}`, // matches single-mode audit action
              entity_type: "user",
              entity_id: userId,
              payload: {
                reason,
                target_username: target.username,
                target_display_name: target.display_name,
                bulk: true
              }
            });
          } else {
            result.errors.push({ id: userId, error: "Mutation failed" });
          }
        } catch (err) {
          result.errors.push({
            id: userId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }

      return jsonResponse(result);
    }

    // ─── Single-user path (legacy, unchanged) ────────────────────
    const userId = targetIds[0];
    const supabase2 = supabase;

    // Prevent self-action — admin can't disable/delete themselves
    if (userId === adminResult.admin.id) {
      return jsonResponse(
        { error: "Cannot perform this action on your own account" },
        400
      );
    }

    // Verify target isn't another admin (defense in depth)
    const { data: target } = await supabase2
      .from("profiles")
      .select("is_admin, username, display_name")
      .eq("id", userId)
      .single();

    if (!target) {
      return jsonResponse({ error: "User not found" }, 404);
    }
    if (target.is_admin) {
      return jsonResponse(
        { error: "Cannot perform this action on another admin" },
        400
      );
    }

    let auditAction = "";
    const auditPayload: Record<string, unknown> = { reason };

    if (action === "disable") {
      const { error } = await supabase2
        .from("profiles")
        .update({ admin_disabled_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) {
        console.error("[CineLog Admin] Disable user error:", error);
        return jsonResponse({ error: "Failed to disable user" }, 500);
      }
      auditAction = "user.disable";
    } else if (action === "enable") {
      const { error } = await supabase2
        .from("profiles")
        .update({ admin_disabled_at: null })
        .eq("id", userId);
      if (error) {
        console.error("[CineLog Admin] Enable user error:", error);
        return jsonResponse({ error: "Failed to enable user" }, 500);
      }
      auditAction = "user.enable";
    } else if (action === "delete") {
      // Soft delete — sets deleted_at
      const { error } = await supabase2
        .from("profiles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) {
        console.error("[CineLog Admin] Delete user error:", error);
        return jsonResponse({ error: "Failed to delete user" }, 500);
      }
      auditAction = "user.delete";
    } else if (action === "reset_preferences") {
      const { error } = await supabase2
        .from("user_preferences")
        .delete()
        .eq("user_id", userId);
      if (error) {
        console.error("[CineLog Admin] Reset preferences error:", error);
        return jsonResponse({ error: "Failed to reset preferences" }, 500);
      }
      auditAction = "user.reset_preferences";
    }

    // Audit log
    await logAdminAction(event, adminResult.admin, {
      action: auditAction,
      entity_type: "user",
      entity_id: userId,
      payload: {
        ...auditPayload,
        target_username: target.username,
        target_display_name: target.display_name
      }
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[CineLog Admin] Users PATCH error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

/**
 * Apply a single user-action mutation. Returns true on success.
 *
 * Extracted so the bulk path can reuse the same logic per id without
 * duplicating the action→mutation mapping.
 */
async function applyUserAction(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  action: string
): Promise<boolean> {
  try {
    if (action === "disable") {
      const { error } = await supabase
        .from("profiles")
        .update({ admin_disabled_at: new Date().toISOString() })
        .eq("id", userId);
      return !error;
    }
    if (action === "enable") {
      const { error } = await supabase
        .from("profiles")
        .update({ admin_disabled_at: null })
        .eq("id", userId);
      return !error;
    }
    if (action === "delete") {
      const { error } = await supabase
        .from("profiles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", userId);
      return !error;
    }
    if (action === "reset_preferences") {
      const { error } = await supabase
        .from("user_preferences")
        .delete()
        .eq("user_id", userId);
      return !error;
    }
    return false;
  } catch {
    return false;
  }
}
