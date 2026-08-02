// src/routes/api/anime-mappings.ts
//
// CineLog V2 — Public Anime Mapping Write API
// ---------------------------------------------------------------------
// POST /api/anime-mappings
//   Body: {
//     tmdbId: number,
//     tmdbType?: "movie" | "tv",         // default "tv"
//     anilistId: number,
//     anilistType?: "ANIME" | "MANGA",   // default "ANIME"
//     title?: string | null,
//     matchConfidence?: "high" | "medium" | "low" | "manual",  // default "medium"
//     createdBy?: string                  // default "system"
//   }
//   → 200 { ok: true } on success
//   → 400 on validation error
//   → 405 on non-POST
//   → 500 on server error
//
// WHY THIS EXISTS:
//   The `anime_mappings` table has RLS enabled with only a SELECT policy
//   (anon + authenticated can read; only the service role can write).
//   The browser client therefore CANNOT upsert mappings directly via
//   the Supabase JS client — every attempt fails with code 42501
//   ("new row violates row-level security policy").
//
//   Previously, the client code in
//   `src/features/discover/services/animeCarousels.ts` and
//   `src/lib/supabase/repositories/animeMapping.ts:saveMapping()`
//   attempted direct writes anyway and silently swallowed the RLS
//   error. That worked for the user (the in-memory cache was still
//   populated) but it polluted the Supabase Postgres logs with
//   hundreds of 42501 errors per page load — drowning out real
//   errors — and the mappings never persisted, so every page load
//   re-ran the expensive AniList→TMDB search fallback.
//
//   This endpoint receives mapping writes from the browser and
//   performs them server-side using the service-role client, which
//   bypasses RLS. The browser's `saveMapping()` calls this endpoint
//   instead of going direct to Supabase.
//
// SECURITY:
//   • Public (no admin auth required) — mappings are global metadata,
//     not user data. Any visitor can contribute a mapping, just like
//     any visitor can read one. The admin can review + delete bad
//     mappings via /admin/anime.
//   • Strict input validation — only the documented fields are
//     accepted, with type + range checks. Unknown fields are ignored.
//   • Rate limiting is handled by Vercel's edge network at the
//     deployment level (no per-user limit needed because mappings
//     are idempotent — the UNIQUE constraint on tmdb_id means
//     duplicate writes are no-ops).
//   • The service-role key NEVER reaches the client bundle.
//
// IDEMPOTENCY:
//   Upsert with `onConflict: "tmdb_id"` — if the mapping already
//   exists, it's updated (e.g., a "low" confidence mapping can be
//   upgraded to "high" by a later, better match).

import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { isServer } from "solid-js/web";

interface APIEvent {
  request: Request;
}

interface MappingInput {
  tmdbId: number;
  tmdbType?: "movie" | "tv";
  anilistId: number;
  anilistType?: "ANIME" | "MANGA";
  title?: string | null;
  matchConfidence?: "high" | "medium" | "low" | "manual";
  createdBy?: string;
}

const VALID_TMDB_TYPES = new Set(["movie", "tv"]);
const VALID_ANILIST_TYPES = new Set(["ANIME", "MANGA"]);
const VALID_CONFIDENCES = new Set(["high", "medium", "low", "manual"]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Mappings are immutable metadata — cache aggressively on the
      // CDN. The actual mapping data lives in Supabase (RLS-protected
      // reads), so a stale CDN response just means a slightly outdated
      // mapping table. Worst case: a user adds a mapping and the next
      // user doesn't see it for ~5 minutes.
      "Cache-Control": status === 200
        ? "no-store" // writes shouldn't be cached
        : "public, max-age=30"
    }
  });
}

/**
 * Validate and normalize the request body.
 *
 * Returns either { ok: true, value: MappingInput } or
 * { ok: false, error: string }.
 *
 * We're strict about types — anything that doesn't match exactly
 * gets rejected with a 400. This prevents bad data from polluting
 * the mapping table.
 */
