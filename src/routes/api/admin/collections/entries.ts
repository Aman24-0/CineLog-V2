// src/routes/api/admin/collections/entries.ts
//
// CineLog V2 — Admin Collection Entries API
// ---------------------------------------------------------------------
// Manages individual movie/TV entries inside a curated universe
// (e.g. the films inside the "MCU Timeline" universe).
//
// Each entry stores only:
//   - universe_id    (FK → curated_universes.id)
//   - tmdb_id        (TMDB movie or TV id — display metadata is fetched
//                     from TMDB on demand, never stored)
//   - media_type     ('movie' | 'tv')
//   - position       (admin's primary manual ordering — only position
//                     column remaining after Phase 4 Task 6 dropped the
//                     legacy release_position / story_position /
//                     timeline_position columns)
//   - incident_year  (in-universe year of incident — drives Storyline sort)
//   - note           (admin note shown in admin UI only)
//
// Endpoints:
//   POST   /api/admin/collections/entries             — add entry
//   PATCH  /api/admin/collections/entries             — update entry
//   DELETE /api/admin/collections/entries?id=<uuid>   — remove entry
//
// AUTH: requireAdmin() — admin cookie + DB lookup on every request.
// AUDIT: every mutation is written to admin_actions.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

interface APIEvent extends AdminAPIEvent {}

interface EntryInput {
  id?: string;
  universe_id?: string;
  tmdb_id?: number | string;
  media_type?: "movie" | "tv";
  position?: number;
  /** In-universe year of incident (drives Storyline sort). NULL = unknown. */
  incident_year?: number | null;
  note?: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function toInt(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : undefined;
}

// ─── POST (add entry) ──────────────────────────────────────────────

export async function POST(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "collection_entry.create"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request.json().catch(() => ({}))) as EntryInput;
    if (!body.universe_id) {
      return jsonResponse({ error: "universe_id is required" }, 400);
    }
    if (body.tmdb_id === undefined || body.tmdb_id === null) {
      return jsonResponse({ error: "tmdb_id is required" }, 400);
    }
    if (body.media_type !== "movie" && body.media_type !== "tv") {
      return jsonResponse({ error: "media_type must be 'movie' or 'tv'" }, 400);
    }

    const supabase = createAdminClient();
    const tmdbId = toInt(body.tmdb_id)!;

    // 1. Reject duplicates (same universe + same tmdb_id + media_type).
    const { data: existing } = await supabase
      .from("curated_universe_entries")
      .select("id")
      .eq("universe_id", body.universe_id)
      .eq("tmdb_id", tmdbId)
      .eq("media_type", body.media_type)
      .maybeSingle();
    if (existing) {
      return jsonResponse(
        {
          error: "This title is already in the universe.",
          existing_id: existing.id
        },
        409
      );
    }

    // 2. If no position provided, append at the end (max + 1).
    //    The DB has a CHECK constraint `curated_universe_entries_position_pos`
    //    that requires position > 0. For an empty universe, maxRow is null
    //    and we must default to 0 (NOT -1) so the first entry gets position = 1.
    const explicitPosition = toInt(body.position);
    let position: number;
    if (explicitPosition === undefined) {
      const { data: maxRow } = await supabase
        .from("curated_universe_entries")
        .select("position")
        .eq("universe_id", body.universe_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      position = (maxRow?.position ?? 0) + 1;
    } else {
      position = explicitPosition;
    }
    // Defensive: always clamp to >= 1 so the CHECK constraint can never fail,
    // even if the client explicitly sent position = 0 or a negative number.
    if (!Number.isFinite(position) || position < 1) position = 1;

    // 3. Insert.
    //    incident_year is optional — NULL means unknown (Storyline sort
    //    falls back to position).
    const insert: Record<string, unknown> = {
      universe_id: body.universe_id,
      tmdb_id: tmdbId,
      media_type: body.media_type,
      position,
      incident_year:
        body.incident_year === undefined
          ? null
          : (toInt(body.incident_year) ?? null),
      note: body.note ?? null
    };

    const { data, error } = await supabase
      .from("curated_universe_entries")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/collections/entries] POST insert error:", error);
      return jsonResponse({ error: error.message }, 500);
    }

    await logAdminAction(event, adminResult.admin, {
      action: "curated_universe_entry.add",
      entity_type: "curated_universe_entry",
      entity_id: data.id,
      payload: {
        universe_id: body.universe_id,
        tmdb_id: tmdbId,
        media_type: body.media_type,
        position
      }
    });

    return jsonResponse({ entry: data }, 201);
  } catch (err) {
    console.error("[admin/collections/entries] POST error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "Server error", detail: detail.slice(0, 200) },
      500
    );
  }
}

