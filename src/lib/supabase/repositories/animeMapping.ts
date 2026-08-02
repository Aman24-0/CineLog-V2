// src/lib/supabase/repositories/animeMapping.ts
//
// Anime Mapping Repository
// ---------------------------------------------------------------------
// Read + write helpers for the `anime_mappings` table.
//
// READ PATH:
//   getAnilistId(tmdbId)   → number | null  (cached in-memory 30 days)
//   getTmdbId(anilistId)   → number | null  (cached in-memory 30 days)
//   Reads go directly to Supabase via the anon client — the table
//   has a public SELECT policy.
//
// WRITE PATH:
//   saveMapping(...)       → upsert a single mapping
//   autoMap(tmdbId, ...)   → try to map by title+year using AniList search
//   Writes are routed based on environment:
//     • Browser → POST /api/anime-mappings (server uses service role
//       to bypass RLS — direct anon writes fail with 42501).
//     • Server  → direct upsert via the service-role admin client.
//
// IN-MEMORY CACHE:
//   A simple Map<TmdbId, AnilistId>. Entries NEVER expire within a
//   session — mappings are permanent metadata, not user data, so
//   once we know it, we keep it. The Supabase row is the source of
//   truth; this cache is just a read-traffic reducer.
//
//   The cache is module-level so it's shared across all callers in
//   the same browser tab / server request. SSR-safe: the cache is
//   populated only on the client (the server makes fresh queries
//   per-request to avoid cross-user state).
//
// AUTO-MAPPING ALGORITHM:
//   1. Query the mapping table for tmdb_id. If found, return.
//   2. Use the title + year to search AniList (searchAnime).
//   3. Filter candidates by year match (±1 year tolerance).
//   4. Score candidates by title similarity (Levenshtein distance).
//   5. Take the best-scoring candidate above a threshold.
//   6. Upsert into the mapping table with the appropriate confidence.
//
//   Auto-mapping is best-effort. If it fails, the caller should
//   silently skip AniList enrichment (no error UI).

import { getClient } from "~/lib/supabase/client";
import { isServer } from "solid-js/web";
import { searchAnime } from "~/lib/anilist";
import type { AniListMedia } from "~/lib/anilist";

// ─── Types ──────────────────────────────────────────────────────────

export type MappingConfidence = "high" | "medium" | "low" | "manual";

export interface AnimeMapping {
  tmdbId: number;
  tmdbType: "movie" | "tv";
  anilistId: number;
  anilistType: "ANIME" | "MANGA";
  title: string | null;
  matchConfidence: MappingConfidence;
}

// ─── In-memory cache (per-session, never expires) ───────────────────

const tmdbToAnilist = new Map<number, AnimeMapping | null>();
const anilistToTmdb = new Map<number, AnimeMapping | null>();

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Normalize a title for comparison. Lowercases, strips punctuation,
 * collapses whitespace. Used by the auto-mapping similarity scorer
 * so "Attack on Titan" matches "attack on titan" and "Attack On Titan".
 */
