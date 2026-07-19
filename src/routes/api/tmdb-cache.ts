/**
 * CineLog V2 — Server API: TMDB Cache
 * ---------------------------------------------------------------------
 * Server-side API route for reading/writing the tmdb_cache table.
 * Uses the SUPABASE_SERVICE_ROLE_KEY (server-only) to bypass RLS,
 * since tmdb_cache is shared metadata (not user-specific).
 *
 * Endpoints:
 *   GET  /api/tmdb-cache?keys=movie/550,tv/1399  — batch read cached metadata
 *   POST /api/tmdb-cache                          — batch upsert metadata
 *   GET  /api/tmdb-cache/stale                    — find entries needing refresh
 *
 * Security: The service_role key is NEVER exposed to the client.
 * This route runs server-side only (Vinxi/Nitro).
 */

import { createClient } from "@supabase/supabase-js";

// ─── Service-role Supabase client (server-only!) ──────────────────
function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// ─── GET /api/tmdb-cache ─────────────────────────────────────────
// Query params: keys — comma-separated list of "movie/550,tv/1399" keys
// Returns: { data: Record<string, TMDBTitle | null> }
export async function GET(event: any) {
  try {
    const url = new URL(event.request.url);
    const keysParam = url.searchParams.get("keys");

    if (!keysParam) {
      return new Response(JSON.stringify({ data: {} }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const keys = keysParam.split(",").filter(Boolean);
    if (keys.length === 0) {
      return new Response(JSON.stringify({ data: {} }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const supabase = getServiceClient();

    // Batch fetch all requested keys
    const { data, error } = await supabase
      .from("tmdb_cache")
      .select("key,data,expires_at")
      .in("key", keys);

    if (error) {
      console.error("[tmdb-cache API] Read error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Build a map of key → data, excluding expired entries
    const now = new Date().toISOString();
    const result: Record<string, any> = {};
    for (const row of (data ?? [])) {
      if (row.expires_at && row.expires_at > now) {
        result[row.key] = row.data;
      }
    }

    return new Response(JSON.stringify({ data: result }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=600"
      }
    });
  } catch (err: any) {
    console.error("[tmdb-cache API] GET error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// ─── POST /api/tmdb-cache ────────────────────────────────────────
// Body: { entries: Array<{ key: string, tmdb_id: number, media_type: "movie"|"tv", data: object }> }
// Returns: { upserted: number }
export async function POST(event: any) {
  try {
    const body = await event.request.json();
    const entries = body?.entries;

    if (!Array.isArray(entries) || entries.length === 0) {
      return new Response(JSON.stringify({ upserted: 0 }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const supabase = getServiceClient();

    // Set expires_at to 7 days from now
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const rows = entries.map((entry: any) => ({
      key: entry.key,
      tmdb_id: entry.tmdb_id,
      media_type: entry.media_type,
      data: entry.data,
      expires_at: expiresAt,
    }));

    // Batch upsert — insert new, update existing
    const { error } = await supabase
      .from("tmdb_cache")
      .upsert(rows, { onConflict: "key", ignoreDuplicates: false });

    if (error) {
      console.error("[tmdb-cache API] Write error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ upserted: rows.length }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("[tmdb-cache API] POST error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
