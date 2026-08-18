// src/routes/api/discover/ai-recommendations.ts
//
// CineLog V2 — Discover AI Recommendations API (Phase 16 Chunk 2)
// ---------------------------------------------------------------------
// GET /api/discover/ai-recommendations — returns 3 "hidden gem" movie
// recommendations based on the user's top 5 highest-rated vault items.
//
// FLOW:
//   1. Authenticate via Supabase session (user-scoped, RLS-enforced).
//   2. isAiFeatureEnabled("userRecommendationsEnabled") — the CRITICAL
//      gate. If the admin turned off the Master AI Switch OR the User
//      Recommendations sub-toggle, return 403 immediately. No Groq
//      call, no cache read, no TMDB fetch.
//   3. Check user_preferences.prefs_json.aiRecs — if it has a
//      generatedAt timestamp less than 24 hours old, return the
//      cached result immediately. This is the per-user 24h cache that
//      prevents exhausting the Groq free-tier quota.
//   4. If no fresh cache: fetch the user's top 5 vault items by
//      rating (descending). If the user has fewer than 3 rated items,
//      we can't make a meaningful recommendation — return 202 with an
//      empty array + a "reason" the UI can show (e.g. "Rate at least
//      3 movies to get AI recommendations").
//   5. Call Groq with a prompt that lists the 5 favorites and asks
//      for 3 hidden gem TMDB IDs as a JSON array. The system prompt
//      is strict about output format so we can parse it reliably.
//   6. Parse the JSON array of TMDB IDs from the Groq response. If
//      parsing fails or the array is empty, return 503 with a hint.
//   7. Fetch TMDB metadata for each ID (parallel via Promise.allSettled).
//      Skip any IDs that 404 (the LLM occasionally hallucinates a
//      deleted TMDB entry).
//   8. Save the result to user_preferences.prefs_json.aiRecs with a
//      fresh generatedAt timestamp. Best-effort — if the write fails,
//      we still return the recommendations (just no cache for next
//      time, so the next request will re-call Groq).
//   9. Return the 3 movies as TMDBTitle[].
//
// ERROR FALLBACK (Rule 3 — fail gracefully):
//   - Feature disabled → 403 (UI hides the rail entirely).
//   - Groq rate limit (429) → 503 with hint; UI shows a retry button.
//   - Groq malformed response → 503 with hint; UI shows retry.
//   - User has <3 rated vault items → 202 with empty array + reason.
//   - All TMDB fetches fail → 503 with hint.
//   - Any DB error → 500 (shouldn't happen in normal operation).
//
// CACHING (Rule 2):
//   The cache lives in user_preferences.prefs_json.aiRecs:
//     {
//       generatedAt: "2026-08-07T12:34:56.789Z",
//       movies: TMDBTitle[]   // the 3 recommended movies
//     }
//   Cache TTL = 24 hours. On cache hit, we skip the Groq + TMDB fetch
//   entirely — the response is fast and free. The cache is per-user
//   (RLS on user_preferences ensures only the owner can read it).
//
// SECURITY:
//   - Uses the user-scoped server client (NOT admin) so RLS is
//     enforced on both the vault + user_preferences reads.
//   - The Groq system prompt is constructed with the user's favorite
//     titles only — no PII, no other users' data.
//   - The cache write uses saveExtendedPreference (merged into
//     prefs_json, never overwrites other prefs).

import { isServer } from "solid-js/web";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAccessTokenFromRequest } from "~/lib/supabase/admin/sessionCookie";
import { saveExtendedPreference } from "~/lib/supabase/repositories/settings";
import {
  callGroq,
  isAiFeatureEnabled,
  getAiModel
} from "~/lib/server/groq";
import { fetchTmdbMetadata } from "~/core/tmdb/tmdb";
import { normalizeGenres } from "~/shared/utils/genres";
import type { TMDBTitle } from "~/shared/types";
import type { SupabaseClient } from "@supabase/supabase-js";

interface APIEvent {
  request: Request;
}