function normalizeTitle(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein distance — used to score title similarity.
 * O(m*n) DP. For our use case (titles under 100 chars), this is fast
 * enough to run on a list of ~20 candidates.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Score how well an AniList candidate matches the search query.
 *
 * Returns 0-100 (higher = better match).
 *   - Title exact match (normalized)              → 100
 *   - Title Levenshtein distance / max length     → 100 - distance%
 *   - Year match (±1 year tolerance)              → +5 bonus
 *   - Type match (TV vs MOVIE)                    → +3 bonus
 */
function scoreCandidate(
  candidate: AniListMedia,
  query: { title: string; year?: number | null; type?: "movie" | "tv" }
): number {
  const queryTitle = normalizeTitle(query.title);
  if (!queryTitle) return 0;

  // Pick the candidate's best-matching title variant.
  const variants = [
    candidate.title?.userPreferred,
    candidate.title?.english,
    candidate.title?.romaji,
    candidate.title?.native
  ].filter(Boolean) as string[];

  let bestTitleScore = 0;
  for (const variant of variants) {
    const v = normalizeTitle(variant);
    if (!v) continue;
    if (v === queryTitle) {
      bestTitleScore = 100;
      break;
    }
    const dist = levenshtein(queryTitle, v);
    const maxLen = Math.max(queryTitle.length, v.length);
    const similarity = maxLen > 0 ? (1 - dist / maxLen) * 100 : 0;
    if (similarity > bestTitleScore) bestTitleScore = similarity;
  }

  // Year bonus (±1 year tolerance)
  if (query.year != null && candidate.seasonYear != null) {
    if (Math.abs(candidate.seasonYear - query.year) <= 1) {
      bestTitleScore += 5;
    }
  }

  // Format bonus — TV anime ↔ tv, MOVIE ↔ movie
  if (query.type === "movie" && candidate.format === "MOVIE") bestTitleScore += 3;
  if (query.type === "tv" && (candidate.format === "TV" || candidate.format === "TV_SHORT" || candidate.format === "ONA")) {
    bestTitleScore += 3;
  }

  return Math.min(bestTitleScore, 100);
}

// ─── Public: read ───────────────────────────────────────────────────

/**
 * Get the AniList id for a TMDB id. Checks the in-memory cache first,
 * then queries Supabase, then caches the result (including null
 * results so we don't re-query for known-unmapped titles).
 *
 * Returns null if no mapping exists. The caller should treat null
 * as "AniList data not available" and skip enrichment.
 *
 * SSR-safe: on the server, skips the cache and queries fresh.
 */
export async function getAnilistId(tmdbId: number): Promise<number | null> {
  if (!isServer && tmdbToAnilist.has(tmdbId)) {
    const cached = tmdbToAnilist.get(tmdbId)!;
    return cached?.anilistId ?? null;
  }

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("anime_mappings")
      .select("anilist_id, anilist_type, tmdb_type, title, match_confidence")
      .eq("tmdb_id", tmdbId)
      .maybeSingle();

    if (error) {
      console.warn(`[animeMapping] lookup error for tmdb_id=${tmdbId}:`, error.message);
      return null;
    }
    if (!data) {
      if (!isServer) tmdbToAnilist.set(tmdbId, null);
      return null;
    }

    const mapping: AnimeMapping = {
      tmdbId,
      tmdbType: data.tmdb_type,
      anilistId: data.anilist_id,
      anilistType: data.anilist_type,
      title: data.title,
      matchConfidence: data.match_confidence as MappingConfidence
    };
    if (!isServer) {
      tmdbToAnilist.set(tmdbId, mapping);
      anilistToTmdb.set(mapping.anilistId, mapping);
    }
    return mapping.anilistId;
  } catch (err) {
    console.warn(`[animeMapping] lookup threw for tmdb_id=${tmdbId}:`, err);
    return null;
  }
}

/**
 * Get the full mapping record (includes confidence + type). Useful
 * for the Admin panel's mapping list view.
 */
export async function getMapping(tmdbId: number): Promise<AnimeMapping | null> {
  const anilistId = await getAnilistId(tmdbId);
  if (anilistId == null) return null;
  if (!isServer) {
    return tmdbToAnilist.get(tmdbId) ?? null;
  }
  // Server path — re-query for full record (cache is per-client there).
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("anime_mappings")
      .select("*")
      .eq("tmdb_id", tmdbId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      tmdbId: data.tmdb_id,
      tmdbType: data.tmdb_type,
      anilistId: data.anilist_id,
      anilistType: data.anilist_type,
      title: data.title,
      matchConfidence: data.match_confidence as MappingConfidence
    };
  } catch {
    return null;
  }
}

/**
 * Reverse lookup — given an AniList id, find the TMDB id. Used by
 * Discover carousels (AniList returns a list of trending AniList ids;
 * we map them back to TMDB ids to fetch TMDB metadata for display).
 */
