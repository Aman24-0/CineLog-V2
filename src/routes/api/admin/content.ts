// src/routes/api/admin/content.ts
//
// CineLog V2 — Admin Featured Content API
// ---------------------------------------------------------------------
// Manages the `featured_content` table (hero / spotlight / rail / pinned / editor_pick slots).
//
// Endpoints:
//   GET    /api/admin/content?slot=&include_deleted=   — list
//   GET    /api/admin/content?id=<uuid>                — single
//   POST   /api/admin/content                          — create
//   PATCH  /api/admin/content                          — update
//   DELETE /api/admin/content?id=<uuid>                — soft-delete
//   POST   /api/admin/content/reorder                  — batch reorder slot positions

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

interface APIEvent extends AdminAPIEvent {}

interface FeaturedContentInput {
  slot?: "hero" | "spotlight" | "rail" | "pinned" | "editor_pick";
  tmdb_id?: number;
  media_type?: "movie" | "tv";
  title_override?: string | null;
  note?: string | null;
  tagline?: string | null;
  position?: number;
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}

// ─── Enum validation ───────────────────────────────────────────────
//
// Postgres enum constraints will reject invalid values with a leaky
// 500 error. We validate explicitly server-side and return 400 so the
// client gets a clean error message and the DB never sees the bad value.

const VALID_CONTENT_SLOTS = new Set([
  "hero",
  "spotlight",
  "rail",
  "pinned",
  "editor_pick"
]);
const VALID_MEDIA_TYPES = new Set(["movie", "tv"]);

/**
 * Validate that any enum-valued fields on the input are within the
 * allowed set. Returns null on success, or an error string on failure.
 *
 * Only validates fields that are PRESENT in the body — absent fields
 * are left to the default-value logic downstream.
 */
function validateContentEnums(body: FeaturedContentInput): string | null {
  if (body.slot !== undefined && !VALID_CONTENT_SLOTS.has(body.slot)) {
    return `Invalid slot. Must be one of: ${[
      ...VALID_CONTENT_SLOTS
    ].join(", ")}.`;
  }
  if (
    body.media_type !== undefined &&
    !VALID_MEDIA_TYPES.has(body.media_type)
  ) {
    return `Invalid media_type. Must be one of: ${[
      ...VALID_MEDIA_TYPES
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
    const slot = url.searchParams.get("slot");
    const includeDeleted = url.searchParams.get("include_deleted") === "true";
    const supabase = createAdminClient();

    if (id) {
      const { data, error } = await supabase
        .from("featured_content")
        .select("*")
        .eq("id", id)
        .single();
      if (error || !data) return jsonResponse({ error: "Not found" }, 404);
      return jsonResponse({ content: data });
    }

    let query = supabase
      .from("featured_content")
      .select("*")
      .order("slot", { ascending: true })
      .order("position", { ascending: true });
    if (!includeDeleted) query = query.is("deleted_at", null);
    if (slot) query = query.eq("slot", slot);

    const { data, error } = await query;
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ content: data ?? [] });
  } catch (err) {
    console.error("[admin/content] GET error:", err);
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
    "featured_content.create"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request
      .json()
      .catch(() => ({}))) as FeaturedContentInput;
    if (!body.slot || !body.tmdb_id || !body.media_type) {
      return jsonResponse(
        { error: "slot, tmdb_id, media_type are required" },
        400
      );
    }

    // Validate enum fields BEFORE touching the DB — prevents leaky
    // Postgres 500 errors when an invalid enum value would violate
    // the column constraint.
    const enumError = validateContentEnums(body);
    if (enumError) {
      return jsonResponse({ error: enumError }, 400);
    }

    const supabase = createAdminClient();

    // Auto-assign next position if not specified
    let position = body.position ?? 0;
    if (body.position === undefined) {
      const { count } = await supabase
        .from("featured_content")
        .select("id", { count: "exact", head: true })
        .eq("slot", body.slot)
        .is("deleted_at", null);
      position = count ?? 0;
    }

    const insert: Record<string, unknown> = {
      slot: body.slot,
      tmdb_id: body.tmdb_id,
      media_type: body.media_type,
      title_override: body.title_override ?? null,
      note: body.note ?? null,
      tagline: body.tagline ?? null,
      position,
      is_active: body.is_active ?? true,
      starts_at: body.starts_at ?? null,
      ends_at: body.ends_at ?? null,
      created_by: adminResult.admin.id
    };

    const { data, error } = await supabase
      .from("featured_content")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return jsonResponse(
          {
            error:
              "This title is already in this slot. Edit the existing entry instead."
          },
          409
        );
      }
      return jsonResponse({ error: error.message }, 500);
    }

    await logAdminAction(event, adminResult.admin, {
      action: "featured_content.create",
      entity_type: "featured_content",
      entity_id: data.id,
      payload: {
        slot: data.slot,
        tmdb_id: data.tmdb_id,
        media_type: data.media_type
      }
    });

    return jsonResponse({ content: data }, 201);
  } catch (err) {
    console.error("[admin/content] POST error:", err);
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
    "featured_content.update"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request
      .json()
      .catch(() => ({}))) as FeaturedContentInput & {
      id?: string;
    };
    if (!body.id) return jsonResponse({ error: "id is required" }, 400);

    // Validate enum fields BEFORE the DB update.
    const enumError = validateContentEnums(body);
    if (enumError) {
      return jsonResponse({ error: enumError }, 400);
    }

    const update: Record<string, unknown> = {};
    for (const key of [
      "slot",
      "tmdb_id",
      "media_type",
      "title_override",
      "note",
      "tagline",
      "position",
      "is_active",
      "starts_at",
      "ends_at"
    ] as const) {
      if (body[key] !== undefined) update[key] = body[key];
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("featured_content")
      .update(update)
      .eq("id", body.id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error || !data)
      return jsonResponse({ error: error?.message ?? "Not found" }, 404);

    await logAdminAction(event, adminResult.admin, {
      action: "featured_content.update",
      entity_type: "featured_content",
      entity_id: data.id,
      payload: { changes: update }
    });

    return jsonResponse({ content: data });
  } catch (err) {
    console.error("[admin/content] PATCH error:", err);
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
    "featured_content.delete"
  );
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(event.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse({ error: "id is required" }, 400);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("featured_content")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id, slot, tmdb_id, media_type")
      .single();

    if (error || !data)
      return jsonResponse({ error: error?.message ?? "Not found" }, 404);

    await logAdminAction(event, adminResult.admin, {
      action: "featured_content.delete",
      entity_type: "featured_content",
      entity_id: id,
      payload: {
        slot: data.slot,
        tmdb_id: data.tmdb_id,
        media_type: data.media_type
      }
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[admin/content] DELETE error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