// ─── Types ───────────────────────────────────────────────────────

/** A single row from the vault table — we only need a few fields.
 *  NOTE: the vault table does NOT store the title (it's fetched from
 *  TMDB at the client layer). We enrich with the title separately. */
interface VaultRowForRecs {
  tmdb_id: number;
  media_type: "movie" | "tv" | "series";
  rating: number | null;
}

/** A favorite enriched with its TMDB title — used for genre extraction. */
interface EnrichedFavorite {
  tmdb_id: number;
  title: string;
  rating: number | null;
  /** Genre names extracted from TMDB metadata (e.g. ["Action", "Sci-Fi"]).
   *  Populated by normalizeGenres() on the raw TMDB genres array. */
  genres: string[];
}

/** Shape of the cached recommendation in prefs_json.aiRecs. */
interface CachedAiRecs {
  generatedAt: string;
  movies: TMDBTitle[];
}

/** Response body — the UI reads `movies` + optional `reason`. */
interface RecsResponse {
  movies: TMDBTitle[];
  /** Populated when movies is empty + we want to tell the UI why. */
  reason?: string;
  /** Where the result came from — useful for the UI's status line. */
  source: "cache" | "fresh";
  generatedAt: string;
}

interface ErrorResponse {
  error: string;
  hint?: string;
}

// ─── Constants ───────────────────────────────────────────────────

/** Cache TTL — 24 hours in milliseconds. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Minimum number of rated vault items required to generate recs. */
const MIN_RATED_ITEMS = 3;

/** How many rated vault items to fetch for genre extraction. We fetch
 *  more than the old 5 (which were sent directly to Groq) because we
 *  now extract the user's top genres from this sample — a larger
 *  sample gives a more accurate genre distribution. 20 is enough for
 *  a stable top-6 genre list without being too expensive (TMDB enrich
 *  is cached via apiCache). */
const NUM_FAVORITES = 20;

/** How many top genres to extract from the user's vault. */
const NUM_TOP_GENRES = 6;

/** How many hidden gems to ask Groq for (1 per top genre). */
const NUM_RECOMMENDATIONS = 6;



// ─── Rating scale helpers (Phase 15 QA Bug #1) ───────────────────
//
// The user's `ratingScale` preference determines how ratings are
// STORED in the vault table:
//   • "5star"  → ratings are 1-5 (a 4 = "good", equivalent to 8/10)
//   • "10star" → ratings are 1-10 (a 7 = "good")
//   • "thumbs" → ratings are 1 (thumbs up) — any positive rating counts
//
// The old code hardcoded `rating >= 7`, which only worked for "10star"
// users. 5-star users (max 5) never qualified, and thumbs users (max 1)
// were excluded entirely. These helpers derive the correct threshold +
// user-facing message from the scale.

/** The user's rating scale preference. Mirrors the type in
 *  src/core/preferences/ratingScale.ts — kept inline (not imported)
 *  because importing the preference module would pull client-only
 *  Solid signals into the server bundle. */
type RatingScale = "5star" | "10star" | "thumbs";

/**
 * Derive the vault-rating threshold from the user's ratingScale.
 *
 *   • "5star"  → 3.5  (the midpoint of "good" on a 1-5 scale; 7/10 ÷ 2)
 *   • "10star" → 7    (the original hardcoded threshold)
 *   • "thumbs" → 1    (any thumbs-up is a positive signal — there's
 *                      no gradient, so we accept all positively-rated
 *                      items)
 *
 * The threshold is used in a `.gte("rating", threshold)` Supabase
 * query, which also filters out NULL ratings (NULL >= N is NULL →
 * excluded). This means unrated items never qualify, which is correct
 * — we only want to recommend based on titles the user explicitly
 * liked.
 */
function ratingThresholdForScale(scale: RatingScale): number {
  if (scale === "5star") return 3.5;
  if (scale === "thumbs") return 1;
  return 7; // "10star" + safe default
}

