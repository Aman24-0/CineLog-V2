/**
 * CineLog V2 — Server API: MDBList Ratings
 * ---------------------------------------------------------------------
 * Server-side API route that fetches aggregated ratings (IMDb, Rotten
 * Tomatoes, Metacritic) for a TMDB title via the MDBList API.
 *
 * Endpoint:
 *   GET /api/media/ratings?tmdb={tmdbId}
 *
 * Why this exists:
 *   1. API key security — MDBLIST_API_KEY is read from server-side env
 *      and NEVER exposed to the browser (no VITE_ prefix). The client
 *      only calls our own /api/media/ratings route.
 *   2. Aggregated source — MDBList normalizes ratings from IMDb, RT,
 *      Metacritic (and more) into a single response. We don't need to
 *      hit three separate APIs.
 *   3. Vote counts — MDBList returns both the score AND the vote count
 *      for each service, which OMDb doesn't provide consistently. This
 *      lets us render "8.0 (11K)" instead of just "8.0".
 *   4. CDN caching — long-term Cache-Control headers let Vercel's CDN
 *      cache responses for 24h (ratings change slowly), reducing
 *      MDBList API calls and improving latency.
 *
 * Payload shape (200):
 *   {
 *     imdb:          { score: "8.0",  votes: "11K" },
 *     rottenTomatoes: { score: "85%", votes: "6K"  },
 *     metacritic:    { score: "77",  votes: "432" }
 *   }
 *
 * When a service is unavailable, its object is `null`:
 *   { imdb: { ... }, rottenTomatoes: null, metacritic: null }
 *
 * Error responses:
 *   400 — missing or invalid ?tmdb= query param
 *   500 — MDBLIST_API_KEY not configured or upstream fetch failed
 *   502 — MDBList returned a non-2xx response
 *
 * Security: MDBLIST_API_KEY is server-only (no VITE_ prefix). It is
 * NEVER exposed to the browser. Falls back gracefully to a 500 with a
 * clear error message if the key is missing.
 */

import { formatVoteCount } from "~/shared/utils/format";

// ─── Types ────────────────────────────────────────────────────────────
//
// SolidStart/Nitro passes a H3Event-shaped object to route handlers.
// We define a minimal structural type for type safety without importing h3.

interface APIEvent {
  request: Request;
}

/** A single service's rating + vote count. */
interface ServiceRating {
  /** Display-formatted score, e.g. "8.0", "85%", "77". "NR" if unavailable. */
  score: string;
  /** Compact vote count, e.g. "11K", "432". "0" if unavailable. */
  votes: string;
}

/** The public API response payload. */
interface RatingsPayload {
  imdb: ServiceRating | null;
  rottenTomatoes: ServiceRating | null;
  metacritic: ServiceRating | null;
}

/**
 * MDBList API response shape (subset — only the fields we read).
 *
 * MDBList returns a `ratings` array of { source, value, votes } objects
 * for each aggregator. The `source` is a lowercase identifier like
 * "imdb", "rotten_tomatoes", "metacritic". Some entries also appear
 * under top-level scalar fields (e.g. `imdbrating`, `imdbvotes`) but
 * the `ratings` array is the canonical source.
 */
interface MdbListRatingEntry {
  source?: string;
  value?: number | string | null;
  votes?: number | string | null;
  score?: number | string | null;
}

