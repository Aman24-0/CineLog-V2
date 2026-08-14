// src/routes/api/ott/batch-availability.ts
//
// CineLog V2 — JustWatch OTT API: Batch Availability
// ---------------------------------------------------------------------
// Batch-fetch JustWatch OTT availability for up to 25 TMDB titles in a
// single country. Eliminates the N+1 query problem for rendering
// "Where to Watch" badges across a Discover / Watchlist grid.
//
// Endpoint:
//   POST /api/ott/batch-availability
//
// Request body:
//   {
//     "items": [
//       { "tmdbId": 530385, "mediaType": "movie", "title": "Demon Slayer: Mugen Train", "releaseYear": 2020 },
//       ...
//     ]
//   }
//
// Response (200):
//   {
//     "country": "IN",
//     "results": {
//       "movie:530385": { "nodeId": "...", "offers": [ ... ] },
//       ...
//     }
//   }
//
// Response (400):
//   { "error": "batch limit exceeded" }
//
// Behavior:
//   1. Validate body shape — `items` must be an array.
//   2. Reject > 25 items with 400 "batch limit exceeded".
//   3. Per-item: drop items with invalid mediaType or non-positive
//      tmdbId (do not fail the whole batch for one bad item).
//   4. Resolve country via `resolveJustWatchCountry` (anonymous → "US").
//   5. Call `batchGetTitleOttAvailability({ items, country })` —
//      cache-first per item, then a single batched JustWatch offers
//      GraphQL request for all uncached+resolved items.
//   6. Return `{ country, results }`. Items that could not be resolved
//      or had no offers are OMITTED from `results`.
//
// Caching:
//   - Success: `public, max-age=300, s-maxage=600`.
//   - 400 error: `public, max-age=0, s-maxage=0, no-store`.
//
// Auth: optional. Anonymous callers get "US" country. NEVER returns 401
// for missing/invalid session — the route always fails open with HTTP 200
// (or 400 for invalid input) — mirrors `/api/audio-languages/[tmdbId]`.

import { batchGetTitleOttAvailability } from "~/server/justwatch/service";
import { resolveJustWatchCountry } from "~/server/justwatch/region";

interface APIEvent {
  request: Request;
}

interface BatchItem {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title?: string;
  releaseYear?: number | null;
}

interface BatchRequestBody {
  items?: BatchItem[];
}

const CACHE_HEADERS_SUCCESS = {
  "Cache-Control": "public, max-age=300, s-maxage=600",
  "Content-Type": "application/json"
};

const CACHE_HEADERS_400 = {
  "Cache-Control": "public, max-age=0, s-maxage=0, no-store",
  "Content-Type": "application/json"
};

const MAX_BATCH = 25;

// ─── CORS (same pattern as /api/audio-languages/[tmdbId].ts) ─────────

function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  let appBaseUrl: string;
  try {
    appBaseUrl =
      (import.meta as ImportMeta & { env?: Record<string, string> }).env
        ?.VITE_APP_BASE_URL ?? "https://cinelogv2.vercel.app";
  } catch {
    appBaseUrl = "https://cinelogv2.vercel.app";
  }
  appBaseUrl = appBaseUrl.replace(/\/+$/, "");
  const allowedOrigins = [appBaseUrl];
  if (appBaseUrl.includes("vercel.app")) {
    try {
      const url = new URL(origin);
      if (url.hostname.endsWith(".vercel.app")) return origin;
    } catch {
      /* ignore */
    }
  }
  if (
    appBaseUrl.includes("localhost") ||
    origin.startsWith("http://localhost:") ||
    origin === "http://localhost:3000"
  ) {
    allowedOrigins.push("http://localhost:3000");
    if (origin.startsWith("http://localhost:")) return origin;
  }
  if (allowedOrigins.includes(origin)) return origin;
  return null;
}

function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = getAllowedOrigin(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin"
  };
}

/**
 * Validate a single batch item. Returns the cleaned item or null if
 * the item is malformed (wrong mediaType, non-numeric tmdbId, etc.).
 */
