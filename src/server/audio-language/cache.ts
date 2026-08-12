// src/server/audio-language/cache.ts
//
// CineLog V2 — Audio Language Cache (Supabase)
// ---------------------------------------------------------------------
// Reads + writes the `audio_languages_cache` table.
//
// The table schema (see supabase/migrations/20260816_audio_languages_cache.sql):
//   id uuid PK
//   media_type text   ("movie" | "tv")
//   tmdb_id    bigint
//   data       jsonb  (the full AudioLanguageResult)
//   expires_at timestamptz
//   fetched_at timestamptz
//   created_at timestamptz
//   updated_at timestamptz
//   UNIQUE (media_type, tmdb_id)
//
// Reads are world-readable (RLS policy). Writes go through the service
// role (server-only) which bypasses RLS — same pattern as tmdb_cache.
//
// TTL: 14 days by default. Per spec STEP 12, this is configurable via
// `AUDIO_LANGUAGE_CACHE_TTL_DAYS` env var (range: 1-90 days).

import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "~/lib/supabase/database.types";
import type { AudioLanguageResult } from "./types";

/** Default cache TTL — 14 days. OTT audio availability changes, but slowly. */
export const DEFAULT_CACHE_TTL_DAYS = 14;

/** Read the configured TTL from env, clamped to [1, 90]. */
export function getCacheTtlMs(): number {
  const raw = process.env.AUDIO_LANGUAGE_CACHE_TTL_DAYS;
  if (!raw) return DEFAULT_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const days = parseInt(raw, 10);
  if (!Number.isFinite(days) || days < 1) return DEFAULT_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const clamped = Math.min(90, Math.max(1, days));
  return clamped * 24 * 60 * 60 * 1000;
}

/**
 * Lazy-init service-role client. Created on first use so the module
 * can be imported in tests without env vars present.
 *
 * The `Database` generic gives us typed `.from("audio_languages_cache")`
 * access (the schema was added to `database.types.ts` alongside the
 * SQL migration).
 */
let _client: ReturnType<typeof createClient<Database>> | null = null;
function getServiceClient() {
  if (_client) return _client;
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Audio-language cache requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  _client = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _client;
}

export interface CacheLookupResult {
  /** The cached result, or null if no entry exists. */
  result: AudioLanguageResult | null;
  /** Whether the entry was fresh (not expired). */
  fresh: boolean;
  /** The stored expires_at timestamp (ISO), if an entry exists. */
  expiresAt?: string;
  /** The stored fetched_at timestamp (ISO), if an entry exists. */
  fetchedAt?: string;
}

/**
 * Read a cached audio-language result for the given title.
 *
 * Returns:
 *   - { result: null, fresh: false }  when no entry exists.
 *   - { result, fresh: true }         when entry exists and is not expired.
 *   - { result, fresh: false, ... }   when entry exists but is expired
 *                                     (stale-while-revalidate: caller may
 *                                     serve the stale data and trigger a
 *                                     background refresh).
 */
export async function readCache(
  tmdbId: number,
  type: "movie" | "tv"
): Promise<CacheLookupResult> {
  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.warn("[audio-language/cache] readCache: service client unavailable:", err);
    return { result: null, fresh: false };
  }

  const { data, error } = await supabase
    .from("audio_languages_cache")
    .select("data, expires_at, fetched_at")
    .eq("media_type", type)
    .eq("tmdb_id", tmdbId)
    .maybeSingle();

  if (error) {
    console.warn("[audio-language/cache] readCache query error:", error.message);
    return { result: null, fresh: false };
  }

  if (!data) {
    return { result: null, fresh: false };
  }

  const now = Date.now();
  const expiresAt = data.expires_at;
  const fetchedAt = data.fetched_at;
  const fresh = expiresAt ? new Date(expiresAt).getTime() > now : false;

  return {
    result: data.data as unknown as AudioLanguageResult,
    fresh,
    expiresAt,
    fetchedAt
  };
}

/**
 * Write a result to the cache, upserting on (media_type, tmdb_id).
 */
export async function writeCache(
  tmdbId: number,
  type: "movie" | "tv",
  result: AudioLanguageResult
): Promise<void> {
  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.warn("[audio-language/cache] writeCache: service client unavailable:", err);
    return;
  }

  const ttlMs = getCacheTtlMs();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

  // Attach expiresAt to the stored result so the worker can return it
  // to the API endpoint without an extra DB read.
  const resultWithExpiry: AudioLanguageResult = {
    ...result,
    expiresAt
  };

  const { error } = await supabase
    .from("audio_languages_cache")
    .upsert(
      {
        media_type: type,
        tmdb_id: tmdbId,
        data: resultWithExpiry as unknown as Json,
        expires_at: expiresAt,
        fetched_at: now.toISOString(),
        updated_at: now.toISOString()
      },
      { onConflict: "media_type,tmdb_id", ignoreDuplicates: false }
    );

  if (error) {
    console.warn("[audio-language/cache] writeCache upsert error:", error.message);
  } else {
    console.log("[AUDIO] Saved to cache (expires " + expiresAt + ")");
  }
}

/**
 * List stale cache entries — used by the background refresh job to
 * find titles whose cached data should be re-fetched.
 *
 * Returns up to `limit` (media_type, tmdb_id) pairs whose `expires_at`
 * is in the past.
 */
export async function listStaleEntries(
  limit = 50
): Promise<Array<{ media_type: "movie" | "tv"; tmdb_id: number }>> {
  let supabase;
  try {
    supabase = getServiceClient();
  } catch {
    return [];
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("audio_languages_cache")
    .select("media_type, tmdb_id")
    .lt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    media_type: row.media_type as "movie" | "tv",
    tmdb_id: row.tmdb_id
  }));
}