// ─── PATCH (update entry) ──────────────────────────────────────────

export async function PATCH(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "collection_entry.update"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request.json().catch(() => ({}))) as EntryInput;
    if (!body.id) {
      return jsonResponse({ error: "id is required" }, 400);
    }

    const update: Record<string, unknown> = {};
    if (body.position !== undefined) {
      const p = toInt(body.position);
      if (p !== undefined) update.position = p;
    }
    if (body.incident_year !== undefined) {
      // Allow null to clear the year; otherwise coerce to int.
      const n = body.incident_year === null ? null : toInt(body.incident_year);
      update.incident_year = n ?? null;
    }
    if (body.note !== undefined) {
      update.note = body.note === "" ? null : body.note;
    }
    if (body.tmdb_id !== undefined) {
      const t = toInt(body.tmdb_id);
      if (t !== undefined) update.tmdb_id = t;
    }
    if (body.media_type === "movie" || body.media_type === "tv") {
      update.media_type = body.media_type;
    }

    if (Object.keys(update).length === 0) {
      return jsonResponse({ error: "No fields to update" }, 400);
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("curated_universe_entries")
      .update(update)
      .eq("id", body.id)
      .select("*")
      .single();

    if (error || !data) {
      return jsonResponse({ error: error?.message ?? "Not found" }, 404);
    }

    await logAdminAction(event, adminResult.admin, {
      action: "curated_universe_entry.update",
      entity_type: "curated_universe_entry",
      entity_id: data.id,
      payload: { changes: Object.keys(update) }
    });

    return jsonResponse({ entry: data });
  } catch (err) {
    console.error("[admin/collections/entries] PATCH error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "Server error", detail: detail.slice(0, 200) },
      500
    );
  }
}

// ─── DELETE (remove entry) ─────────────────────────────────────────

export async function DELETE(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "collection_entry.delete"
  );
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(event.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse({ error: "id is required" }, 400);

    const supabase = createAdminClient();

    // Grab entry context for audit log before deleting.
    const { data: existing } = await supabase
      .from("curated_universe_entries")
      .select("id, universe_id, tmdb_id, media_type, position")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase
      .from("curated_universe_entries")
      .delete()
      .eq("id", id);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    await logAdminAction(event, adminResult.admin, {
      action: "curated_universe_entry.remove",
      entity_type: "curated_universe_entry",
      entity_id: id,
      payload: existing
        ? {
            universe_id: existing.universe_id,
            tmdb_id: existing.tmdb_id,
            media_type: existing.media_type,
            position: existing.position
          }
        : {}
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[admin/collections/entries] DELETE error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "Server error", detail: detail.slice(0, 200) },
      500
    );
  }
}

// ─── GET (list entries with TMDB metadata) ─────────────────────────
//
// Optional — admin UI can also use GET /api/admin/collections?id=…
// which returns entries. This endpoint enriches entries with TMDB
// metadata (title, poster, release_date) so the admin doesn't have
// to call TMDB separately for each entry.

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
    const { data: entries, error } = await supabase
      .from("curated_universe_entries")
      .select("*")
      .eq("universe_id", universeId)
      .order("position", { ascending: true });

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    // Enrich with TMDB metadata. We use the dynamic import to keep
    // the route's initial bundle small.
    const { fetchTmdbMetadataBatch } = await import("~/core/tmdb/tmdb");
    const items = (entries ?? []).map((e) => ({
      mediaType: e.media_type as "movie" | "tv",
      tmdbId: e.tmdb_id
    }));
    const tmdbMap =
      items.length > 0
        ? await fetchTmdbMetadataBatch(items)
        : new Map<string, unknown>();

    const enriched = (entries ?? []).map((e) => {
      const key = `${e.media_type}/${e.tmdb_id}`;
      const tmdb = tmdbMap.get(key) as
        | {
            title?: string;
            name?: string;
            poster_path?: string;
            release_date?: string;
            first_air_date?: string;
          }
        | undefined;
      return {
        ...e,
        title: tmdb?.title ?? tmdb?.name ?? null,
        poster_path: tmdb?.poster_path ?? null,
        release_date: tmdb?.release_date ?? tmdb?.first_air_date ?? null
      };
    });

    return jsonResponse({ entries: enriched });
  } catch (err) {
    console.error("[admin/collections/entries] GET error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "Server error", detail: detail.slice(0, 200) },
      500
    );
  }
}
