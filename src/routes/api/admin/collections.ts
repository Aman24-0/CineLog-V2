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

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

interface APIEvent extends AdminAPIEvent {}

interface UniverseInput {
  slug?: string;
  name?: string;
  description?: string | null;
  default_view?: "timeline" | "release" | "story" | "franchise";
  color?: string | null;
  cover_url?: string | null;
  banner_url?: string | null;
  // Phase 9 Chunk 5a: rich universe fields
  lore?: string | null;
  franchise_type?:
    | "cinematic_universe"
    | "franchise"
    | "anthology"
    | "shared_universe"
    | "multiverse"
    | null;
  viewing_order_guide?: string | null;
  color_theme?: string | null;
  total_entries?: number | null;
}

/**
 * Normalize the requested `default_view` to a value the DB enum
 * currently supports. The DB enum is `universe_default_view_type`:
 *   - Pre-migration: ('timeline', 'release', 'story')
 *   - Post-migration (20260724_universe_default_view_franchise.sql):
 *     ('timeline', 'release', 'story', 'franchise')
 *
 * If the admin picks "franchise" before the migration is applied, we
 * fall back to "story" (Storyline) — the closest semantic match — so
 * the save doesn't 500. After the migration is applied, "franchise" is
 * stored as-is and the consumer adapter will default users to the
 * Franchise sort.
 */
function normalizeDefaultView(
  v: string | undefined
): "timeline" | "release" | "story" | "franchise" {
  if (v === "release" || v === "story" || v === "franchise" || v === "timeline")
    return v;
  return "timeline";
}

/**
 * Detect "invalid enum value" errors returned by Postgres when the
 * `universe_default_view_type` enum doesn't yet include 'franchise'
 * (i.e. the 20260724 migration hasn't been applied). Postgres error
 * code 22P02 = invalid_text_representation, but Supabase sometimes
 * wraps it as 23514 (check_violation) or simply returns the message.
 * We sniff the message for the telltale "invalid input value for enum"
 * phrase to be safe across Supabase versions.
 */
function isEnumValueError(
  err: { code?: string; message?: string } | null | undefined
): boolean {
  if (!err) return false;
  const msg = (err.message ?? "").toLowerCase();
  if (msg.includes("invalid input value for enum")) return true;
  if (msg.includes("universe_default_view_type")) return true;
  // 22P02 = invalid_text_representation (Postgres)
  // 23514 = check_violation
  if (err.code === "22P02" || err.code === "23514") return true;
  return false;
}

/** Demote 'franchise' to 'story' (closest semantic match) so a missing
 *  DB enum value doesn't break the save. Other values pass through. */
