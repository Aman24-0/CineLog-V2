// src/routes/api/admin/viewing-orders.ts
//
// CineLog V2 — Admin Viewing Orders API (Phase 9 Chunk 5a)
// ---------------------------------------------------------------------
// Manages admin-defined custom viewing orders for curated universes.
// Stored across two tables:
//
//   universe_viewing_orders           — order metadata (name, description, is_default)
//   universe_viewing_order_entries    — positions of entries inside an order
//
// Endpoints:
//   GET    /api/admin/viewing-orders?universe_id=<uuid>     — list orders for a universe
//   POST   /api/admin/viewing-orders                        — create order
//   PATCH  /api/admin/viewing-orders                        — update order metadata
//   DELETE /api/admin/viewing-orders?id=<uuid>              — delete order (cascade)
//   PUT    /api/admin/viewing-orders?id=<uuid>              — reorder entries
//                                                            (body: { entry_ids: [...] })
//
// AUTH: requireAdmin() — admin cookie + DB lookup on every request.
// AUDIT: every mutation is written to admin_actions.
// RLS: the tables have admin-only write policies; we still use the
// service role client for defense in depth.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

interface APIEvent extends AdminAPIEvent {}

interface ViewingOrderInput {
  id?: string;
  universe_id?: string;
  name?: string;
  description?: string | null;
  is_default?: boolean;
  /** Used by PUT to reorder entries inside an order. */
  entry_ids?: string[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ─── GET (list orders for a universe) ──────────────────────────────

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(event.request.url);
    const universeId = url.searchParams.get("universe_id");
    if (!universeId) {
      return jsonResponse({ error: "universe_id is required" }, 400);
    }

    const supabase = createAdminClient();
    const { data: orders, error } = await supabase
      .from("universe_viewing_orders")
      .select(
        "id, universe_id, name, description, is_default, created_at, updated_at"
      )
      .eq("universe_id", universeId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) return jsonResponse({ error: error.message }, 500);

    const orderIds = (orders ?? []).map((o) => o.id);
    let entriesByOrder = new Map<string, { entry_id: string; position: number }[]>();
    if (orderIds.length > 0) {
      const { data: oe, error: oeError } = await supabase
        .from("universe_viewing_order_entries")
        .select("order_id, entry_id, position")
        .in("order_id", orderIds)
        .order("position", { ascending: true });
      if (oeError) {
        console.error(
          "[admin/viewing-orders] GET entries error:",
          oeError
        );
      } else if (oe) {
        for (const row of oe as Array<{
          order_id: string;
          entry_id: string;
          position: number;
        }>) {
          const list = entriesByOrder.get(row.order_id) ?? [];
          list.push({ entry_id: row.entry_id, position: row.position });
          entriesByOrder.set(row.order_id, list);
        }
      }
    }

    const result = (orders ?? []).map((o) => ({
      ...o,
      entry_ids: (entriesByOrder.get(o.id) ?? []).map((e) => e.entry_id)
    }));

    return jsonResponse({ orders: result });
  } catch (err) {
    console.error("[admin/viewing-orders] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── POST (create order) ───────────────────────────────────────────

export async function POST(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "viewing_order.create"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request
      .json()
      .catch(() => ({}))) as ViewingOrderInput;
    if (!body.universe_id) {
      return jsonResponse({ error: "universe_id is required" }, 400);
    }
    if (!body.name || !body.name.trim()) {
      return jsonResponse({ error: "name is required" }, 400);
    }

    const supabase = createAdminClient();

    // If this order is being set as default, unset is_default on all other
    // orders for the same universe (only one default per universe).
    if (body.is_default === true) {
      await supabase
        .from("universe_viewing_orders")
        .update({ is_default: false })
        .eq("universe_id", body.universe_id);
    }

    const insert: Record<string, unknown> = {
      universe_id: body.universe_id,
      name: body.name.trim(),
      description: body.description ?? null,
      is_default: body.is_default === true
    };

    const { data, error } = await supabase
      .from("universe_viewing_orders")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    // If entry_ids were provided, populate the join table.
    if (Array.isArray(body.entry_ids) && body.entry_ids.length > 0) {
      const rows = body.entry_ids.map((entry_id, i) => ({
        order_id: data.id,
        entry_id,
        position: i + 1
      }));
      const { error: oeError } = await supabase
        .from("universe_viewing_order_entries")
        .insert(rows);
      if (oeError) {
        console.error(
          "[admin/viewing-orders] POST entries insert error:",
          oeError
        );
        // Don't fail — the order was created; entries can be re-arranged.
      }
    }

    await logAdminAction(event, adminResult.admin, {
      action: "universe_viewing_order.create",
      entity_type: "universe_viewing_order",
      entity_id: data.id,
      payload: {
        universe_id: body.universe_id,
        name: data.name,
        is_default: data.is_default
      }
    });

    return jsonResponse({ order: data }, 201);
  } catch (err) {
    console.error("[admin/viewing-orders] POST error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── PATCH (update order metadata) ─────────────────────────────────

export async function PATCH(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "viewing_order.update"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request
      .json()
      .catch(() => ({}))) as ViewingOrderInput;
    if (!body.id) {
      return jsonResponse({ error: "id is required" }, 400);
    }

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return jsonResponse({ error: "name cannot be empty" }, 400);
      }
      update.name = body.name.trim();
    }
    if (body.description !== undefined) {
      update.description = body.description === "" ? null : body.description;
    }
    if (body.is_default !== undefined) {
      update.is_default = body.is_default === true;
    }

    if (Object.keys(update).length === 0) {
      return jsonResponse({ error: "No fields to update" }, 400);
    }

    const supabase = createAdminClient();

    // If marking as default, unset is_default on siblings.
    if (update.is_default === true) {
      const { data: order } = await supabase
        .from("universe_viewing_orders")
        .select("universe_id")
        .eq("id", body.id)
        .maybeSingle();
      if (order?.universe_id) {
        await supabase
          .from("universe_viewing_orders")
          .update({ is_default: false })
          .eq("universe_id", order.universe_id)
          .neq("id", body.id);
      }
    }

    const { data, error } = await supabase
      .from("universe_viewing_orders")
      .update(update)
      .eq("id", body.id)
      .select("*")
      .single();

    if (error || !data) {
      return jsonResponse({ error: error?.message ?? "Not found" }, 404);
    }

    await logAdminAction(event, adminResult.admin, {
      action: "universe_viewing_order.update",
      entity_type: "universe_viewing_order",
      entity_id: data.id,
      payload: { changes: Object.keys(update) }
    });

    return jsonResponse({ order: data });
  } catch (err) {
    console.error("[admin/viewing-orders] PATCH error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── PUT (reorder entries within an order) ─────────────────────────
//
// Body: { entry_ids: ["uuid1", "uuid2", ...] }
// The order of the array becomes the new position (1-indexed).
// Existing rows are wiped and re-inserted to avoid per-row diffs.

export async function PUT(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "viewing_order.reorder"
  );
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(event.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse({ error: "id is required" }, 400);

    const body = (await event.request
      .json()
      .catch(() => ({}))) as ViewingOrderInput;
    if (!Array.isArray(body.entry_ids)) {
      return jsonResponse(
        { error: "entry_ids (string[]) is required in the body" },
        400
      );
    }

    const supabase = createAdminClient();

    // Wipe existing rows for this order, then re-insert with new positions.
    const { error: delError } = await supabase
      .from("universe_viewing_order_entries")
      .delete()
      .eq("order_id", id);
    if (delError) {
      return jsonResponse({ error: delError.message }, 500);
    }

    if (body.entry_ids.length > 0) {
      const rows = body.entry_ids.map((entry_id, i) => ({
        order_id: id,
        entry_id,
        position: i + 1
      }));
      const { error: insError } = await supabase
        .from("universe_viewing_order_entries")
        .insert(rows);
      if (insError) {
        return jsonResponse({ error: insError.message }, 500);
      }
    }

    await logAdminAction(event, adminResult.admin, {
      action: "universe_viewing_order.reorder",
      entity_type: "universe_viewing_order",
      entity_id: id,
      payload: { entry_count: body.entry_ids.length }
    });

    return jsonResponse({ ok: true, count: body.entry_ids.length });
  } catch (err) {
    console.error("[admin/viewing-orders] PUT error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── DELETE (delete order — cascade) ───────────────────────────────

export async function DELETE(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "viewing_order.delete"
  );
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(event.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse({ error: "id is required" }, 400);

    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from("universe_viewing_orders")
      .select("id, universe_id, name, is_default")
      .eq("id", id)
      .maybeSingle();

    // FK ON DELETE CASCADE on universe_viewing_order_entries.order_id will
    // automatically remove the join rows.
    const { error } = await supabase
      .from("universe_viewing_orders")
      .delete()
      .eq("id", id);
    if (error) return jsonResponse({ error: error.message }, 500);

    await logAdminAction(event, adminResult.admin, {
      action: "universe_viewing_order.delete",
      entity_type: "universe_viewing_order",
      entity_id: id,
      payload: existing
        ? {
            universe_id: existing.universe_id,
            name: existing.name,
            was_default: existing.is_default
          }
        : {}
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[admin/viewing-orders] DELETE error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