export async function getTmdbId(anilistId: number): Promise<number | null> {
  if (!isServer && anilistToTmdb.has(anilistId)) {
    const cached = anilistToTmdb.get(anilistId)!;
    return cached?.tmdbId ?? null;
  }
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("anime_mappings")
      .select("tmdb_id")
      .eq("anilist_id", anilistId)
      .maybeSingle();
    if (error || !data) {
      if (!isServer) anilistToTmdb.set(anilistId, null);
      return null;
    }
    if (!isServer) {
      // We don't have the full record here; store a partial mapping
      // so subsequent getTmdbId calls hit the cache. The full record
      // will be populated when getAnilistId is called for this tmdbId.
      anilistToTmdb.set(anilistId, {
        tmdbId: data.tmdb_id,
        tmdbType: "tv", // unknown, default
        anilistId,
        anilistType: "ANIME",
        title: null,
        matchConfidence: "medium"
      });
    }
    return data.tmdb_id;
  } catch {
    return null;
  }
}

// ─── Public: write ──────────────────────────────────────────────────

/**
 * Resolve the API endpoint URL for browser-side mapping writes.
 *
 * On the browser, this is just "/api/anime-mappings" (relative URL,
 * resolved against the current origin).
 *
 * On the server (SSR), fetch() needs an absolute URL — we prepend
 * the configured base URL (mirrors the pattern in
 * `src/lib/anilist/client.ts:getBaseUrl`).
 */
function getWriteEndpoint(): string {
  if (!isServer) return "/api/anime-mappings";
  const base =
    (typeof process !== "undefined" && process.env.VITE_APP_BASE_URL) ||
    "https://cinelog.vercel.app";
  return `${base}/api/anime-mappings`;
}

/**
 * Save a mapping. Used by the auto-mapper and the admin panel.
 *
 * WRITE PATH:
 *   • On the BROWSER: POST to /api/anime-mappings, which uses the
 *     service-role Supabase client server-side to bypass RLS. Direct
 *     browser writes to the `anime_mappings` table fail with code
 *     42501 ("row violates row-level security policy") because the
 *     migration that created the table only grants SELECT to anon /
 *     authenticated users. The API endpoint is the only path that
 *     works for browser-initiated writes.
 *   • On the SERVER: upsert directly via the service-role admin
 *     client (server-side code is already authorized to use it).
 *
 * @returns true on success, false on failure.
 */
export async function saveMapping(input: {
  tmdbId: number;
  tmdbType?: "movie" | "tv";
  anilistId: number;
  anilistType?: "ANIME" | "MANGA";
  title?: string | null;
  matchConfidence?: MappingConfidence;
  createdBy?: string;
}): Promise<boolean> {
  // Browser path — go through the public API endpoint that uses
  // the service role server-side. This avoids the RLS 42501 errors
  // that pollute Supabase logs when the browser tries to write
  // directly.
  if (!isServer) {
    try {
      const resp = await fetch(getWriteEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: input.tmdbId,
          tmdbType: input.tmdbType ?? "tv",
          anilistId: input.anilistId,
          anilistType: input.anilistType ?? "ANIME",
          title: input.title ?? null,
          matchConfidence: input.matchConfidence ?? "medium",
          createdBy: input.createdBy ?? "system"
        })
      });
      if (!resp.ok) {
        // 4xx/5xx — non-fatal. The mapping just won't persist this
        // time; the next load will re-discover and re-try.
        // Common causes: validation error (shouldn't happen given
        // our caller), 500 (DB issue), 429 (rate limit).
        console.warn(
          `[animeMapping] browser saveMapping returned ${resp.status} for tmdb_id=${input.tmdbId}`
        );
        // Still populate the in-memory cache so the current session
        // benefits even if persistence failed.
        cacheMappingInMemory(input);
        return false;
      }
      cacheMappingInMemory(input);
      return true;
    } catch (err) {
      console.warn(`[animeMapping] browser saveMapping threw for tmdb_id=${input.tmdbId}:`, err);
      cacheMappingInMemory(input);
      return false;
    }
  }

  // Server path — direct upsert via service-role admin client.
  try {
    // Lazy import to avoid pulling the admin client into the browser
    // bundle (it throws if instantiated on the browser, but the
    // import itself is fine — only the call errors).
    const { createAdminClient } = await import("~/lib/supabase/admin/adminClient");
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("anime_mappings")
      .upsert(
        {
          tmdb_id: input.tmdbId,
          tmdb_type: input.tmdbType ?? "tv",
          anilist_id: input.anilistId,
          anilist_type: input.anilistType ?? "ANIME",
          title: input.title ?? null,
          match_confidence: input.matchConfidence ?? "medium",
          created_by: input.createdBy ?? "system"
        },
        { onConflict: "tmdb_id" }
      );
    if (error) {
      console.warn(`[animeMapping] server save error for tmdb_id=${input.tmdbId}:`, error.message);
      return false;
    }
    cacheMappingInMemory(input);
    return true;
  } catch (err) {
    console.warn(`[animeMapping] server save threw for tmdb_id=${input.tmdbId}:`, err);
    return false;
  }
}