/**
 * Build the "needs more ratings" message for the 202 response, adapted
 * to the user's rating scale so the instruction is actionable.
 *
 * Phase 15 QA Bug #1: the old message was
 *   "Rate at least 3 movies (7★ or higher) to unlock AI recommendations.
 *    You have 0 so far."
 * Two problems:
 *   1. "7★ or higher" is wrong for 5-star / thumbs users.
 *   2. "You have 0 so far" was the count of items matching the
 *      threshold, NOT the user's total rated count — misleading (a
 *      user with 50 rated movies but 0 above 7 saw "You have 0").
 * The new message is scale-aware and omits the misleading count. The
 * UI (AiRecommendationRail) shows this string verbatim in its
 * DiscoverEmptyState.
 */
function needsMoreRatingsMessage(scale: RatingScale): string {
  const thresholdLabel =
    scale === "5star"
      ? "3.5★ or higher"
      : scale === "thumbs"
        ? "a thumbs-up"
        : "7★ or higher";
  return `Rate at least ${MIN_RATED_ITEMS} movies (${thresholdLabel}) to unlock AI recommendations.`;
}

// ─── Auth helper (Bearer-header first, cookie fallback) ─────────
//
// Phase 15 QA Bug #1: the browser stores Supabase sessions in
// localStorage (NOT cookies), so the previous cookie-only auth path
// (createServerClientFromRequest + getSession) returned 401 for every
// browser-originated request. We now use getSupabaseAccessTokenFromRequest,
// which checks the `Authorization: Bearer <token>` header FIRST (the
// browser path) and falls back to the cookie for backward compatibility.
//
// This mirrors the pattern used by /api/sync/trakt/preview + execute.
//
// Returns { userId, accessToken, userClient } on success, or null on
// failure. The userClient is a Supabase client with the user's access
// token injected via `global.headers.Authorization` so every request
// (vault, user_preferences) is authenticated + RLS-enforced.
//
// PHASE 15 QA BUG #1 (round 3): the previous version used
// `userClient.auth.setSession({ access_token, refresh_token: "" })`.
// Supabase often REJECTS an empty refresh_token (the auth layer
// validates the session shape and throws on a malformed refresh token),
// which silently broke the subsequent vault query — it returned 0 rows
// even for users with a full vault. The fix: inject the Bearer token
// via `global.headers` instead. This is the supabase-js-recommended
// way to authenticate a stateless server-side client — every PostgREST
// request carries the Authorization header, RLS sees auth.uid(), and
// no refresh token is needed (we only do SELECT/UPSERT, not token
// refresh).
async function requireSignedInUser(
  request: Request
): Promise<{
  userId: string;
  accessToken: string;
  userClient: SupabaseClient;
} | null> {
  const accessToken = getSupabaseAccessTokenFromRequest(request);
  if (!accessToken) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  // Verify the token via getUser() — never trust the header payload
  // directly since headers can be tampered with.
  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await verifyClient.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  // Build a user-scoped client for RLS-enforced queries. We inject the
  // access token via `global.headers.Authorization` so EVERY request
  // this client makes (vault SELECT, user_preferences UPSERT, etc.)
  // carries the Bearer token. PostgREST reads the JWT from the
  // Authorization header, validates it, and sets auth.uid() for the
  // RLS policies — exactly the same mechanism the browser client uses.
  //
  // This is preferable to `auth.setSession()` for a stateless server-
  // side client because:
  //   1. No refresh_token needed (we only do reads/writes, not token
  //      refresh — getUser() already verified the access token above).
  //   2. Supabase's setSession validates the session shape and can
  //      reject an empty refresh_token, silently breaking downstream
  //      queries (the Phase 15 QA round 3 bug).
  //   3. The global.headers approach is documented in the supabase-js
  //      README as the way to authenticate a server-side client.
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });

  return { userId: data.user.id, accessToken, userClient };
}

// ─── Helpers ─────────────────────────────────────────────────────