function demoteFranchise(v: unknown): "timeline" | "release" | "story" {
  if (v === "franchise") return "story";
  if (v === "release" || v === "story" || v === "timeline") return v;
  return "timeline";
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

      return jsonResponse({
        universe,
        entries: entries ?? [],
        subscriber_count
      });
    }

    const { data, error } = await supabase
      .from("curated_universes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return jsonResponse({ error: error.message }, 500);

    // ─── Batch-fetch entry counts ────────────────────────────────
    // v2 (Phase 4 Task 23): previously the admin UI fetched each
    // universe's entries individually (one GET per universe) to count
    // them client-side — classic N+1. Now we issue a single group-by
    // query against curated_universe_entries and attach the counts
    // server-side. This drops the admin collections page from N+1
    // network round-trips to exactly 2 (list + counts), regardless
    // of how many universes exist.
    const universes = (data ?? []) as Array<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      default_view: "timeline" | "release" | "story" | "franchise";
      color: string | null;
      cover_url: string | null;
      banner_url: string | null;
      created_at: string;
      updated_at: string;
    }>;

    const countsById: Record<string, number> = {};
    if (universes.length > 0) {
      const ids = universes.map((u) => u.id);
      const { data: countRows, error: countErr } = await supabase
        .from("curated_universe_entries")
        .select("universe_id")
        .in("universe_id", ids);
      if (!countErr && countRows) {
        for (const row of countRows as Array<{ universe_id: string }>) {
          countsById[row.universe_id] =
            (countsById[row.universe_id] ?? 0) + 1;
        }
      }
    }

    const universesWithCounts = universes.map((u) => ({
      ...u,
      entry_count: countsById[u.id] ?? 0
    }));

    return jsonResponse({ universes: universesWithCounts });
  } catch (err) {
    console.error("[admin/collections] GET error:", err);
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
    "collection.create"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request
      .json()
      .catch(() => ({}))) as UniverseInput;
    if (!body.slug || !body.name) {
      return jsonResponse({ error: "slug and name are required" }, 400);
    }

    const insert: Record<string, unknown> = {
      slug: body.slug.trim().toLowerCase(),
      name: body.name.trim(),
      description: body.description ?? null,
      default_view: normalizeDefaultView(body.default_view),
      color: body.color ?? null,
      cover_url: body.cover_url ?? null,
      banner_url: body.banner_url ?? null,
      // Phase 9 Chunk 5a: rich universe fields (null-safe)
      lore: body.lore ?? null,
      franchise_type: body.franchise_type ?? "franchise",
      viewing_order_guide: body.viewing_order_guide ?? null,
      color_theme: body.color_theme ?? null,
      total_entries: body.total_entries ?? 0
    };

    const supabase = createAdminClient();
    let { data, error } = await supabase
      .from("curated_universes")
      .insert(insert)
      .select("*")
      .single();

    // Defensive: if the DB enum doesn't yet include 'franchise' (i.e.
    // the 20260724 migration hasn't been applied), retry with 'story'
    // (closest semantic match) so the save doesn't fail.
    if (
      error &&
      isEnumValueError(error) &&
      insert.default_view === "franchise"
    ) {
      console.warn(
        "[admin/collections] POST: DB enum missing 'franchise' — retrying with 'story'. Apply migration 20260724_universe_default_view_franchise.sql to enable."
      );
      insert.default_view = demoteFranchise(insert.default_view);
      ({ data, error } = await supabase
        .from("curated_universes")
        .insert(insert)
        .select("*")
        .single());
    }

    if (error) {
      if (error.code === "23505") {
        return jsonResponse(
          { error: "A universe with that slug already exists." },
          409
        );
      }
      return jsonResponse({ error: error.message }, 500);
    }

    await logAdminAction(event, adminResult.admin, {
      action: "curated_universe.create",
      entity_type: "curated_universe",
      entity_id: data.id,
      payload: { slug: data.slug, name: data.name }
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

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "collection.update"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request
      .json()
      .catch(() => ({}))) as UniverseInput & {
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
      // Phase 9 Chunk 5a: rich universe fields
      "lore",
      "franchise_type",
      "viewing_order_guide",
      "color_theme",
      "total_entries"
    ] as const) {
      if (body[key] !== undefined) {
        update[key] =
          key === "default_view"
            ? normalizeDefaultView(body[key] as string | undefined)
            : body[key];
      }
    }
    if (update.slug) update.slug = (update.slug as string).trim().toLowerCase();

    const supabase = createAdminClient();
    let { data, error } = await supabase
      .from("curated_universes")
      .update(update)
      .eq("id", body.id)
      .select("*")
      .single();

    // Defensive: if the DB enum doesn't yet include 'franchise', retry
    // with 'story' so the update doesn't fail. Same pattern as POST.
    if (
      error &&
      isEnumValueError(error) &&
      update.default_view === "franchise"
    ) {
      console.warn(
        "[admin/collections] PATCH: DB enum missing 'franchise' — retrying with 'story'. Apply migration 20260724_universe_default_view_franchise.sql to enable."
      );
      update.default_view = demoteFranchise(update.default_view);
      ({ data, error } = await supabase
        .from("curated_universes")
        .update(update)
        .eq("id", body.id)
        .select("*")
        .single());
    }

    if (error || !data)
      return jsonResponse({ error: error?.message ?? "Not found" }, 404);

    await logAdminAction(event, adminResult.admin, {
      action: "curated_universe.update",
      entity_type: "curated_universe",
      entity_id: data.id,
      payload: { changes: Object.keys(update) }
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

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "collection.delete"
  );
  if (rateLimited) return rateLimited;

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
    await supabase
      .from("curated_universe_entries")
      .delete()
      .eq("universe_id", id);
    const { error } = await supabase
      .from("curated_universes")
      .delete()
      .eq("id", id);
    if (error) return jsonResponse({ error: error.message }, 500);

    await logAdminAction(event, adminResult.admin, {
      action: "curated_universe.delete",
      entity_type: "curated_universe",
      entity_id: id,
      payload: { slug: existing?.slug, name: existing?.name }
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[admin/collections] DELETE error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
