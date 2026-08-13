// src/server/ott-providers/cache.ts
//
// CineLog V2 — OTT Provider Availability Cache (Supabase)
// ---------------------------------------------------------------------
// Reads + writes the `ott_provider_availability` table.
//
// The table schema:
//   id uuid PK
//   media_type text   ("movie" | "tv")
//   tmdb_id    bigint
//   region     text   (ISO 3166-1 alpha-2, e.g. "IN", "US", "DE")
//   data       jsonb  (the full ProviderAvailabilityResult)
//   expires_at timestamptz
//   fetched_at timestamptz
//   created_at timestamptz
//   updated_at timestamptz
//   UNIQUE (media_type, tmdb_id, region)
//
// REGION-AWARE KEY:
//   JustWatch offer data is region-specific. A cache entry written for
//   region="IN" must NEVER be returned for a "DE" request. The composite
//   key (media_type, tmdb_id, region) enforces this at the database level.
//
// Reads are world-readable (RLS policy). Writes go through the service
// role (server-only) which bypasses RLS.
//
// TTL: 7 days by default.

import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "~/lib/supabase/database.types";
import type { ProviderAvailabilityResult } from "./types";

/** Default cache TTL — 7 days. Provider availability changes moderately. */
export const DEFAULT_CACHE_TTL_DAYS = 7;

/** Read the configured TTL from env, clamped to [1, 90]. */
export function getCacheTtlMs(): number {
  const raw = process.env.OTT_PROVIDER_CACHE_TTL_DAYS;
  if (!raw) return DEFAULT_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const days = parseInt(raw, 10);
  if (!Number.isFinite(days) || days < 1) return DEFAULT_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const clamped = Math.min(90, Math.max(1, days));
  return clamped * 24 * 60 * 60 * 1000;
}

/**
 * Lazy-init service-role client. Created on first use so the module
 * can be imported in tests without env vars present.
 */
let _client: ReturnType<typeof createClient<Database>> | null = null;
function getServiceClient() {
  if (_client) return _client;
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "OTT provider cache requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  _client = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _client;
}

export interface CacheLookupResult {
  /** The cached result, or null if no entry exists. */
  result: ProviderAvailabilityResult | null;
  /** Whether the entry was fresh (not expired). */
  fresh: boolean;
  /** The stored expires_at timestamp (ISO), if an entry exists. */
  expiresAt?: string;
  /** The stored fetched_at timestamp (ISO), if an entry exists. */
  fetchedAt?: string;
}

/**
 * Read a cached provider-availability result for the given title + region.
 *
 * The cache key is (media_type, tmdb_id, region) — region is part of
 * the key so a row written for region="IN" is never returned for a
 * "DE" request.
 */
export async function readCache(
  tmdbId: number,
  type: "movie" | "tv",
  region: string
): Promise<CacheLookupResult> {
  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.warn("[ott-providers/cache] readCache: service client unavailable:", err);
    return { result: null, fresh: false };
  }

  const { data, error } = await supabase
    .from("ott_provider_availability")
    .select("data, expires_at, fetched_at")
    .eq("media_type", type)
    .eq("tmdb_id", tmdbId)
    .eq("region", region)
    .maybeSingle();

  if (error) {
    console.warn("[ott-providers/cache] readCache query error:", error.message);
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
    result: data.data as unknown as ProviderAvailabilityResult,
    fresh,
    expiresAt,
    fetchedAt
  };
}

/**
 * Write a result to the cache, upserting on (media_type, tmdb_id, region).
 *
 * Region is part of the upsert key — a write for region="IN" will not
 * overwrite an existing "DE" row for the same title.
 */
export async function writeCache(
  tmdbId: number,
  type: "movie" | "tv",
  region: string,
  result: ProviderAvailabilityResult
): Promise<void> {
  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.warn("[ott-providers/cache] writeCache: service client unavailable:", err);
    return;
  }

   const ttlMs = getCacheTtlMs();
   const now = new Date();
   const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

   const { error } = await supabase
     .from("ott_provider_availability")
     .upsert(
       {
         media_type: type,
         tmdb_id: tmdbId,
         region,
         data: result as unknown as Json,
         expires_at: expiresAt,
         fetched_at: now.toISOString(),
         updated_at: now.toISOString()
       },
       { onConflict: "media_type,tmdb_id,region", ignoreDuplicates: false }
     );

  if (error) {
    console.warn("[ott-providers/cache] writeCache upsert error:", error.message);
   } else {
    console.log(`[OTT] Saved to cache (region=${region}, expires ${expiresAt})`);
  }
}

/**
 * List stale cache entries — used by the background refresh job to
 * find titles whose cached data should be re-fetched.
 *
 * Returns up to `limit` (media_type, tmdb_id, region) triples whose
 * `expires_at` is in the past. Region is included so the refresh job
 * re-fetches each entry using its original region (preserving region
 * isolation).
 */
export async function listStaleEntries(
  limit = 50
): Promise<Array<{ media_type: "movie" | "tv"; tmdb_id: number; region: string }>> {
  let supabase;
  try {
    supabase = getServiceClient();
  } catch {
    return [];
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("ott_provider_availability")
    .select("media_type, tmdb_id, region")
    .lt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    media_type: row.media_type as "movie" | "tv",
    tmdb_id: row.tmdb_id,
    region: (row as { region?: string }).region ?? "US"
  }));
}