function jsonResponse(
  body: unknown,
  status = 200,
  opts?: { cacheControl?: string }
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  // Private cache — recommendations are per-user. Short max-age so a
  // re-fetch within the session still hits the server (which checks
  // the 24h DB cache). s-maxage=0 prevents CDN caching entirely.
  headers["Cache-Control"] =
    opts?.cacheControl ?? "private, max-age=60, s-maxage=0";
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Parse the Groq response into an array of TMDB IDs.
 *
 * The system prompt asks for "ONLY a JSON array of TMDB IDs" but LLMs
 * are unreliable — they sometimes wrap the array in markdown fences
 * or add a preamble. We:
 *   1. Strip markdown code fences (```json ... ```).
 *   2. Find the first `[` and the last `]` and extract that slice.
 *   3. JSON.parse it.
 *   4. Filter to positive integers (drop nulls, strings, negatives).
 *   5. Dedupe + cap at NUM_RECOMMENDATIONS.
 *
 * Returns null if no valid array could be extracted.
 */
function parseTmdbIdsFromGroqReply(reply: string): number[] | null {
  let text = reply.trim();

  // Strip markdown code fences.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Find the first [ ... last ] slice.
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    return null;
  }
  const slice = text.slice(firstBracket, lastBracket + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  const ids: number[] = [];
  for (const item of parsed) {
    // Accept numbers or numeric strings; reject NaN / negatives / nulls.
    const n =
      typeof item === "number"
        ? item
        : typeof item === "string"
          ? Number(item)
          : NaN;
    if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) {
      ids.push(n);
    }
  }

  // Dedupe (a misbehaving model might repeat an ID).
  const unique = [...new Set(ids)];
  return unique.slice(0, NUM_RECOMMENDATIONS);
}

/**
 * Build the system prompt for the genre-based recommendations call.
 *
 * Phase 16 upgrade: instead of sending 5 favorite movie titles + asking
 * for 3 hidden gems, we now send the user's top 6 genres + ask for
 * exactly 1 hidden gem PER genre (6 total). This gives a more diverse
 * recommendation set that covers the breadth of the user's taste
 * rather than clustering around their top-rated titles.
 *
 * The prompt is strict about output format because we parse the reply
 * programmatically. We explicitly tell the model:
 *   - Output ONLY a JSON array of exactly 6 TMDB movie IDs.
 *   - No prose, no markdown, no explanation.
 *   - Each ID must be a real TMDB movie ID (not a TV id, not an IMDb id).
 *   - Each ID must correspond to a hidden gem in the respective genre.
 *   - "Hidden gem" = high quality but low visibility.
 */
function buildRecsSystemPrompt(): string {
  return [
    "You are a film recommendation engine for CineLog V2.",
    "Given a user's top 6 favorite genres, suggest exactly 1 hidden",
    "gem movie for EACH genre (6 movies total).",
    "",
    "A 'hidden gem' is a high-quality movie that is NOT mainstream",
    "or widely known — think festival favorites, cult classics, or",
    "acclaimed foreign films. Avoid blockbusters the user has likely",
    "already seen.",
    "",
    "OUTPUT FORMAT (CRITICAL):",
    `- Return ONLY a JSON array of exactly ${NUM_RECOMMENDATIONS} TMDB movie IDs.`,
    "- The array MUST have exactly 6 elements, one per genre, in the",
    "  SAME ORDER as the genres were listed.",
    "- Each ID must be a positive integer (the TMDB /movie/{id}).",
    "- Do NOT include TV series IDs — movies only.",
    "- Do NOT include any prose, markdown, or explanation.",
    "- Do NOT wrap the array in code fences.",
    "- Example valid output: [12345, 67890, 24680, 13579, 86420, 97531]",
    "",
    "If you cannot think of a good hidden gem for a specific genre,",
    "still return 6 IDs — pick the best you can. Never return more or",
    "fewer than 6."
  ].join("\n");
}

/**
 * Build the user prompt — lists the user's top 6 genres so the model
 * can suggest 1 hidden gem per genre.
 *
 * The genres are ordered by frequency in the user's vault (most-watched
 * first), so the model knows which genres the user loves most.
 */