interface MdbListResponse {
  id?: number;
  ratings?: MdbListRatingEntry[];
  // Some MDBList plans/versions expose these top-level fields too — used
  // as a fallback when the `ratings` array is missing.
  imdbrating?: number | string | null;
  imdbvotes?: number | string | null;
  trakt_rating?: number | string | null;
  trakt_votes?: number | string | null;
  rt_rating?: number | string | null;
  rt_votes?: number | string | null;
  metacritic_rating?: number | string | null;
  metacritic_votes?: number | string | null;
  // MDBList returns an error message string on failure (not HTTP status).
  response?: string;
  error?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────

const MDBLIST_BASE = "https://api.mdblist.com";

// Cache-Control for successful responses.
// public                       — Vercel CDN can cache across users
// max-age=86400 (24h)          — browser cache: 24 hours
// s-maxage=86400 (24h)         — CDN cache: 24 hours
// stale-while-revalidate=604800 — serve stale for up to 7 days while
//   revalidating in the background (ratings change slowly; a week-old
//   rating is fine to serve while we fetch a fresh one)
const CACHE_HEADERS_SUCCESS = {
  "Cache-Control":
    "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
};

// Shorter cache for errors — don't poison the CDN with long-lived 4xx/5xx
const CACHE_HEADERS_ERROR = {
  "Cache-Control": "public, max-age=60, s-maxage=120",
};

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Read the MDBList API key from server-side environment variables.
 *
 * MDBLIST_API_KEY is the primary variable (no VITE_ prefix → server-only).
 * We do NOT fall back to a VITE_ prefixed variant because the MDBList key
 * is a private API key that must never ship to the browser bundle.
 *
 * @throws Error if the key is not set. The GET handler catches this and
 *   returns a 500 with a clear error message.
 */
function getMdbListApiKey(): string {
  const key = process.env.MDBLIST_API_KEY;
  if (!key) {
    throw new Error("MDBLIST_API_KEY is not set in server environment");
  }
  return key;
}

/**
 * Normalize a rating value from MDBList into a display string.
 *
 * MDBList returns ratings as numbers (8.0, 85, 77) or strings ("8.0",
 * "85%"). We normalize:
 *   - IMDb → "8.0" (one decimal, 0–10 scale)
 *   - RT   → "85%" (append %, 0–100 scale)
 *   - Metacritic → "77" (integer, 0–100 scale)
 *
 * Returns "NR" for null/undefined/invalid values.
 */
function normalizeScore(
  source: "imdb" | "rotten_tomatoes" | "metacritic",
  raw: number | string | null | undefined,
): string {
  if (raw == null) return "NR";
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (!Number.isFinite(n) || n <= 0) return "NR";

  if (source === "imdb") {
    // IMDb is 0.0–10.0 → one decimal
    return n.toFixed(1);
  }
  if (source === "rotten_tomatoes") {
    // RT is 0–100 → integer + %
    return `${Math.round(n)}%`;
  }
  // Metacritic is 0–100 → integer
  return `${Math.round(n)}`;
}

/**
 * Find a rating entry in the MDBList `ratings` array by source name.
 * MDBList uses lowercase identifiers: "imdb", "rotten_tomatoes",
 * "metacritic". We match case-insensitively for safety.
 */
function findRatingEntry(
  ratings: MdbListRatingEntry[] | undefined,
  source: string,
): MdbListRatingEntry | null {
  if (!Array.isArray(ratings)) return null;
  const lower = source.toLowerCase();
  return ratings.find((r) => (r.source ?? "").toLowerCase() === lower) ?? null;
}

/**
 * Keys on MdbListResponse that hold a scalar rating/votes value (not the
 * `ratings` array). Used to type the top-level fallback fields safely.
 */
type ScalarRatingKey =
  | "imdbrating"
  | "imdbvotes"
  | "trakt_rating"
  | "trakt_votes"
  | "rt_rating"
  | "rt_votes"
  | "metacritic_rating"
  | "metacritic_votes";

/**
 * Extract the score + votes for a single service from the MDBList
 * response. Checks the `ratings` array first, then falls back to the
 * top-level scalar fields (imdbrating, rt_rating, etc.).
 *
 * Returns null if no rating is available for this service.
 */
function extractServiceRating(
  data: MdbListResponse,
  source: "imdb" | "rotten_tomatoes" | "metacritic",
  topLevelScoreKey?: ScalarRatingKey,
  topLevelVotesKey?: ScalarRatingKey,
): ServiceRating | null {
  // 1. Try the ratings array (canonical source)
  const entry = findRatingEntry(data.ratings, source);

  // 2. Fall back to top-level scalar fields if the array entry is missing.
  //    We cast to the union of accepted types — the scalar keys only hold
  //    numbers/strings/null, never arrays.
  const rawScore =
    entry?.value ??
    entry?.score ??
    (topLevelScoreKey ? (data[topLevelScoreKey] as number | string | null | undefined) : null);
  const rawVotes =
    entry?.votes ??
    (topLevelVotesKey ? (data[topLevelVotesKey] as number | string | null | undefined) : null);

  const score = normalizeScore(source, rawScore ?? null);
  const votes = formatVoteCount(rawVotes ?? null);

  // If the score is "NR" AND votes is "0", the service genuinely has no
  // data — return null so the UI can show "NR" cleanly.
  if (score === "NR" && votes === "0") return null;

  return { score, votes };
}

// ─── GET handler ──────────────────────────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const url = new URL(event.request.url);
    const tmdbId = url.searchParams.get("tmdb");

