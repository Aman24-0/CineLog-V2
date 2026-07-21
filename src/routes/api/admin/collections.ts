// src/routes/api/admin/collections.ts
//
// CineLog V2 — Admin Collections (Curated Universes) API
// ---------------------------------------------------------------------
// Manages the existing `curated_universes` table — admin scope.
// This table is developer-managed in the consumer app, but admins need
// full CRUD to add new universes without redeploying.
//
// Endpoints:
//   GET    /api/admin/collections                    — list all universes
//   GET    /api/admin/collections?id=<uuid>          — single universe + entries
//   POST   /api/admin/collections                    — create universe
//   PATCH  /api/admin/collections                    — update universe
//   DELETE /api/admin/collections?id=<uuid>          — hard-delete universe (cascade)
//
// Entries within a universe are managed via:
//   POST   /api/admin/collections/entries            — add entry
//   PATCH  /api/admin/collections/entries            — update entry
//   DELETE /api/admin/collections/entries?id=<uuid>  — remove entry
//
// Note: curated_universes does NOT have deleted_at / RLS for admin writes
// in the existing schema. We use the service role (bypasses RLS) for all
// mutations, which is appropriate for admin-only access.

import { requireAdmin, type AdminAPIEvent } from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";

interface APIEvent extends AdminAPIEvent {}

interface UniverseInput {
  slug?: string;
  name?: string;
  description?: string | null;
  default_view?: "timeline" | "release" | "story";
  color?: string | null;
  cover_url?: string | null;
  banner_url?: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── GET ───────────────────────────────────────────────────────────

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(event.request.url);
    const id = url.searchParams.get("id");
    const supabase = createAdminClient();

    if (id) {
      const { data: universe, error } = await supabase
        .from("curated_universes")
        .select("*")
        .eq("id", id)
        .single();
      if (error || !universe) return jsonResponse({ error: "Not found" }, 404);

      const { data: entries } = await supabase
        .from("curated_universe_entries")
        .select("*")
        .eq("universe_id", id)
        .order("position", { ascending: true });

      // Optional subscriber count — added when ?stats=1 is passed.
      // Used by the admin collection editor to show how many users
      // have subscribed to this universe.
      let subscriber_count: number | null = null;
      if (url.searchParams.get("stats") === "1") {
        const { count, error: countError } = await supabase
          .from("user_universe_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("universe_id", id);
        if (!countError) {
          subscriber_count = count ?? 0;
        }
      }

      return jsonResponse({ universe, entries: entries ?? [], subscriber_count });
    }

    const { data, error } = await supabase
      .from("curated_universes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ universes: data ?? [] });
  } catch (err) {
    console.error("[admin/collections] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── POST (create) ─────────────────────────────────────────────────

export async function POST(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const body = (await event.request.json().catch(() => ({}))) as UniverseInput;
    if (!body.slug || !body.name) {
      return jsonResponse({ error: "slug and name are required" }, 400);
    }

    const insert: Record<string, unknown> = {
      slug: body.slug.trim().toLowerCase(),
      name: body.name.trim(),
      description: body.description ?? null,
      default_view: body.default_view ?? "timeline",
      color: body.color ?? null,
      cover_url: body.cover_url ?? null,
      banner_url: body.banner_url ?? null,
    };

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("curated_universes")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return jsonResponse({ error: "A universe with that slug already exists." }, 409);
      }
      return jsonResponse({ error: error.message }, 500);
    }

    await logAdminAction(event, adminResult.admin, {
      action: "curated_universe.create",
      entity_type: "curated_universe",
      entity_id: data.id,
      payload: { slug: data.slug, name: data.name },
    });

    return jsonResponse({ universe: data }, 201);
  } catch (err) {
    console.error("[admin/collections] POST error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── PATCH (update) ────────────────────────────────────────────────

export async function PATCH(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const body = (await event.request.json().catch(() => ({}))) as UniverseInput & {
      id?: string;
    };
    if (!body.id) return jsonResponse({ error: "id is required" }, 400);

    const update: Record<string, unknown> = {};
    for (const key of [
      "slug",
      "name",
      "description",
      "default_view",
      "color",
      "cover_url",
      "banner_url",
    ] as const) {
      if (body[key] !== undefined) update[key] = body[key];
    }
    if (update.slug) update.slug = (update.slug as string).trim().toLowerCase();

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("curated_universes")
      .update(update)
      .eq("id", body.id)
      .select("*")
      .single();

    if (error || !data) return jsonResponse({ error: error?.message ?? "Not found" }, 404);

    await logAdminAction(event, adminResult.admin, {
      action: "curated_universe.update",
      entity_type: "curated_universe",
      entity_id: data.id,
      payload: { changes: Object.keys(update) },
    });

    return jsonResponse({ universe: data });
  } catch (err) {
    console.error("[admin/collections] PATCH error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── DELETE ────────────────────────────────────────────────────────

export async function DELETE(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(event.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse({ error: "id is required" }, 400);

    const supabase = createAdminClient();

    // First grab name for audit log
    const { data: existing } = await supabase
      .from("curated_universes")
      .select("id, slug, name")
      .eq("id", id)
      .single();

    // Cascade: delete entries first (no FK ON DELETE CASCADE in existing schema)
    await supabase.from("curated_universe_entries").delete().eq("universe_id", id);
    const { error } = await supabase.from("curated_universes").delete().eq("id", id);
    if (error) return jsonResponse({ error: error.message }, 500);

    await logAdminAction(event, adminResult.admin, {
      action: "curated_universe.delete",
      entity_type: "curated_universe",
      entity_id: id,
      payload: { slug: existing?.slug, name: existing?.name },
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[admin/collections] DELETE error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