function buildRecsUserPrompt(topGenres: string[]): string {
  const genreLines = topGenres
    .slice(0, NUM_TOP_GENRES)
    .map((g, i) => `${i + 1}. ${g}`);
  return [
    `The user loves these ${NUM_TOP_GENRES} genres:`,
    "",
    ...genreLines,
    "",
    `For EACH genre, suggest exactly 1 hidden gem movie. Return ONLY a JSON array of exactly ${NUM_RECOMMENDATIONS} TMDB movie IDs, one per genre, in the same order.`
  ].join("\n");
}

/**
 * Extract the top N genres from the user's enriched favorites.
 *
 * Counts genre occurrences across all favorites (each favorite's
 * genres array contributes +1 per genre). Returns the top N genre
 * names sorted by count (descending). Ties are broken alphabetically
 * for deterministic output.
 *
 * Uses normalizeGenres() to handle TMDB's multiple genre formats
 * (objects from /movie/{id}, strings from /search, etc.).
 */
function extractTopGenres(
  favorites: EnrichedFavorite[],
  count: number
): string[] {
  const genreCounts: Record<string, number> = {};
  for (const f of favorites) {
    for (const g of f.genres) {
      const name = g.trim();
      if (name) genreCounts[name] = (genreCounts[name] || 0) + 1;
    }
  }
  return Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([name]) => name);
}

