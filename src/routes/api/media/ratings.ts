/**
 * CineLog V2 — Server API: MDBList Ratings
 * ---------------------------------------------------------------------
 * Server-side API route that fetches aggregated ratings (IMDb, Rotten
 * Tomatoes, Metacritic) for a TMDB title via the MDBList API.
 *
 * Endpoint:
 *   GET /api/media/ratings?tmdb={tmdbId}&type={movie|tv|show}
 *
 * MDBList API version:
 *   This route uses MDBList's modern Title Lookup endpoint (path-based):
 *     https://api.mdblist.com/tmdb/{media_type}/{tmdb_id}?apikey=KEY
 *   The legacy `?tmdb=` query-string endpoint is deprecated and returns
 *   stale/incomplete data. The path-based endpoint is the canonical
 *   v2 lookup and returns the full title object including the
 *   `ratings` array directly on the root object.
 *
 * Type mapping:
 *   The frontend sends `type=movie` or `type=tv` (matching TMDB's
 *   media_type). MDBList accepts `movie` and `show` as path segments,
 *   so `tv`/`show` are both mapped to `show`:
 *     movie  → movie
 *     tv     → show
 *     show   → show
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
 *   400 — missing or invalid ?tmdb= / ?type= query param
 *   500 — MDBLIST_API_KEY not configured or upstream fetch failed
 *   502 — MDBList returned a non-2xx response (logged with body text)
 *
 * Security: MDBLIST_API_KEY is server-only (no VITE_ prefix). It is
 * NEVER exposed to the browser. Falls back gracefully to a 500 with a
 * clear error message if the key is missing.
 */

import { formatVoteCount } from "~/shared/utils/format";

// ─── Helper: origin validation for CORS ───────────────────────────────

/**
 * Determine the allowed CORS origin for a request.
 *
 * Returns the request's Origin header if it matches the app's domain,
 * otherwise returns null (which means no Access-Control-Allow-Origin header
 * should be set, and the browser will block the cross-origin request).
 *
 * This replaces the previous `Access-Control-Allow-Origin: *` wildcard,
 * which allowed any third-party site to call these API routes.
 */
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
    } catch { /* ignore */ }
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}

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
 * The v2 Title Lookup endpoint returns the full title object. The
 * `ratings` array sits directly on the root object — each entry has
 * { source, value, votes }. MDBList does NOT use a consistent naming
 * convention for `source`:
 *   - "imdb"          — IMDb
 *   - "tomatoes"      — Rotten Tomatoes (NOT "rotten_tomatoes" or "rt")
 *   - "metacritic"    — Metacritic
 * Some MDBList responses also expose top-level scalar fields (e.g.
 * `imdbrating`, `imdbvotes`) which we use as a fallback when the
 * `ratings` array is missing.
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
    "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
};

