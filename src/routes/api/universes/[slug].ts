// src/routes/api/universes/[slug].ts
//
// CineLog V2 — Public Universe API (Phase 9 Chunk 5a)
// ---------------------------------------------------------------------
// Returns the full enriched universe data for a single curated universe
// by slug OR id. Public read — no auth required.
//
// Response shape:
//   {
//     universe: { ...all curated_universes columns... },
//     entries:  [ ...all curated_universe_entries columns + TMDB metadata... ],
//     phases:   [ ...all universe_phases columns... ],
//     viewing_orders: [ { ...order metadata..., entry_ids: [...] } ]
//   }
//
// This endpoint is the canonical server-side fetch for the user-side
// CollectionDetailPage. The client-side adapter
// (`fetchCuratedUniverseBySlug`) is still used by the SPA for in-app
// navigation; this endpoint exists for:
//   - Server-side rendering / prefetching
//   - External integrations (Discord bots, share cards, etc.)
//   - The admin "Preview as user" link
//
// RLS: curated_universes / curated_universe_entries / universe_phases /
//      universe_viewing_orders / universe_viewing_order_entries all have
//      `SELECT` policies for anon + authenticated. No service role needed.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, s-maxage=300"
    }
  });
}

interface UniverseAPIEvent {
  request: Request;
  params: { slug?: string };
}

export async function GET(event: UniverseAPIEvent) {
  try {
    const slug = event.params.slug;
    if (!slug) return jsonResponse({ error: "slug is required" }, 400);

    const { getClient } = await import("~/lib/supabase/client");
    const supabase = getClient();

    // 1. Resolve the universe — try slug first, fall back to id (UUID).
    let universe: Record<string, unknown> | null = null;

    const { data: bySlug, error: slugError } = await supabase
      .from("curated_universes")
      .select(
        "id,slug,name,description,cover_url,banner_url,color,default_view,created_at,updated_at,lore,franchise_type,viewing_order_guide,color_theme,total_entries"
      )
      .eq("slug", slug)
      .maybeSingle();
    if (slugError) {
      console.error("[api/universes/[slug]] slug lookup error:", slugError);
    }
    if (bySlug) {
      universe = bySlug as Record<string, unknown>;
    } else {
      const { data: byId, error: idError } = await supabase
        .from("curated_universes")
        .select(
          "id,slug,name,description,cover_url,banner_url,color,default_view,created_at,updated_at,lore,franchise_type,viewing_order_guide,color_theme,total_entries"
        )
        .eq("id", slug)
        .maybeSingle();
      if (idError) {
        console.error("[api/universes/[slug]] id lookup error:", idError);
      }
      universe = (byId as Record<string, unknown>) ?? null;
    }

    if (!universe) {
      return jsonResponse({ error: "Universe not found" }, 404);
    }

    const universeId = universe.id as string;

    // 2. Fetch entries in parallel with phases + viewing orders.
    const [entriesResult, phasesResult, ordersResult] = await Promise.all([
      supabase
        .from("curated_universe_entries")
        .select(
          "id,universe_id,tmdb_id,media_type,position,incident_year,note,created_at,sub_universe,viewing_order,story_note,key_events,is_entry_point"
        )
        .eq("universe_id", universeId)
        .order("position", { ascending: true }),
      supabase
        .from("universe_phases")
        .select(
          "id,universe_id,label,description,before_entry_id,order_index,created_at,updated_at,cover_url,sub_universe,viewing_order,lore"
        )
        .eq("universe_id", universeId)
        .order("order_index", { ascending: true }),
      supabase
        .from("universe_viewing_orders")
        .select(
          "id,universe_id,name,description,is_default,created_at,updated_at"
        )
        .eq("universe_id", universeId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
    ]);

    if (entriesResult.error) {
      console.error(
        "[api/universes/[slug]] entries error:",
        entriesResult.error
      );
    }
    if (phasesResult.error) {
      console.error(
        "[api/universes/[slug]] phases error:",
        phasesResult.error
      );
    }
    if (ordersResult.error) {
      console.error(
        "[api/universes/[slug]] orders error:",
        ordersResult.error
      );
    }

    const entries = (entriesResult.data ?? []) as Array<{
      id: string;
      universe_id: string;
      tmdb_id: number;
      media_type: "movie" | "tv";
      position: number;
      incident_year: number | null;
      note: string | null;
      created_at: string;
      sub_universe: string | null;
      viewing_order: number | null;
      story_note: string | null;
      key_events: string[] | null;
      is_entry_point: boolean | null;
    }>;

    const phases = (phasesResult.data ?? []) as Array<Record<string, unknown>>;

    const orders = (ordersResult.data ?? []) as Array<{
      id: string;
      universe_id: string;
      name: string;
      description: string | null;
      is_default: boolean;
      created_at: string;
      updated_at: string;
    }>;

    // 3. Batch-fetch TMDB metadata for entries (title, poster, release_date).
    let enrichedEntries: Array<Record<string, unknown>> = entries;
    if (entries.length > 0) {
      try {
        const { fetchTmdbMetadataBatch } = await import("~/core/tmdb/tmdb");
        const items = entries.map((e) => ({
          mediaType: e.media_type,
          tmdbId: e.tmdb_id
        }));
        const tmdbMap = await fetchTmdbMetadataBatch(items);
        enrichedEntries = entries.map((e) => {
          const key = `${e.media_type}/${e.tmdb_id}`;
          const tmdb = tmdbMap.get(key) as
            | {
                title?: string;
                name?: string;
                poster_path?: string;
                backdrop_path?: string;
                release_date?: string;
                first_air_date?: string;
                runtime?: number;
              }
            | undefined;
          return {
            ...e,
            title: tmdb?.title ?? tmdb?.name ?? null,
            poster_path: tmdb?.poster_path ?? null,
            backdrop_path: tmdb?.backdrop_path ?? null,
            release_date: tmdb?.release_date ?? tmdb?.first_air_date ?? null,
            runtime: tmdb?.runtime ?? null
          };
        });
      } catch (tmdbErr) {
        console.error(
          "[api/universes/[slug]] TMDB enrichment failed:",
          tmdbErr
        );
        // Continue without enrichment — entries still have raw fields.
      }
    }

    // 4. Batch-fetch viewing order entry IDs.
    let viewingOrdersWithEntries = orders.map((o) => ({
      ...o,
      entry_ids: [] as string[]
    }));
    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      const { data: oeRows, error: oeError } = await supabase
        .from("universe_viewing_order_entries")
        .select("order_id, entry_id, position")
        .in("order_id", orderIds)
        .order("position", { ascending: true });
      if (oeError) {
        console.error(
          "[api/universes/[slug]] viewing order entries error:",
          oeError
        );
      } else if (oeRows) {
        const byOrder = new Map<string, string[]>();
        for (const row of oeRows as Array<{
          order_id: string;
          entry_id: string;
          position: number;
        }>) {
          const list = byOrder.get(row.order_id) ?? [];
          list.push(row.entry_id);
          byOrder.set(row.order_id, list);
        }
        viewingOrdersWithEntries = orders.map((o) => ({
          ...o,
          entry_ids: byOrder.get(o.id) ?? []
        }));
      }
    }

    return jsonResponse({
      universe,
      entries: enrichedEntries,
      phases,
      viewing_orders: viewingOrdersWithEntries
    });
  } catch (err) {
    console.error("[api/universes/[slug]] GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
