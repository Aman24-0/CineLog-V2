// src/routes/api/admin/users.ts
//
// CineLog V2 — Admin Users API
// ---------------------------------------------------------------------
// Endpoints:
//   GET /api/admin/users?search=&page=&limit=    — list/search users
//   GET /api/admin/users?id=<uuid>                — get single user
//   PATCH /api/admin/users                        — update user (disable/enable/delete)
//   DELETE /api/admin/users?id=<uuid>             — soft-delete user
//
// All endpoints require admin authentication via requireAdmin().
// All mutations are audit-logged.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";

interface APIEvent extends AdminAPIEvent {}

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
}

interface ListUsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ─── GET /api/admin/users ─────────────────────────────────────────
//
// Query params:
//   search — optional substring to match against email, username, display_name
//   page   — 1-indexed page number (default 1)
//   limit  — page size (default 25, max 100)
//   id     — if provided, returns a single user instead of a list

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

    const supabase = createAdminClient();

    // Single user lookup
    if (userId) {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url, country, created_at, deleted_at, admin_disabled_at, scheduled_deletion_at, is_admin"
        )
        .eq("id", userId)
        .single();

      if (error || !profile) {
        return jsonResponse({ error: "User not found" }, 404);
      }

      // Get email from auth.users via admin API (need to use the auth admin)
      const {
        data: { user }
      } = await supabase.auth.admin.getUserById(userId);

      // Get vault count
      const { count: vaultCount } = await supabase
        .from("vault")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("deleted_at", null);

      // Get last activity
      const { data: lastActivity } = await supabase
        .from("activity_log")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const userRow: UserRow = {
        ...(profile as Omit<
          UserRow,
          "email" | "vault_count" | "last_activity"
        >),
        email: user?.email ?? "",
        vault_count: vaultCount ?? 0,
        last_activity: lastActivity?.created_at ?? null
      };

      return jsonResponse({ user: userRow });
    }

    // List with optional search
    const offset = (page - 1) * limit;
    let query = supabase
      .from("profiles")
      .select(
        "id, username, display_name, avatar_url, country, created_at, deleted_at, admin_disabled_at, scheduled_deletion_at, is_admin",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      // Use OR filter across username + display_name
      // Email isn't in profiles, so we can't search by email here without
      // joining auth.users — which the service role can do via a custom query.
      // For now, we match username + display_name. Email search would require
      // a different approach (lookup auth.users first, then profiles).
      query = query.or(
        `username.ilike.%${search}%,display_name.ilike.%${search}%`
      );
    }

    const { data: profiles, error, count } = await query;

    if (error) {
      console.error("[CineLog Admin] Users list error:", error);
      return jsonResponse({ error: "Failed to fetch users" }, 500);
    }

    // Enrich with vault counts and last activity (batch)
    const userIds = (profiles ?? []).map((p) => p.id);

    const vaultCounts: Record<string, number> = {};
    const lastActivities: Record<string, string> = {};
    if (userIds.length > 0) {
      const [vaultResp, activityResp] = await Promise.all([
        supabase
          .from("vault")
          .select("user_id")
          .in("user_id", userIds)
          .is("deleted_at", null),
        supabase
          .from("activity_log")
          .select("user_id, created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
      ]);

      // Aggregate vault counts
      for (const row of (vaultResp.data ?? []) as Array<{ user_id: string }>) {
        vaultCounts[row.user_id] = (vaultCounts[row.user_id] ?? 0) + 1;
      }

      // Get the latest activity per user (first occurrence since ordered desc)
      for (const row of (activityResp.data ?? []) as Array<{
        user_id: string;
        created_at: string;
      }>) {
        if (!lastActivities[row.user_id]) {
          lastActivities[row.user_id] = row.created_at;
        }
      }
    }

    // Get emails from auth.users via the get_user_email RPC.
    //
    // v2 (Phase 4 Task 26): previously we called
    // `supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })`
    // and filtered client-side — wasteful (fetches up to 1000 user
    // records when we only need 25 emails) AND it returns the full
    // user objects (including sensitive fields like
    // encrypted_password, email_change, etc.) to the server-side
    // caller, which is more surface area than necessary.
    //
    // Now: we call the `get_user_email(user_id UUID) RETURNS TEXT`
    // RPC once per visible user (Promise.all, 25 parallel calls).
    // Each call:
    //   • Returns ONLY the email (no other auth.users fields).
    //   • Is SECURITY DEFINER with an admin check inside — even
    //     if the EXECUTE grant leaked to a non-admin client, the
    //     function returns NULL instead of the email.
    //   • Returns NULL for non-existent user_ids (defensive).
    //
    // 25 parallel RPC calls is more requests than the old 1
    // listUsers call, but each one is much smaller (single text
    // value vs. full user object), and the function's tight
    // admin check makes the security posture strictly better.
    // For pages with 100 users (max page size), this still
    // completes in well under a second because Supabase pools
    // the connections.
    const emailsById: Record<string, string> = {};
    if (userIds.length > 0) {
      const emailResults = await Promise.all(
        userIds.map(async (uid) => {
          try {
            const { data, error } = await supabase.rpc("get_user_email", {
              user_id: uid
            });
            if (error) {
              console.warn(
                `[CineLog Admin] get_user_email(${uid}) error:`,
                error.message
              );
              return { uid, email: "" };
            }
            // RPC returns TEXT — null when user_id doesn't exist
            // or caller isn't an admin (defense in depth).
            return { uid, email: typeof data === "string" ? data : "" };
          } catch (err) {
            console.warn(
              `[CineLog Admin] get_user_email(${uid}) exception:`,
              err
            );
            return { uid, email: "" };
          }
        })
      );
      for (const { uid, email } of emailResults) {
        if (email) emailsById[uid] = email;
      }
    }

    const users: UserRow[] = (profiles ?? []).map((p) => ({
      ...(p as Omit<UserRow, "email" | "vault_count" | "last_activity">),
      email: emailsById[p.id] ?? "",
      vault_count: vaultCounts[p.id] ?? 0,
      last_activity: lastActivities[p.id] ?? null
    }));

    const response: ListUsersResponse = {
      users,
      total: count ?? 0,
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
// Body: { id, action, reason? }
//   action: "disable" | "enable" | "delete" | "reset_preferences"
//
// Returns: { ok: true } on success, { ok: false, error } on failure.

export async function PATCH(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      id?: string;
      action?: string;
      reason?: string;
    };

    const userId = body.id;
    const action = body.action;
    const reason = body.reason ?? "";

    if (!userId || !action) {
      return jsonResponse({ error: "Missing id or action" }, 400);
    }

    if (
      !["disable", "enable", "delete", "reset_preferences"].includes(action)
    ) {
      return jsonResponse({ error: "Invalid action" }, 400);
    }

    const supabase = createAdminClient();

    // Prevent self-action — admin can't disable/delete themselves
    if (userId === adminResult.admin.id) {
      return jsonResponse(
        { error: "Cannot perform this action on your own account" },
        400
      );
    }

    // Verify target isn't another admin (defense in depth)
    const { data: target } = await supabase
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
      const { error } = await supabase
        .from("profiles")
        .update({ admin_disabled_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) {
        console.error("[CineLog Admin] Disable user error:", error);
        return jsonResponse({ error: "Failed to disable user" }, 500);
      }
      auditAction = "user.disable";
    } else if (action === "enable") {
      const { error } = await supabase
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
      const { error } = await supabase
        .from("profiles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) {
        console.error("[CineLog Admin] Delete user error:", error);
        return jsonResponse({ error: "Failed to delete user" }, 500);
      }
      auditAction = "user.delete";
    } else if (action === "reset_preferences") {
      const { error } = await supabase
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