// Shorter cache for errors — don't poison the CDN with long-lived 4xx/5xx
const CACHE_HEADERS_ERROR = {
  "Cache-Control": "public, max-age=60, s-maxage=120"
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
 * Map the frontend `type` query param to MDBList's accepted path segment.
 *
 * MDBList's Title Lookup endpoint accepts `movie` and `show` as the
 * media-type path segment. The frontend sends `movie` or `tv` (matching
 * TMDB's media_type convention), and some callers may send `show`
 * directly. All of `tv` and `show` map to MDBList's `show`.
 *
 * Returns `null` for unknown types so the handler can return a 400.
 *
 * @example mapMediaType("movie") → "movie"
 * @example mapMediaType("tv")    → "show"
 * @example mapMediaType("show")  → "show"
 * @example mapMediaType("abc")   → null
 */
function mapMediaType(raw: string | null): "movie" | "show" | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "movie") return "movie";
  if (lower === "tv" || lower === "show") return "show";
  return null;
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
  raw: number | string | null | undefined
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
 *
 * MDBList's v2 Title Lookup endpoint uses these lowercase `source`
 * identifiers inside the `ratings` array:
 *   - "imdb"            — IMDb critic/user score
 *   - "tomatoes"        — Rotten Tomatoes critic score (NOT "rt",
 *                          "rotten_tomatoes", or "rottentomatoes")
 *   - "metacritic"      — Metacritic metascore
 *
 * We match case-insensitively for safety, but the source names above
 * are the canonical ones MDBList returns.
 */
function findRatingEntry(
  ratings: MdbListRatingEntry[] | undefined,
  source: string
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
 * @param data            The parsed MDBList response.
 * @param source          Our internal source identifier — used only to
 *                        pick the correct score normalization rules
 *                        (IMDb 1-decimal, RT integer+%, MC integer).
 * @param mdbListSource   The actual `source` string MDBList uses inside
 *                        its `ratings` array. This is what we `.find()`
 *                        against. MDBList does NOT use a consistent
 *                        naming convention — IMDb is "imdb", RT is
 *                        "tomatoes" (not "rotten_tomatoes"), and
 *                        Metacritic is "metacritic". Passing this
 *                        explicitly avoids guesswork.
 * @param topLevelScoreKey  Optional fallback scalar key on the root object.
 * @param topLevelVotesKey  Optional fallback scalar key on the root object.
 *
 * Returns null if no rating is available for this service.
 */
function extractServiceRating(
  data: MdbListResponse,
  source: "imdb" | "rotten_tomatoes" | "metacritic",
  mdbListSource: string,
  topLevelScoreKey?: ScalarRatingKey,
  topLevelVotesKey?: ScalarRatingKey
): ServiceRating | null {
  // 1. Try the ratings array (canonical source). Use the explicit
  //    MDBList source name — e.g. "tomatoes" for Rotten Tomatoes.
  const entry = findRatingEntry(data.ratings, mdbListSource);

  // 2. Fall back to top-level scalar fields if the array entry is missing.
  //    We cast to the union of accepted types — the scalar keys only hold
  //    numbers/strings/null, never arrays.
  const rawScore =
    entry?.value ??
    entry?.score ??
    (topLevelScoreKey
      ? (data[topLevelScoreKey] as number | string | null | undefined)
      : null);
  const rawVotes =
    entry?.votes ??
    (topLevelVotesKey
      ? (data[topLevelVotesKey] as number | string | null | undefined)
      : null);

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
    ...buildCorsHeaders(event.request),
    "Content-Type": "application/json"
  };

  try {
    const url = new URL(event.request.url);
    const tmdbId = url.searchParams.get("tmdb");
    const rawType = url.searchParams.get("type");

    // Validate ?tmdb= — must be present and a positive integer
    if (!tmdbId) {
      return new Response(
        JSON.stringify({ error: "Missing required query param: tmdb" }),
        {
          status: 400,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR }
        }
      );
    }
    const tmdbNum = parseInt(tmdbId, 10);
    if (!Number.isFinite(tmdbNum) || tmdbNum <= 0) {
      return new Response(
        JSON.stringify({ error: `Invalid tmdb id: "${tmdbId}"` }),
        {
          status: 400,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR }
        }
      );
    }

    // Validate + map ?type= — frontend sends 'movie' or 'tv';
    // MDBList accepts 'movie' or 'show'.
    const mappedType = mapMediaType(rawType);
    if (!mappedType) {
      return new Response(
        JSON.stringify({
          error: `Missing or invalid type param: expected "movie", "tv", or "show" (got "${rawType ?? ""}")`
        }),
        {
          status: 400,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR }
        }
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
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR }
        }
      );
    }

    // Fetch from MDBList using the v2 Title Lookup endpoint (path-based).
    // Format: https://api.mdblist.com/tmdb/{movie|show}/{tmdbId}?apikey=KEY
    // The path-based endpoint is the canonical v2 lookup and returns the
    // full title object with the `ratings` array on the root.
    const upstreamUrl = `${MDBLIST_BASE}/tmdb/${mappedType}/${tmdbNum}?apikey=${encodeURIComponent(apiKey)}`;
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl, {
        headers: { Accept: "application/json" }
      });
    } catch (err) {
      console.error("[ratings] Upstream fetch failed:", err);
      return new Response(
        JSON.stringify({ error: "Failed to reach rating service" }),
        {
          status: 502,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR }
        }
      );
    }

    // Non-200 HTTP status is a real upstream failure.
    // Read the response TEXT first so we can log it to Vercel logs for
    // debugging — MDBList sometimes returns helpful error bodies (rate
    // limit messages, invalid-key details) that JSON parsing would lose.
    if (!upstreamRes.ok) {
      let errBody = "";
      try {
        errBody = await upstreamRes.text();
      } catch {
        errBody = "<unreadable body>";
      }
      console.error(
        `[ratings] MDBList returned ${upstreamRes.status} ${upstreamRes.statusText} for ${mappedType}/${tmdbNum}:`,
        errBody
      );
      return new Response(
        JSON.stringify({
          error: `Rating service returned ${upstreamRes.status}`
        }),
        {
          status: 502,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR }
        }
      );
    }

    // 200 — parse the JSON body. MDBList's v2 Title Lookup returns the
    // title object directly (not wrapped in an envelope). The `ratings`
    // array sits on the root object.
    let data: MdbListResponse;
    try {
      data = (await upstreamRes.json()) as MdbListResponse;
    } catch (err) {
      // Log the raw text for Vercel logs — JSON parse failures usually
      // mean MDBList returned an HTML error page or an empty body.
      let rawText = "";
      try {
        // The body was already consumed by .json() above; .text() would
        // throw. We log the parse error instead.
        rawText = "(body already consumed by .json())";
      } catch {
        rawText = "(could not read body)";
      }
      console.error(
        `[ratings] Failed to parse MDBList JSON for ${mappedType}/${tmdbNum}:`,
        err,
        rawText
      );
      return new Response(
        JSON.stringify({ error: "Invalid response from rating service" }),
        {
          status: 502,
          headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR }
        }
      );
    }

    // MDBList error field (e.g. "Movie not found"). The v2 endpoint may
    // return a 200 with an error payload for unknown titles.
    if (
      data.response === "False" ||
      (typeof data.error === "string" && data.error)
    ) {
      console.warn(
        `[ratings] MDBList error for ${mappedType}/${tmdbNum}:`,
        data.error
      );
      // Return empty ratings rather than an error — the UI shows "NR"
      const empty: RatingsPayload = {
        imdb: null,
        rottenTomatoes: null,
        metacritic: null
      };
      return new Response(JSON.stringify(empty), {
        status: 200,
        headers: { ...corsHeaders, ...CACHE_HEADERS_SUCCESS }
      });
    }

    // Extract each service. MDBList's `ratings` array source identifiers
    // are NOT consistent across services:
    //   - IMDb          → source === "imdb"
    //   - Rotten Toms   → source === "tomatoes"  (NOT "rotten_tomatoes" or "rt")
    //   - Metacritic    → source === "metacritic"
    // We pass the explicit MDBList source name as the 3rd arg so the
    // .find() matches correctly. The top-level scalar fields are kept
    // as fallbacks for older MDBList API versions.
    const payload: RatingsPayload = {
      imdb: extractServiceRating(
        data,
        "imdb",
        "imdb",
        "imdbrating",
        "imdbvotes"
      ),
      rottenTomatoes: extractServiceRating(
        data,
        "rotten_tomatoes",
        "tomatoes",
        "rt_rating",
        "rt_votes"
      ),
      metacritic: extractServiceRating(
        data,
        "metacritic",
        "metacritic",
        "metacritic_rating",
        "metacritic_votes"
      )
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, ...CACHE_HEADERS_SUCCESS }
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[ratings] GET error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, ...CACHE_HEADERS_ERROR }
    });
  }
}

// ─── OPTIONS handler (CORS preflight) ─────────────────────────────────

export async function OPTIONS(event: APIEvent): Promise<Response> {
  const corsHeaders = buildCorsHeaders(event.request);
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Max-Age": "86400" // 24h — browsers cache preflight results
    }
  });
}
