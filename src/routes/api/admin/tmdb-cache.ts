// src/routes/api/admin/tmdb-cache.ts
//
// CineLog V2 — Admin TMDB Cache API
// ---------------------------------------------------------------------
// Browse and invalidate the `tmdb_cache` table.
//
// Endpoints:
//   GET    /api/admin/tmdb-cache                    — paginated browse
//        ?page=&limit=&search=&media_type=&sort=
//   GET    /api/admin/tmdb-cache/stats              — cache hit/miss + size + oldest
//   GET    /api/admin/tmdb-cache?id=<uuid>          — single entry
//   DELETE /api/admin/tmdb-cache?id=<uuid>          — delete single entry
//   POST   /api/admin/tmdb-cache/invalidate-expired — bulk delete all expired
//   POST   /api/admin/tmdb-cache/refresh?id=<uuid>  — re-fetch from TMDB (TODO)

import { requireAdmin, type AdminAPIEvent } from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";

interface APIEvent extends AdminAPIEvent {}

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
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];

    // /api/admin/tmdb-cache/stats
    if (last === "stats") {
      return handleStats(event);
    }

    const id = url.searchParams.get("id");
    const supabase = createAdminClient();

    if (id) {
      const { data, error } = await supabase
        .from("tmdb_cache")
        .select("id, media_type, tmdb_id, data, expires_at, fetched_at, created_at, updated_at")
        .eq("id", id)
        .single();
      if (error || !data) return jsonResponse({ error: "Not found" }, 404);

      // Pull title out of the cached JSON for convenience
      const cached = data.data as Record<string, unknown> | null;
      const title = (cached?.title as string) || (cached?.name as string) || "Untitled";
      return jsonResponse({ entry: { ...data, title } });
    }

    // List with pagination
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25", 10)));
    const search = url.searchParams.get("search")?.trim() || "";
    const mediaType = url.searchParams.get("media_type"); // movie | tv
    const sort = url.searchParams.get("sort") || "updated_at"; // updated_at | expires_at | media_type

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("tmdb_cache")
      .select("id, media_type, tmdb_id, expires_at, fetched_at, created_at, updated_at", {
        count: "exact",
      });

    if (mediaType === "movie" || mediaType === "tv") {
      query = query.eq("media_type", mediaType);
    }

    // search by tmdb_id (numeric)
    if (search) {
      const asNum = parseInt(search, 10);
      if (!Number.isNaN(asNum)) {
        query = query.eq("tmdb_id", asNum);
      }
    }

    if (sort === "expires_at") {
      query = query.order("expires_at", { ascending: true });
    } else if (sort === "media_type") {
      query = query.order("media_type", { ascending: true }).order("tmdb_id", { ascending: true });
    } else {
      query = query.order("updated_at", { ascending: false });
    }

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) return jsonResponse({ error: error.message }, 500);

    // Annotate each row with expired flag + title (best-effort from cached data)
    const now = new Date();
    const annotated = (data ?? []).map((row) => {
      // We didn't select `data` to keep payload small; do a separate fetch if needed.
      // For list view we just expose metadata.
      return {
        ...row,
        expired: row.expires_at ? new Date(row.expires_at) < now : false,
      };
    });

    return jsonResponse({
      entries: annotated,
      total: count ?? 0,
      page,
      limit,
      total_pages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    console.error("[admin/tmdb-cache] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── Stats helper ──────────────────────────────────────────────────

async function handleStats(_event: APIEvent): Promise<Response> {
  const supabase = createAdminClient();

  const [totalRes, expiredRes, movieRes, tvRes, oldestRes, newestRes] = await Promise.all([
    supabase.from("tmdb_cache").select("id", { count: "exact", head: true }),
    supabase
      .from("tmdb_cache")
      .select("id", { count: "exact", head: true })
      .lt("expires_at", new Date().toISOString()),
    supabase.from("tmdb_cache").select("id", { count: "exact", head: true }).eq("media_type", "movie"),
    supabase.from("tmdb_cache").select("id", { count: "exact", head: true }).eq("media_type", "tv"),
    supabase
      .from("tmdb_cache")
      .select("fetched_at")
      .order("fetched_at", { ascending: true })
      .limit(1)
      .single(),
    supabase
      .from("tmdb_cache")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  // Total cache size — approximate via pg_total_relation_size
  let sizeBytes = 0;
  try {
    const { data: sizeData } = await supabase.rpc("get_tmdb_cache_size" as never);
    if (typeof sizeData === "number") sizeBytes = sizeData;
  } catch {
    // RPC may not exist — silently ignore
  }

  return jsonResponse({
    total: totalRes.count ?? 0,
    expired: expiredRes.count ?? 0,
    by_media_type: {
      movie: movieRes.count ?? 0,
      tv: tvRes.count ?? 0,
    },
    oldest_fetched_at: oldestRes.data?.fetched_at ?? null,
    newest_fetched_at: newestRes.data?.fetched_at ?? null,
    size_bytes: sizeBytes,
  });
}

// ─── DELETE (single entry) ─────────────────────────────────────────

export async function DELETE(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(event.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse({ error: "id is required" }, 400);

    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from("tmdb_cache")
      .select("id, media_type, tmdb_id")
      .eq("id", id)
      .single();

    const { error } = await supabase.from("tmdb_cache").delete().eq("id", id);
    if (error) return jsonResponse({ error: error.message }, 500);

    await logAdminAction(event, adminResult.admin, {
      action: "tmdb_cache.delete",
      entity_type: "tmdb_cache",
      entity_id: id,
      payload: { media_type: existing?.media_type, tmdb_id: existing?.tmdb_id },
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[admin/tmdb-cache] DELETE error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── POST (bulk invalidate expired) ────────────────────────────────
//
// We piggyback on POST. Two sub-actions:
//   ?action=invalidate-expired   → delete all rows where expires_at < now
//   ?action=invalidate-all       → truncate the cache (use with care)

export async function POST(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(event.request.url);
    const action = url.searchParams.get("action");

    const supabase = createAdminClient();

    if (action === "invalidate-expired") {
      const { count, error } = await supabase
        .from("tmdb_cache")
        .delete({ count: "exact" })
        .lt("expires_at", new Date().toISOString());

      if (error) return jsonResponse({ error: error.message }, 500);

      await logAdminAction(event, adminResult.admin, {
        action: "tmdb_cache.invalidate_expired",
        entity_type: "tmdb_cache",
        entity_id: "bulk",
        payload: { deleted: count ?? 0 },
      });

      return jsonResponse({ ok: true, deleted: count ?? 0 });
    }

    if (action === "invalidate-all") {
      const { count, error } = await supabase
        .from("tmdb_cache")
        .delete({ count: "exact" })
        .gte("created_at", "1970-01-01T00:00:00Z"); // delete everything

      if (error) return jsonResponse({ error: error.message }, 500);

      await logAdminAction(event, adminResult.admin, {
        action: "tmdb_cache.invalidate_all",
        entity_type: "tmdb_cache",
        entity_id: "bulk",
        payload: { deleted: count ?? 0 },
      });

      return jsonResponse({ ok: true, deleted: count ?? 0 });
    }

    return jsonResponse({ error: "Unknown action. Use ?action=invalidate-expired or invalidate-all" }, 400);
  } catch (err) {
    console.error("[admin/tmdb-cache] POST error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