    // Validate ?tmdb= — must be present and a positive integer
    if (!tmdbId) {
      return new Response(
        JSON.stringify({ error: "Missing required query param: tmdb" }),
        {
          status: 400,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR },
        },
      );
    }
    const tmdbNum = parseInt(tmdbId, 10);
    if (!Number.isFinite(tmdbNum) || tmdbNum <= 0) {
      return new Response(
        JSON.stringify({ error: `Invalid tmdb id: "${tmdbId}"` }),
        {
          status: 400,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR },
        },
      );
    }

    // Read the server-side API key
    let apiKey: string;
    try {
      apiKey = getMdbListApiKey();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ratings] Config error:", msg);
      return new Response(
        JSON.stringify({ error: "Rating service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR },
        },
      );
    }

    // Fetch from MDBList
    // Query: https://api.mdblist.com/?apikey=KEY&tmdb=TMDBID
    const upstreamUrl = `${MDBLIST_BASE}/?apikey=${encodeURIComponent(apiKey)}&tmdb=${tmdbNum}`;
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl, {
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      console.error("[ratings] Upstream fetch failed:", err);
      return new Response(
        JSON.stringify({ error: "Failed to reach rating service" }),
        {
          status: 502,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR },
        },
      );
    }

    // MDBList returns 200 even for "not found" — the body has an error field.
    // Non-200 HTTP status is a real upstream failure.
    if (!upstreamRes.ok) {
      console.error(`[ratings] MDBList returned ${upstreamRes.status}`);
      return new Response(
        JSON.stringify({ error: `Rating service returned ${upstreamRes.status}` }),
        {
          status: 502,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR },
        },
      );
    }

    let data: MdbListResponse;
    try {
      data = (await upstreamRes.json()) as MdbListResponse;
    } catch (err) {
      console.error("[ratings] Failed to parse MDBList JSON:", err);
      return new Response(
        JSON.stringify({ error: "Invalid response from rating service" }),
        {
          status: 502,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR },
        },
      );
    }

    // MDBList error field (e.g. "Movie not found")
    if (data.response === "False" || (typeof data.error === "string" && data.error)) {
      console.warn("[ratings] MDBList error:", data.error);
      // Return empty ratings rather than an error — the UI shows "NR"
      const empty: RatingsPayload = {
        imdb: null,
        rottenTomatoes: null,
        metacritic: null,
      };
      return new Response(JSON.stringify(empty), {
        status: 200,
        headers: { ...corsHeaders, ...CACHE_HEADERS_SUCCESS },
      });
    }

    // Extract each service. MDBList's `ratings` array uses these source
    // identifiers; the top-level scalar fields are fallbacks for older
    // API versions.
    const payload: RatingsPayload = {
      imdb: extractServiceRating(
        data,
        "imdb",
        "imdbrating",
        "imdbvotes",
      ),
      rottenTomatoes: extractServiceRating(
        data,
        "rotten_tomatoes",
        "rt_rating",
        "rt_votes",
      ),
      metacritic: extractServiceRating(
        data,
        "metacritic",
        "metacritic_rating",
        "metacritic_votes",
      ),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, ...CACHE_HEADERS_SUCCESS },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[ratings] GET error:", errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      {
        status: 500,
        headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR },
      },
    );
  }
}

// ─── OPTIONS handler (CORS preflight) ─────────────────────────────────

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400", // 24h — browsers cache preflight results
    },
  });
}