/**
 * Update the in-memory caches after a successful (or even failed-
 * but-client-side) save. This way subsequent reads in the same
 * session are instant — no extra round-trip to Supabase or the API.
 *
 * Called from both the browser and server paths of saveMapping.
 */
function cacheMappingInMemory(input: {
  tmdbId: number;
  tmdbType?: "movie" | "tv";
  anilistId: number;
  anilistType?: "ANIME" | "MANGA";
  title?: string | null;
  matchConfidence?: MappingConfidence;
}): void {
  const mapping: AnimeMapping = {
    tmdbId: input.tmdbId,
    tmdbType: input.tmdbType ?? "tv",
    anilistId: input.anilistId,
    anilistType: input.anilistType ?? "ANIME",
    title: input.title ?? null,
    matchConfidence: input.matchConfidence ?? "medium"
  };
  // Only populate the browser-side cache; the server is stateless
  // per-request so caching there is unnecessary (and would leak
  // state across users).
  if (!isServer) {
    tmdbToAnilist.set(input.tmdbId, mapping);
    anilistToTmdb.set(input.anilistId, mapping);
  }
}

/**
 * Auto-map a TMDB title to an AniList id by searching AniList.
 *
 * Algorithm:
 *   1. Search AniList by title (returns ~20 candidates).
 *   2. Score each candidate by title similarity + year + format match.
 *   3. Take the best candidate above the threshold.
 *   4. Upsert the mapping into Supabase.
 *
 * @returns The AniList id if a match was found and saved, else null.
 */
export async function autoMap(input: {
  tmdbId: number;
  title: string;
  year?: number | null;
  tmdbType?: "movie" | "tv";
}): Promise<number | null> {
  // 1. Check existing mapping first (cheap).
  const existing = await getAnilistId(input.tmdbId);
  if (existing != null) return existing;

  // 2. Search AniList.
  let candidates: AniListMedia[] = [];
  try {
    const result = await searchAnime(input.title, 1, 20);
    candidates = result.media;
  } catch (err) {
    console.warn(`[animeMapping] autoMap search failed for "${input.title}":`, err);
    return null;
  }
  if (candidates.length === 0) return null;

  // 3. Score and pick the best candidate.
  let best: { media: AniListMedia; score: number } | null = null;
  for (const media of candidates) {
    const score = scoreCandidate(media, {
      title: input.title,
      year: input.year,
      type: input.tmdbType
    });
    if (!best || score > best.score) best = { media, score };
  }
  if (!best || best.score < 70) {
    // Threshold: 70 = strong match. Below that we don't auto-map
    // (the user can manually map via the admin panel).
    return null;
  }

  // 4. Save the mapping.
  const confidence: MappingConfidence =
    best.score >= 95 ? "high" : best.score >= 80 ? "medium" : "low";

  const title =
    best.media.title?.userPreferred ||
    best.media.title?.english ||
    best.media.title?.romaji ||
    input.title;

  await saveMapping({
    tmdbId: input.tmdbId,
    tmdbType: input.tmdbType ?? "tv",
    anilistId: best.media.id,
    anilistType: (best.media.type as "ANIME" | "MANGA") ?? "ANIME",
    title,
    matchConfidence: confidence,
    createdBy: "system"
  });

  return best.media.id;
}

// ─── Public: cache management ───────────────────────────────────────

/**
 * Clear the in-memory cache. Used by tests and by the admin panel
 * "refresh" button.
 */
export function clearMappingCache(): void {
  tmdbToAnilist.clear();
  anilistToTmdb.clear();
}