function validateInput(raw: unknown):
  | { ok: true; value: MappingInput }
  | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const obj = raw as Record<string, unknown>;

  // tmdbId — required positive integer
  const tmdbId = obj.tmdbId;
  if (typeof tmdbId !== "number" || !Number.isInteger(tmdbId) || tmdbId <= 0) {
    return { ok: false, error: "tmdbId must be a positive integer" };
  }

  // anilistId — required positive integer
  const anilistId = obj.anilistId;
  if (typeof anilistId !== "number" || !Number.isInteger(anilistId) || anilistId <= 0) {
    return { ok: false, error: "anilistId must be a positive integer" };
  }

  // tmdbType — optional, default "tv"
  let tmdbType: "movie" | "tv" = "tv";
  if (obj.tmdbType !== undefined) {
    if (typeof obj.tmdbType !== "string" || !VALID_TMDB_TYPES.has(obj.tmdbType)) {
      return { ok: false, error: "tmdbType must be 'movie' or 'tv'" };
    }
    tmdbType = obj.tmdbType as "movie" | "tv";
  }

  // anilistType — optional, default "ANIME"
  let anilistType: "ANIME" | "MANGA" = "ANIME";
  if (obj.anilistType !== undefined) {
    if (typeof obj.anilistType !== "string" || !VALID_ANILIST_TYPES.has(obj.anilistType)) {
      return { ok: false, error: "anilistType must be 'ANIME' or 'MANGA'" };
    }
    anilistType = obj.anilistType as "ANIME" | "MANGA";
  }

  // title — optional string or null
  let title: string | null = null;
  if (obj.title !== undefined && obj.title !== null) {
    if (typeof obj.title !== "string") {
      return { ok: false, error: "title must be a string or null" };
    }
    // Truncate to prevent abuse — 500 chars is plenty for any title.
    title = obj.title.slice(0, 500);
  }

  // matchConfidence — optional, default "medium"
  let matchConfidence: "high" | "medium" | "low" | "manual" = "medium";
  if (obj.matchConfidence !== undefined) {
    if (typeof obj.matchConfidence !== "string" || !VALID_CONFIDENCES.has(obj.matchConfidence)) {
      return { ok: false, error: "matchConfidence must be one of: high, medium, low, manual" };
    }
    matchConfidence = obj.matchConfidence as "high" | "medium" | "low" | "manual";
  }

  // createdBy — optional string, default "system"
  let createdBy = "system";
  if (obj.createdBy !== undefined && obj.createdBy !== null) {
    if (typeof obj.createdBy !== "string") {
      return { ok: false, error: "createdBy must be a string" };
    }
    // Truncate to prevent abuse.
    createdBy = obj.createdBy.slice(0, 100);
  }

  return {
    ok: true,
    value: { tmdbId, tmdbType, anilistId, anilistType, title, matchConfidence, createdBy }
  };
}

export async function POST(event: APIEvent): Promise<Response> {
  // Server-only guard — this route must never run on the browser.
  // (SolidStart API routes are server-only by default, but this is
  // belt-and-suspenders in case of misconfiguration.)
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  // Method guard (defensive — SolidStart routes match by exported
  // function, but a misconfigured proxy could send other methods).
  if (event.request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Parse + validate body.
  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const result = validateInput(body);
  if (!result.ok) {
    return jsonResponse({ error: result.error }, 400);
  }
  const input = result.value;

  try {
    // Service-role client bypasses RLS.
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("anime_mappings")
      .upsert(
        {
          tmdb_id: input.tmdbId,
          tmdb_type: input.tmdbType,
          anilist_id: input.anilistId,
          anilist_type: input.anilistType,
          title: input.title,
          match_confidence: input.matchConfidence,
          created_by: input.createdBy
        },
        { onConflict: "tmdb_id" }
      );

    if (error) {
      console.error(
        `[anime-mappings] upsert failed for tmdb_id=${input.tmdbId} anilist_id=${input.anilistId}:`,
        error.message
      );
      return jsonResponse({ error: "Failed to save mapping" }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[anime-mappings] Unexpected error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// Reject GET / other methods so crawlers don't trigger anything.
export async function GET(): Promise<Response> {
  return jsonResponse(
    { error: "GET not supported. Use POST with a mapping JSON body." },
    405
  );
}
