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
import { createServerClientFromRequest } from "~/lib/supabase/server";
import { saveExtendedPreference } from "~/lib/supabase/repositories/settings";
import {
  callGroq,
  isAiFeatureEnabled
} from "~/lib/server/groq";
import { fetchTmdbMetadata } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";

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

/** A favorite enriched with its TMDB title — what we send to Groq. */
interface EnrichedFavorite {
  tmdb_id: number;
  title: string;
  rating: number | null;
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

/** How many favorites to send to Groq as context. */
const NUM_FAVORITES = 5;

/** How many hidden gems to ask Groq for. */
const NUM_RECOMMENDATIONS = 3;

const GROQ_MODEL = "llama-3.3-70b-versatile";

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
 * Build the system prompt for the recommendations call.
 *
 * The prompt is strict about output format because we parse the reply
 * programmatically. We explicitly tell the model:
 *   - Output ONLY a JSON array of numbers.
 *   - No prose, no markdown, no explanation.
 *   - Each number must be a real TMDB movie ID (not a TV id, not an
 *     IMDb id).
 *   - "Hidden gem" = high quality but low visibility (vote_count
 *     typically < 500 on TMDB, but we let the model decide based on
 *     its training data).
 */
function buildRecsSystemPrompt(): string {
  return [
    "You are a film recommendation engine for CineLog V2.",
    "Given a user's 5 favorite movies (with TMDB IDs), suggest",
    `${NUM_RECOMMENDATIONS} hidden gem movies they would enjoy.`,
    "",
    "A 'hidden gem' is a high-quality movie that is NOT mainstream",
    "or widely known — think festival favorites, cult classics, or",
    "acclaimed foreign films. Avoid blockbusters the user has likely",
    "already seen.",
    "",
    "OUTPUT FORMAT (CRITICAL):",
    `- Return ONLY a JSON array of ${NUM_RECOMMENDATIONS} TMDB movie IDs.`,
    "- Each ID must be a positive integer (the TMDB /movie/{id}).",
    "- Do NOT include TV series IDs — movies only.",
    "- Do NOT include any prose, markdown, or explanation.",
    "- Do NOT wrap the array in code fences.",
    "- Example valid output: [12345, 67890, 24680]",
    "",
    "If you cannot think of 3 good hidden gems, return as many as",
    "you can (1 or 2 is acceptable). Never return more than 3."
  ].join("\n");
}

/**
 * Build the user prompt — includes the user's 5 favorite movies with
 * their TMDB IDs + titles so the model can reason about taste.
 */
function buildRecsUserPrompt(favorites: EnrichedFavorite[]): string {
  const lines = favorites.map(
    (f, i) =>
      `${i + 1}. TMDB ID ${f.tmdb_id} — "${f.title || "Untitled"}"` +
      (f.rating ? ` (user rating: ${f.rating}/10)` : "")
  );
  return [
    "Here are my 5 favorite movies:",
    "",
    ...lines,
    "",
    `Suggest ${NUM_RECOMMENDATIONS} hidden gem movies I'd love. Return ONLY the JSON array of TMDB movie IDs.`
  ].join("\n");
}

// ─── GET /api/discover/ai-recommendations ─────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "This route is server-only." }, 500);
  }

  // ── 1. Authenticate via session ──────────────────────────────────
  let userId: string | null = null;
  let cookieJar: Awaited<
    ReturnType<typeof createServerClientFromRequest>
  >["cookies"] | null = null;
  try {
    const { client, cookies } = await createServerClientFromRequest(
      event.request
    );
    cookieJar = cookies;
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn(
        "[api/discover/ai-recommendations] getSession error:",
        error.message
      );
    }
    userId = data.session?.user?.id ?? null;
  } catch (err) {
    console.error("[api/discover/ai-recommendations] session read failed:", err);
    return jsonResponse({ error: "Failed to read session." }, 500);
  }

  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

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
  let cachedRecs: CachedAiRecs | null = null;
  try {
    const { client } = await createServerClientFromRequest(event.request);
    const { data: prefsData, error: prefsError } = await client
      .from("user_preferences")
      .select("prefs_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (!prefsError && prefsData) {
      const prefs = prefsData.prefs_json as Record<string, unknown> | null;
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
  let favorites: VaultRowForRecs[] = [];
  try {
    const { client } = await createServerClientFromRequest(event.request);
    const { data: vaultRows, error: vaultError } = await client
      .from("vault")
      .select("tmdb_id, media_type, rating")
      .eq("user_id", userId)
      .is("deleted_at", null)
      // Only items with a rating >= 7 (we want true favorites, not
      // everything they've logged). This also filters out NULL ratings.
      .gte("rating", 7)
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
  if (favorites.length < MIN_RATED_ITEMS) {
    const body: RecsResponse = {
      movies: [],
      reason: `Rate at least ${MIN_RATED_ITEMS} movies (7★ or higher) to unlock AI recommendations. You have ${favorites.length} so far.`,
      source: "fresh",
      generatedAt: new Date().toISOString()
    };
    return jsonResponse(body, 202);
  }

  // ── 4b. Enrich favorites with TMDB titles ────────────────────────
  // Groq produces much better recommendations when it can read the
  // movie titles, not just bare TMDB IDs. We fetch metadata for each
  // favorite in parallel (Promise.allSettled — a 404 on one doesn't
  // kill the batch). Favorites whose TMDB fetch fails are sent to
  // Groq with the title "Untitled" so the prompt still has the ID.
  const enrichedMetaResults = await Promise.allSettled(
    favorites.map((f) => fetchTmdbMetadata(f.media_type === "movie" ? "movie" : "tv", f.tmdb_id))
  );

  const enrichedFavorites: EnrichedFavorite[] = favorites.map((f, i) => {
    const result = enrichedMetaResults[i];
    const meta = result.status === "fulfilled" ? result.value : null;
    const title =
      meta?.title ||
      meta?.name ||
      null;
    return {
      tmdb_id: f.tmdb_id,
      title: title ?? "Untitled",
      rating: f.rating
    };
  });

  // ── 5. Call Groq ─────────────────────────────────────────────────
  const systemPrompt = buildRecsSystemPrompt();
  const userPrompt = buildRecsUserPrompt(enrichedFavorites);

  let groqReply: string;
  try {
    groqReply = await callGroq(systemPrompt, userPrompt, GROQ_MODEL);
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
    // We need a user-scoped client for the cache write (RLS: owner
    // only). createServerClientFromRequest gives us one bound to the
    // request's session.
    const { client } = await createServerClientFromRequest(event.request);
    // saveExtendedPreference accepts an optional client param.
    await saveExtendedPreference(userId, "aiRecs", cachePayload, client);
  } catch (err) {
    // Cache write is best-effort — if it fails, we still return the
    // recommendations. The next request will just re-call Groq.
    console.warn(
      "[api/discover/ai-recommendations] cache write failed (non-blocking):",
      err
    );
  }

  // ── 9. Return the movies ─────────────────────────────────────────
  const body: RecsResponse = {
    movies,
    source: "fresh",
    generatedAt: cachePayload.generatedAt
  };

  // cookieJar is unused for the response (no session refresh needed
  // on a GET), but we pass it through for consistency with other
  // user-authenticated routes.
  void cookieJar;

  return jsonResponse(body, 200);
}