// ─── GET /api/discover/ai-recommendations ─────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "This route is server-only." }, 500);
  }

  // ── 1. Authenticate via Bearer header (Phase 15 QA Bug #1 fix) ────
  // The browser stores sessions in localStorage, so we resolve the
  // access token from the Authorization header first (falling back to
  // cookies for SSR / server-to-server). requireSignedInUser verifies
  // the token + returns a user-scoped Supabase client for RLS queries.
  let authResult: { userId: string; accessToken: string; userClient: SupabaseClient } | null;
  try {
    authResult = await requireSignedInUser(event.request);
  } catch (err) {
    console.error(
      "[api/discover/ai-recommendations] session read failed:",
      err
    );
    return jsonResponse({ error: "Failed to read session." }, 500);
  }

  if (!authResult) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { userId, userClient } = authResult;
  // Note: authResult.accessToken is also available but not needed here
  // — userClient already has the session set for RLS-enforced queries.

  // ── 2. CRITICAL GATE — check the feature flag ────────────────────
  // This reads app_config.ai_settings via the service-role client
  // (checkAiSettings is server-side + bypasses RLS). If the admin
  // turned off the master switch OR the user-recommendations sub-
  // toggle, we return 403 immediately — no cache read, no Groq call.
  const enabled = await isAiFeatureEnabled("userRecommendationsEnabled");
  if (!enabled) {
    return jsonResponse(
      {
        error: "AI recommendations are disabled.",
        hint: "An admin can enable them at /admin/ai."
      } satisfies ErrorResponse,
      403
    );
  }

  // ── 3. Check the 24h cache in user_preferences.prefs_json.aiRecs ─
  // We use the user-scoped client (RLS-enforced) for the cache read
  // so the user can only read their own cached recs.
  //
  // We ALSO read the user's `ratingScale` preference from the same
  // prefs_json row (Phase 15 QA Bug #1: the rating threshold must
  // adapt to the user's scale — 1-5, 1-10, or thumbs — otherwise
  // 5-star users never qualify because their max rating is 5, well
  // below the old hardcoded `>= 7` threshold). Reading both from the
  // same row avoids a second round-trip.
  let cachedRecs: CachedAiRecs | null = null;
  let userRatingScale: RatingScale = "10star"; // safe default
  try {
    const { data: prefsData, error: prefsError } = await userClient
      .from("user_preferences")
      .select("prefs_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (!prefsError && prefsData) {
      const prefs = prefsData.prefs_json as Record<string, unknown> | null;
      // Read the ratingScale preference. It lives in prefs_json (synced
      // from localStorage via preferencesSync). Valid values: "5star",
      // "10star", "thumbs". Unknown/missing → default "10star".
      const scaleRaw = prefs?.ratingScale;
      if (
        scaleRaw === "5star" ||
        scaleRaw === "10star" ||
        scaleRaw === "thumbs"
      ) {
        userRatingScale = scaleRaw;
      }

      const aiRecs = prefs?.aiRecs as Partial<CachedAiRecs> | undefined;
      if (
        aiRecs &&
        typeof aiRecs.generatedAt === "string" &&
        Array.isArray(aiRecs.movies)
      ) {
        const age = Date.now() - new Date(aiRecs.generatedAt).getTime();
        if (age < CACHE_TTL_MS) {
          cachedRecs = {
            generatedAt: aiRecs.generatedAt,
            movies: aiRecs.movies as TMDBTitle[]
          };
        }
      }
    }
  } catch (err) {
    // Cache read is best-effort — if it fails, we proceed to generate
    // fresh recommendations. The user is unaffected.
    console.warn(
      "[api/discover/ai-recommendations] cache read failed, generating fresh:",
      err
    );
  }

  if (cachedRecs) {
    const body: RecsResponse = {
      movies: cachedRecs.movies,
      source: "cache",
      generatedAt: cachedRecs.generatedAt
    };
    return jsonResponse(body, 200);
  }

  // ── 4. Fetch the user's top 5 vault items by rating ──────────────
  // We use the user-scoped client so RLS limits to the caller's vault.
  // NOTE: the vault table does NOT store the movie title (it's fetched
  // from TMDB at the client layer). We only select tmdb_id, media_type,
  // rating here and enrich with titles in step 4b.
  //
  // PHASE 15 QA BUG #1: the rating threshold is now scale-aware.
  // Previously this was hardcoded `>= 7`, which only worked for
  // "10star" users. 5-star users (max rating 5) never qualified, and
  // thumbs users (rating 1 = thumbs up) were excluded entirely. The
  // threshold is derived from the user's ratingScale preference:
  //   • "5star"  → 3.5 (equivalent to 7/10 — the midpoint of "good")
  //   • "10star" → 7   (the original threshold)
  //   • "thumbs" → 1   (any thumbs-up counts as a positive signal)
  const ratingThreshold = ratingThresholdForScale(userRatingScale);
  let favorites: VaultRowForRecs[] = [];
  try {
    const { data: vaultRows, error: vaultError } = await userClient
      .from("vault")
      .select("tmdb_id, media_type, rating")
      .eq("user_id", userId)
      .is("deleted_at", null)
      // Phase 15 QA Bug #1 (round 3): filter to valid media types only
      // ("movie" | "tv"). The vault table's media_type enum technically
      // allows "series" too (legacy), but TMDB's /movie/{id} and /tv/{id}
      // endpoints only accept "movie" | "tv". Without this filter, a
      // "series" row would slip through and the downstream TMDB enrich
      // (step 4b) + Groq recommendation fetch would 404. The .in() filter
      // also future-proofs against any stray NULL media_type values.
      .in("media_type", ["movie", "tv"])
      // Only items at/above the scale-aware threshold (we want true
      // favorites, not everything they've logged). This also filters
      // out NULL ratings.
      .gte("rating", ratingThreshold)
      .order("rating", { ascending: false })
      .limit(NUM_FAVORITES);

    if (vaultError) {
      console.error(
        "[api/discover/ai-recommendations] vault fetch error:",
        vaultError.message
      );
      return jsonResponse(
        { error: "Failed to load your library." } satisfies ErrorResponse,
        500
      );
    }

    favorites = (vaultRows ?? []) as VaultRowForRecs[];
  } catch (err) {
    console.error(
      "[api/discover/ai-recommendations] vault fetch exception:",
      err
    );
    return jsonResponse(
      { error: "Failed to load your library." } satisfies ErrorResponse,
      500
    );
  }

  // If the user has fewer than MIN_RATED_ITEMS favorites, we can't
  // make a meaningful recommendation. Return 202 with a reason the UI
  // can show. (202 = "accepted but not yet fulfild" — semantically
  // fits: we accepted the request but have nothing to return yet.)
  //
  // PHASE 15 QA BUG #1: the reason string no longer includes the
  // "You have N so far" count — that count was the number of items
  // matching the threshold, NOT the user's total rated count, so it
  // was misleading (a user with 50 rated movies but 0 above the
  // threshold saw "You have 0 so far"). The UI now shows a clean
  // scale-aware message without the count.
  if (favorites.length < MIN_RATED_ITEMS) {
    const body: RecsResponse = {
      movies: [],
      reason: needsMoreRatingsMessage(userRatingScale),
      source: "fresh",
      generatedAt: new Date().toISOString()
    };
    return jsonResponse(body, 202);
  }

  // ── 4b. Enrich favorites with TMDB titles + genres ───────────────
  // We fetch metadata for each favorite in parallel (Promise.allSettled
  // — a 404 on one doesn't kill the batch). The metadata gives us:
  //   • The title (for debugging / logging)
  //   • The genres array (for extracting the user's top 6 genres)
  //
  // Phase 16 upgrade: we now extract genres from the enriched metadata
  // to build a genre-based Groq prompt (1 hidden gem per top genre)
  // instead of the old title-based prompt (3 hidden gems from 5 titles).
  const enrichedMetaResults = await Promise.allSettled(
    favorites.map((f) => fetchTmdbMetadata(f.media_type === "movie" ? "movie" : "tv", f.tmdb_id))
  );

  const enrichedFavorites: EnrichedFavorite[] = favorites.map((f, i) => {
    const result = enrichedMetaResults[i];
    const meta = result.status === "fulfilled" ? result.value : null;
    const title = meta?.title || meta?.name || null;
    // Extract genre names from the TMDB metadata. The /movie/{id} and
    // /tv/{id} endpoints return genres as [{id, name}] objects.
    // normalizeGenres() handles all TMDB genre formats (objects,
    // strings, numbers) and returns a clean string[] of names.
    const genres = normalizeGenres(
      (meta as { genres?: unknown[] } | null)?.genres as unknown[] | undefined
    );
    return {
      tmdb_id: f.tmdb_id,
      title: title ?? "Untitled",
      rating: f.rating,
      genres
    };
  });

  // ── 4c. Extract the user's top 6 genres ──────────────────────────
  // Count genre occurrences across all enriched favorites + take the
  // top 6. If we can't extract 6 distinct genres (user has a narrow
  // taste or many TMDB fetches failed), we proceed with whatever we
  // have — Groq will still return recommendations, just fewer genres.
  const topGenres = extractTopGenres(enrichedFavorites, NUM_TOP_GENRES);

  if (topGenres.length === 0) {
    // No genres could be extracted (all TMDB fetches failed or the
    // favorites have no genre data). Return 503 so the UI shows a retry.
    console.error(
      "[api/discover/ai-recommendations] no genres extracted from favorites"
    );
    return jsonResponse(
      {
        error: "Couldn't determine your favorite genres.",
        hint: "Try again in a moment — the metadata service may be temporarily unavailable."
      } satisfies ErrorResponse,
      503
    );
  }

  // ── 5. Call Groq with the genre-based prompt ─────────────────────
  const systemPrompt = buildRecsSystemPrompt();
  const userPrompt = buildRecsUserPrompt(topGenres);

  let groqReply: string;
  try {
    const model = await getAiModel(undefined, "userRecommendations");
    groqReply = await callGroq(systemPrompt, userPrompt, model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/discover/ai-recommendations] Groq call failed:", msg);
    const isRateLimit =
      msg.includes("429") || msg.toLowerCase().includes("rate limit");
    return jsonResponse(
      {
        error: isRateLimit
          ? "Groq rate limit hit — the free tier is exhausted."
          : "The recommendation engine is unavailable right now.",
        hint: isRateLimit
          ? "Try again in a few minutes. Your cache will refresh on the next successful call."
          : "If this persists, an admin can disable + re-enable the feature at /admin/ai."
      } satisfies ErrorResponse,
      503
    );
  }

  // ── 6. Parse the TMDB IDs from the Groq reply ────────────────────
  const tmdbIds = parseTmdbIdsFromGroqReply(groqReply);
  if (!tmdbIds || tmdbIds.length === 0) {
    console.error(
      "[api/discover/ai-recommendations] failed to parse Groq reply:",
      groqReply.slice(0, 200)
    );
    return jsonResponse(
      {
        error: "The AI returned an unparseable response.",
        hint: "Try again in a moment — the model occasionally misformats its output."
      } satisfies ErrorResponse,
      503
    );
  }

  // ── 7. Fetch TMDB metadata for each ID (parallel) ────────────────
  // fetchTmdbMetadata returns null on 404 (deleted TMDB entry) or
  // network error — we filter those out. If ALL fetches fail, we
  // return 503 so the UI can show a retry.
  const metadataResults = await Promise.allSettled(
    tmdbIds.map((id) => fetchTmdbMetadata("movie", id))
  );

  const movies: TMDBTitle[] = [];
  for (const r of metadataResults) {
    if (r.status === "fulfilled" && r.value) {
      movies.push(r.value);
    }
  }

  if (movies.length === 0) {
    console.error(
      "[api/discover/ai-recommendations] all TMDB fetches failed for IDs:",
      tmdbIds
    );
    return jsonResponse(
      {
        error: "Couldn't load metadata for the recommended movies.",
        hint: "The AI may have returned stale TMDB IDs. Try again in a moment."
      } satisfies ErrorResponse,
      503
    );
  }

  // ── 8. Save to the 24h cache (best-effort) ───────────────────────
  // We use the admin client's saveExtendedPreference helper, which
  // merges aiRecs into prefs_json without touching other keys. The
  // helper uses the user-scoped client internally via getClient(),
  // but since we're in a request context, we need to pass the
  // request-bound client. The helper accepts a client param.
  //
  // NOTE: saveExtendedPreference reads the current prefs_json, merges,
  // and upserts. This is a 2-round-trip operation but keeps the schema
  // simple. For a 24h cache that's hit rarely, this is fine.
  const cachePayload: CachedAiRecs = {
    generatedAt: new Date().toISOString(),
    movies
  };

  try {
    // Reuse the user-scoped client from step 1 (RLS: owner only).
    // saveExtendedPreference accepts an optional client param.
    //
    // Phase 18 deep fix: saveExtendedPreference returns { error } and
    // does NOT throw. The old try/catch here never triggered on a
    // cache-write failure — the error was silently swallowed, so every
    // subsequent request hit the slow path (re-call Groq + re-fetch
    // TMDB) because the cache was never actually written. This is the
    // root cause of the "AI picks differ between browsers" bug: the
    // cache was never persisted, so every browser generated its own
    // fresh recommendations on every load.
    //
    // Fix: check the returned `error` field and log it as an error so
    // we can actually diagnose cache-write failures. The user still
    // gets their recommendations (best-effort), but now we have
    // visibility into why the cache might not be working.
    const { error: cacheWriteError } = await saveExtendedPreference(
      userId,
      "aiRecs",
      cachePayload,
      userClient
    );
    if (cacheWriteError) {
      console.error(
        "[api/discover/ai-recommendations] cache write failed (non-blocking, but recommendations will re-generate next time):",
        cacheWriteError.message
      );
    }
  } catch (err) {
    // Defensive: saveExtendedPreference shouldn't throw (it catches
    // internally), but if it ever does, we still want to surface it.
    console.error(
      "[api/discover/ai-recommendations] cache write threw (non-blocking):",
      err
    );
  }

  // ── 9. Return the movies ─────────────────────────────────────────
  const body: RecsResponse = {
    movies,
    source: "fresh",
    generatedAt: cachePayload.generatedAt
  };

  return jsonResponse(body, 200);
}
