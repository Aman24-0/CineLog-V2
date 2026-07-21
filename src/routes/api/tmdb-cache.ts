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
 *
 * Table schema (tmdb_cache):
 *   id (uuid PK), media_type (enum), tmdb_id (int), data (jsonb),
 *   expires_at (timestamptz), fetched_at (timestamptz),
 *   created_at (timestamptz), updated_at (timestamptz)
 *
 * The composite key is (media_type, tmdb_id) — NOT a separate "key" column.
 * The "keys" query param uses the format "movie/550,tv/1399" which is
 * parsed into (media_type, tmdb_id) pairs for the DB query.
 *
 * Security: The service_role key is NEVER exposed to the client.
 * This route runs server-side only (Vinxi/Nitro).
 */

import { createClient } from "@supabase/supabase-js";

// ─── Type definitions ─────────────────────────────────────────────
//
// SolidStart/Nitro passes a `H3Event`-shaped object to route handlers.
// We define a minimal structural type instead of importing the full
// H3 types (which would require adding `h3` as a dependency). This
// gives us type safety on `event.request` without `any`.

interface APIEvent {
  request: Request;
}

/** A single row returned from the tmdb_cache table (subset of columns). */
interface TmdbCacheRow {
  media_type: string;
  tmdb_id: number;
  data: unknown;
  expires_at: string | null;
}

/** Entry in the POST body for batch upsert. */
interface CacheUpsertEntry {
  tmdb_id: number;
  media_type: "movie" | "tv";
  data: unknown;
}

/** Row shape for the Supabase upsert call. */
interface CacheUpsertRow {
  tmdb_id: number;
  media_type: "movie" | "tv";
  data: unknown;
  expires_at: string;
}

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

/**
 * Parse "movie/550" → { mediaType: "movie", tmdbId: 550 }
 */
function parseKey(key: string): { mediaType: string; tmdbId: number } | null {
  const [mediaType, idStr] = key.split("/");
  const tmdbId = Number(idStr);
  if (!mediaType || !idStr || isNaN(tmdbId)) return null;
  return { mediaType, tmdbId };
}

// ─── GET /api/tmdb-cache ─────────────────────────────────────────
// Query params: keys — comma-separated list of "movie/550,tv/1399" keys
// Returns: { data: Record<string, TMDBTitle | null> }
export async function GET(event: APIEvent) {
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

    // Parse keys into (media_type, tmdb_id) pairs
    const pairs: Array<{ mediaType: string; tmdbId: number; originalKey: string }> = [];
    for (const key of keys) {
      const parsed = parseKey(key);
      if (parsed) {
        pairs.push({ ...parsed, originalKey: key });
      }
    }

    if (pairs.length === 0) {
      return new Response(JSON.stringify({ data: {} }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const supabase = getServiceClient();

    // Build OR filter for all (media_type, tmdb_id) pairs
    // PostgREST or() syntax: or(media_type.eq.movie,tmdb_id.eq.550)
    // For multiple pairs, we chain .or() calls or use a single composite OR
    //
    // Strategy: query all rows matching any of the tmdb_ids, then
    // filter client-side for exact (media_type, tmdb_id) matches.
    // This is more efficient than N separate queries.
    const tmdbIds = [...new Set(pairs.map((p) => p.tmdbId))];
    const mediaTypes = [...new Set(pairs.map((p) => p.mediaType))];

    const { data, error } = await supabase
      .from("tmdb_cache")
      .select("media_type,tmdb_id,data,expires_at")
      .in("tmdb_id", tmdbIds)
      .in("media_type", mediaTypes);

    if (error) {
      console.error("[tmdb-cache API] Read error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Build a map of key → data, excluding expired entries.
    // Rows with null expires_at are treated as non-expiring (they
    // should always be included).
    const now = new Date().toISOString();
    const result: Record<string, unknown> = {};
    for (const row of (data ?? []) as TmdbCacheRow[]) {
      // Include if no expiry set, or not yet expired
      if (!row.expires_at || row.expires_at > now) {
        const key = `${row.media_type}/${row.tmdb_id}`;
        result[key] = row.data;
      }
    }

    return new Response(JSON.stringify({ data: result }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=600"
      }
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[tmdb-cache API] GET error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// ─── POST /api/tmdb-cache ────────────────────────────────────────
// Body: { entries: Array<{ key: string, tmdb_id: number, media_type: "movie"|"tv", data: object }> }
// Returns: { upserted: number }
export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json() as { entries?: CacheUpsertEntry[] };
    const entries = body?.entries;

    if (!Array.isArray(entries) || entries.length === 0) {
      return new Response(JSON.stringify({ upserted: 0 }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const supabase = getServiceClient();

    // Set expires_at to 7 days from now
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const rows: CacheUpsertRow[] = entries.map((entry) => ({
      tmdb_id: entry.tmdb_id,
      media_type: entry.media_type,
      data: entry.data,
      expires_at: expiresAt,
    }));

    // Batch upsert — insert new, update existing
    // The unique constraint is on (media_type, tmdb_id)
    const { error } = await supabase
      .from("tmdb_cache")
      .upsert(rows, { onConflict: "media_type,tmdb_id", ignoreDuplicates: false });

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
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[tmdb-cache API] POST error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