function cleanItem(raw: unknown): BatchItem | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const mediaType = obj.mediaType;
  if (mediaType !== "movie" && mediaType !== "tv") return null;

  const tmdbIdRaw = obj.tmdbId;
  const tmdbId =
    typeof tmdbIdRaw === "number"
      ? tmdbIdRaw
      : typeof tmdbIdRaw === "string"
        ? parseInt(tmdbIdRaw, 10)
        : NaN;
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return null;

  const title =
    typeof obj.title === "string" && obj.title.length > 0 ? obj.title : undefined;

  const yearRaw = obj.releaseYear;
  let releaseYear: number | null = null;
  if (typeof yearRaw === "number" && Number.isFinite(yearRaw) && yearRaw > 0) {
    releaseYear = yearRaw;
  } else if (typeof yearRaw === "string" && yearRaw !== "") {
    const parsed = Number(yearRaw);
    releaseYear = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return { tmdbId, mediaType, title, releaseYear };
}

// ─── POST handler ────────────────────────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  const corsHeaders = buildCorsHeaders(event.request);
  try {
    // ── Parse body ────────────────────────────────────────────────
    let body: BatchRequestBody;
    try {
      body = (await event.request.json()) as BatchRequestBody;
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, ...CACHE_HEADERS_400 } }
      );
    }

    if (!body || !Array.isArray(body.items)) {
      return new Response(
        JSON.stringify({ error: "Missing 'items' array in request body" }),
        { status: 400, headers: { ...corsHeaders, ...CACHE_HEADERS_400 } }
      );
    }

    if (body.items.length > MAX_BATCH) {
      return new Response(
        JSON.stringify({ error: "batch limit exceeded" }),
        { status: 400, headers: { ...corsHeaders, ...CACHE_HEADERS_400 } }
      );
    }

    // ── Clean + validate each item ────────────────────────────────
    const items: BatchItem[] = [];
    for (const raw of body.items) {
      const cleaned = cleanItem(raw);
      if (cleaned) items.push(cleaned);
    }

    if (items.length === 0) {
      // Resolve country even for empty batches so the response shape
      // is consistent. Never throws.
      let country = "US";
      try {
        country = await resolveJustWatchCountry(event.request);
      } catch (err) {
        console.warn(
          "[/api/ott/batch-availability] resolveJustWatchCountry threw:",
          err instanceof Error ? err.message : String(err)
        );
      }
      return new Response(
        JSON.stringify({ country, results: {} }),
        { status: 200, headers: { ...corsHeaders, ...CACHE_HEADERS_SUCCESS } }
      );
    }

    // ── Resolve country (anonymous → "US", never throws) ───────────
    let country = "US";
    try {
      country = await resolveJustWatchCountry(event.request);
    } catch (err) {
      console.warn(
        "[/api/ott/batch-availability] resolveJustWatchCountry threw:",
        err instanceof Error ? err.message : String(err)
      );
    }

    // ── Batch fetch ───────────────────────────────────────────────
    let results: Record<string, unknown>;
    try {
      results = await batchGetTitleOttAvailability({ items, country });
    } catch (err) {
      console.warn(
        "[/api/ott/batch-availability] batchGetTitleOttAvailability threw:",
        err instanceof Error ? err.message : String(err)
      );
      results = {};
    }

    return new Response(
      JSON.stringify({ country, results }),
      { status: 200, headers: { ...corsHeaders, ...CACHE_HEADERS_SUCCESS } }
    );
  } catch (err) {
    console.warn(
      "[/api/ott/batch-availability] POST error:",
      err instanceof Error ? err.message : String(err)
    );
    // Defensive fallback — never throw to client, never return 401
    return new Response(
      JSON.stringify({ country: "US", results: {} }),
      { status: 200, headers: { ...corsHeaders, ...CACHE_HEADERS_SUCCESS } }
    );
  }
}

// ─── OPTIONS handler (CORS preflight) ────────────────────────────────

export async function OPTIONS(event: APIEvent): Promise<Response> {
  const corsHeaders = buildCorsHeaders(event.request);
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Max-Age": "86400"
    }
  });
}
