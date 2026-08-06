// src/routes/api/admin/announcements.ts
//
// CineLog V2 — Admin Announcements API
// ---------------------------------------------------------------------
// Endpoints:
//   GET    /api/admin/announcements              — list all (incl. inactive, deleted optional)
//   GET    /api/admin/announcements?id=<uuid>    — single
//   POST   /api/admin/announcements              — create
//   PATCH  /api/admin/announcements              — update (id required)
//   DELETE /api/admin/announcements?id=<uuid>    — soft-delete
//
// All mutations require admin auth + audit log.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

type APIEvent = AdminAPIEvent;

interface AnnouncementInput {
  type?: "banner" | "toast" | "modal";
  severity?: "info" | "success" | "warning" | "error";
  title?: string;
  body?: string | null;
  cta_label?: string | null;
  cta_href?: string | null;
  is_dismissible?: boolean;
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  target_audience?: "all" | "guests" | "authenticated";
}

// ─── Enum validation ───────────────────────────────────────────────
//
// Postgres enum constraints will reject invalid values with a leaky
// 500 error. We validate explicitly server-side and return 400 so the
// client gets a clean error message and the DB never sees the bad value.

const VALID_ANNOUNCEMENT_TYPES = new Set(["banner", "toast", "modal"]);
const VALID_ANNOUNCEMENT_SEVERITIES = new Set([
  "info",
  "success",
  "warning",
  "error"
]);
const VALID_ANNOUNCEMENT_AUDIENCES = new Set([
  "all",
  "guests",
  "authenticated"
]);

/**
 * Validate that any enum-valued fields on the input are within the
 * allowed set. Returns null on success, or an error string on failure.
 *
 * Only validates fields that are PRESENT in the body — absent fields
 * are left to the default-value logic downstream.
 */
function validateAnnouncementEnums(
  body: AnnouncementInput
): string | null {
  if (
    body.type !== undefined &&
    !VALID_ANNOUNCEMENT_TYPES.has(body.type)
  ) {
    return `Invalid type. Must be one of: ${[...VALID_ANNOUNCEMENT_TYPES].join(", ")}.`;
  }
  if (
    body.severity !== undefined &&
    !VALID_ANNOUNCEMENT_SEVERITIES.has(body.severity)
  ) {
    return `Invalid severity. Must be one of: ${[
      ...VALID_ANNOUNCEMENT_SEVERITIES
    ].join(", ")}.`;
  }
  if (
    body.target_audience !== undefined &&
    !VALID_ANNOUNCEMENT_AUDIENCES.has(body.target_audience)
  ) {
    return `Invalid target_audience. Must be one of: ${[
      ...VALID_ANNOUNCEMENT_AUDIENCES
    ].join(", ")}.`;
  }
  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ─── GET ───────────────────────────────────────────────────────────

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(event.request.url);
    const id = url.searchParams.get("id");
    const includeDeleted = url.searchParams.get("include_deleted") === "true";
    const supabase = createAdminClient();

    if (id) {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("id", id)
        .single();
      if (error || !data) return jsonResponse({ error: "Not found" }, 404);
      return jsonResponse({ announcement: data });
    }

    let query = supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (!includeDeleted) query = query.is("deleted_at", null);

    const { data, error } = await query;
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ announcements: data ?? [] });
  } catch (err) {
    console.error("[admin/announcements] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── POST (create) ─────────────────────────────────────────────────

export async function POST(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "announcement.create"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request
      .json()
      .catch(() => ({}))) as AnnouncementInput;
    if (!body.title || !body.title.trim()) {
      return jsonResponse({ error: "Title is required" }, 400);
    }

    // Validate enum fields BEFORE touching the DB — prevents leaky
    // Postgres 500 errors when an invalid enum value would violate
    // the column constraint.
    const enumError = validateAnnouncementEnums(body);
    if (enumError) {
      return jsonResponse({ error: enumError }, 400);
    }

    const insert: Record<string, unknown> = {
      type: body.type ?? "banner",
      severity: body.severity ?? "info",
      title: body.title.trim(),
      body: body.body ?? null,
      cta_label: body.cta_label ?? null,
      cta_href: body.cta_href ?? null,
      is_dismissible: body.is_dismissible ?? true,
      is_active: body.is_active ?? false,
      starts_at: body.starts_at ?? null,
      ends_at: body.ends_at ?? null,
      target_audience: body.target_audience ?? "all",
      created_by: adminResult.admin.id
    };

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("announcements")
      .insert(insert)
      .select("*")
      .single();

    if (error) return jsonResponse({ error: error.message }, 500);

    await logAdminAction(event, adminResult.admin, {
      action: "announcement.create",
      entity_type: "announcement",
      entity_id: data.id,
      payload: { title: data.title, type: data.type, severity: data.severity }
    });

    return jsonResponse({ announcement: data }, 201);
  } catch (err) {
    console.error("[admin/announcements] POST error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── PATCH (update) ────────────────────────────────────────────────

export async function PATCH(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "announcement.update"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request
      .json()
      .catch(() => ({}))) as AnnouncementInput & {
      id?: string;
    };
    if (!body.id) return jsonResponse({ error: "id is required" }, 400);

    // Validate enum fields BEFORE the DB update.
    const enumError = validateAnnouncementEnums(body);
    if (enumError) {
      return jsonResponse({ error: enumError }, 400);
    }

    const update: Record<string, unknown> = {};
    for (const key of [
      "type",
      "severity",
      "title",
      "body",
      "cta_label",
      "cta_href",
      "is_dismissible",
      "is_active",
      "starts_at",
      "ends_at",
      "target_audience"
    ] as const) {
      if (body[key] !== undefined) update[key] = body[key];
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("announcements")
      .update(update)
      .eq("id", body.id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error || !data)
      return jsonResponse({ error: error?.message ?? "Not found" }, 404);

    await logAdminAction(event, adminResult.admin, {
      action: "announcement.update",
      entity_type: "announcement",
      entity_id: data.id,
      payload: { changes: update }
    });

    return jsonResponse({ announcement: data });
  } catch (err) {
    console.error("[admin/announcements] PATCH error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── DELETE (soft-delete) ──────────────────────────────────────────

export async function DELETE(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "announcement.delete"
  );
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(event.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse({ error: "id is required" }, 400);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("announcements")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id, title")
      .single();

    if (error || !data)
      return jsonResponse({ error: error?.message ?? "Not found" }, 404);

    await logAdminAction(event, adminResult.admin, {
      action: "announcement.delete",
      entity_type: "announcement",
      entity_id: id,
      payload: { title: data.title }
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[admin/announcements] DELETE error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
