// src/routes/api/admin/anime-mappings.ts
//
// CineLog V2 — Admin Anime Mappings API (Phase 9 Chunk 5c)
// ---------------------------------------------------------------------
// Manages the `anime_mappings` table — the TMDB ↔ AniList ID
// resolution table used by the anime detector + enrichment pipeline.
//
// ENDPOINTS:
//   GET    /api/admin/anime-mappings                  — list with filters
//   PATCH  /api/admin/anime-mappings                  — update a single
//                                                       mapping (e.g.
//                                                       promote "low"
//                                                       → "manual" to
//                                                       approve it)
//   DELETE /api/admin/anime-mappings?id=<uuid>        — delete a mapping
//
// FILTERS (GET query params):
//   ?confidence=high|medium|low|manual                — filter by confidence
//   ?q=<text>                                          — search by TMDB ID,
//                                                       AniList ID, or title
//                                                       (case-insensitive)
//   ?limit=50&offset=0                                 — pagination
//
// SECURITY:
//   • All routes admin-gated via requireAdmin.
//   • PATCH + DELETE are audit-logged.
//   • Mutations are rate-limited via enforceAdminMutationRateLimit.
//
// ZERO DUPLICATION: This is the ONLY admin endpoint that writes to
// `anime_mappings`. The public /api/anime-mappings POST endpoint
// remains for browser-driven auto-mapping writes (created_by="system").
// Approvals / edits / deletes flow through this admin endpoint only.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";

type APIEvent = AdminAPIEvent;

interface AnimeMapping {
  id: string;
  tmdb_id: number;
  tmdb_type: "movie" | "tv";
  anilist_id: number;
  anilist_type: "ANIME" | "MANGA";
  title: string | null;
  match_confidence: "high" | "medium" | "low" | "manual";
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface UpdateInput {
  id: string;
  tmdb_id?: number;
  tmdb_type?: "movie" | "tv";
  anilist_id?: number;
  anilist_type?: "ANIME" | "MANGA";
  title?: string | null;
  match_confidence?: "high" | "medium" | "low" | "manual";
}

const VALID_TMDB_TYPES = new Set(["movie", "tv"]);
const VALID_ANILIST_TYPES = new Set(["ANIME", "MANGA"]);
const VALID_CONFIDENCES = new Set(["high", "medium", "low", "manual"]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ─── GET (list with filters) ───────────────────────────────────────

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(event.request.url);
    const confidence = url.searchParams.get("confidence");
    const q = url.searchParams.get("q")?.trim();
    const limit = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10))
    );
    const offset = Math.max(
      0,
      parseInt(url.searchParams.get("offset") || "0", 10)
    );

    if (confidence && !VALID_CONFIDENCES.has(confidence)) {
      return jsonResponse(
        { error: "Invalid confidence value" },
        400
      );
    }

    const supabase = createAdminClient();

    let query = supabase
      .from("anime_mappings")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (confidence) {
      query = query.eq("match_confidence", confidence);
    }

    // Search by TMDB ID, AniList ID, or title (case-insensitive).
    // We try integer parse first; if it parses, search numeric columns;
    // otherwise fall back to ilike on title.
    if (q) {
      const asInt = parseInt(q, 10);
      if (!Number.isNaN(asInt) && asInt > 0) {
        // Use OR on numeric fields. Supabase's `.or()` syntax:
        //   "tmdb_id.eq.123,anilist_id.eq.123"
        query = query.or(`tmdb_id.eq.${asInt},anilist_id.eq.${asInt}`);
      } else {
        // Title search — ilike with wildcard.
        query = query.ilike("title", `%${q}%`);
      }
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[admin/anime-mappings] GET error:", error.message);
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({
      mappings: (data ?? []) as AnimeMapping[],
      total: count ?? 0,
      limit,
      offset
    });
  } catch (err) {
    console.error("[admin/anime-mappings] GET exception:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── PATCH (update — used for approve / edit / promote) ────────────

export async function PATCH(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "anime_mapping.update"
  );
  if (rateLimited) return rateLimited;

  try {
    const body = (await event.request
      .json()
      .catch(() => ({}))) as UpdateInput;
    if (!body.id) {
      return jsonResponse({ error: "id is required" }, 400);
    }

    // Validate any enum-valued fields before touching the DB.
    if (
      body.tmdb_type !== undefined &&
      !VALID_TMDB_TYPES.has(body.tmdb_type)
    ) {
      return jsonResponse({ error: "Invalid tmdb_type" }, 400);
    }
    if (
      body.anilist_type !== undefined &&
      !VALID_ANILIST_TYPES.has(body.anilist_type)
    ) {
      return jsonResponse({ error: "Invalid anilist_type" }, 400);
    }
    if (
      body.match_confidence !== undefined &&
      !VALID_CONFIDENCES.has(body.match_confidence)
    ) {
      return jsonResponse({ error: "Invalid match_confidence" }, 400);
    }
    if (
      body.tmdb_id !== undefined &&
      (typeof body.tmdb_id !== "number" || body.tmdb_id <= 0)
    ) {
      return jsonResponse({ error: "tmdb_id must be a positive integer" }, 400);
    }
    if (
      body.anilist_id !== undefined &&
      (typeof body.anilist_id !== "number" || body.anilist_id <= 0)
    ) {
      return jsonResponse(
        { error: "anilist_id must be a positive integer" },
        400
      );
    }

    const update: Record<string, unknown> = {};
    if (body.tmdb_id !== undefined) update.tmdb_id = body.tmdb_id;
    if (body.tmdb_type !== undefined) update.tmdb_type = body.tmdb_type;
    if (body.anilist_id !== undefined) update.anilist_id = body.anilist_id;
    if (body.anilist_type !== undefined) update.anilist_type = body.anilist_type;
    if (body.title !== undefined) update.title = body.title;
    if (body.match_confidence !== undefined) {
      update.match_confidence = body.match_confidence;
    }

    if (Object.keys(update).length === 0) {
      return jsonResponse({ error: "No fields to update" }, 400);
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("anime_mappings")
      .update(update)
      .eq("id", body.id)
      .select("*")
      .single();

    if (error || !data) {
      return jsonResponse(
        { error: error?.message ?? "Not found" },
        error ? 500 : 404
      );
    }

    await logAdminAction(event, adminResult.admin, {
      action: "anime_mapping.update",
      entity_type: "anime_mapping",
      entity_id: data.id,
      payload: { changes: update }
    });

    return jsonResponse({ mapping: data as AnimeMapping });
  } catch (err) {
    console.error("[admin/anime-mappings] PATCH exception:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── DELETE (remove a mapping) ─────────────────────────────────────

export async function DELETE(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "anime_mapping.delete"
  );
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(event.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse({ error: "id is required" }, 400);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("anime_mappings")
      .delete()
      .eq("id", id)
      .select("id, tmdb_id, anilist_id, title")
      .single();

    if (error || !data) {
      return jsonResponse(
        { error: error?.message ?? "Not found" },
        error ? 500 : 404
      );
    }

    await logAdminAction(event, adminResult.admin, {
      action: "anime_mapping.delete",
      entity_type: "anime_mapping",
      entity_id: id,
      payload: {
        tmdb_id: data.tmdb_id,
        anilist_id: data.anilist_id,
        title: data.title
      }
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[admin/anime-mappings] DELETE exception:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
