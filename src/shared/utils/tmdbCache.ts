/**
 * CineLog V2 — TMDB Cache Client
 * ---------------------------------------------------------------------
 * Client-side module for reading/writing the tmdb_cache table via
 * the server API route (/api/tmdb-cache).
 *
 * The server route uses the SUPABASE_SERVICE_ROLE_KEY to bypass RLS,
 * since tmdb_cache is shared metadata (not user-specific).
 *
 * Flow:
 *   1. fetchCachedMetadataBatch(keys) → GET /api/tmdb-cache?keys=...
 *      Returns a Map of cached TMDB data for keys that exist and aren't expired.
 *
 *   2. cacheMetadataEntries(entries) → POST /api/tmdb-cache
 *      Writes TMDB metadata to the cache after fetching from the API.
 *
 * This module also provides a localStorage fallback for instant
 * repeat visits (24h TTL), so even if the server API is slow,
 * the user gets cached data from their browser immediately.
 */

import type { TMDBTitle } from "~/shared/types";

// ─── localStorage cache layer ────────────────────────────────────
const LS_KEY = "cinelog_tmdb_cache";
const LS_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface LSCacheEntry {
  data: TMDBTitle;
  expiresAt: number;
}

function readLSCache(): Map<string, TMDBTitle> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, LSCacheEntry>;
    const now = Date.now();
    const map = new Map<string, TMDBTitle>();
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry.expiresAt > now) {
        map.set(key, entry.data);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function writeLSCache(entries: Array<{ key: string; data: TMDBTitle }>) {
  try {
    const existing = readLSCacheRaw();
    const now = Date.now();
    for (const { key, data } of entries) {
      existing[key] = { data, expiresAt: now + LS_TTL };
    }
    // Prune expired entries to keep localStorage small
    for (const key of Object.keys(existing)) {
      if (existing[key].expiresAt <= now) {
        delete existing[key];
      }
    }
    localStorage.setItem(LS_KEY, JSON.stringify(existing));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

function readLSCacheRaw(): Record<string, LSCacheEntry> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ─── Server API cache layer ───────────────────────────────────────

/**
 * Batch-fetch cached TMDB metadata from the server (tmdb_cache table).
 * Returns a Map keyed by "movie/{id}" or "tv/{id}".
 *
 * Only returns entries that exist and haven't expired.
 */
export async function fetchCachedMetadataBatch(
  keys: string[]
): Promise<Map<string, TMDBTitle>> {
  if (keys.length === 0) return new Map();

  // First check localStorage for instant results
  const lsCache = readLSCache();
  const lsHits = new Map<string, TMDBTitle>();
  const missingKeys: string[] = [];

  for (const key of keys) {
    const cached = lsCache.get(key);
    if (cached) {
      lsHits.set(key, cached);
    } else {
      missingKeys.push(key);
    }
  }

  // If all keys found in localStorage, return immediately
  if (missingKeys.length === 0) {
    console.log(`[tmdbCache] All ${keys.length} keys found in localStorage cache`);
    return lsHits;
  }

  // Fetch missing keys from server API
  const serverMap = new Map<string, TMDBTitle>();

  try {
    // Batch in chunks of 200 to avoid URL length limits
    const CHUNK_SIZE = 200;
    for (let i = 0; i < missingKeys.length; i += CHUNK_SIZE) {
      const chunk = missingKeys.slice(i, i + CHUNK_SIZE);
      const keysParam = chunk.join(",");
      // 5-second timeout: if the tmdb-cache API is slow, fall back to
      // direct TMDB fetches rather than blocking the vault load.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`/api/tmdb-cache?keys=${encodeURIComponent(keysParam)}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          console.warn(`[tmdbCache] Server API returned ${res.status}`);
          continue;
        }
        const json = await res.json();
        if (json.data) {
          for (const [key, data] of Object.entries(json.data as Record<string, TMDBTitle>)) {
            serverMap.set(key, data);
          }
        }
      } catch (chunkErr) {
        clearTimeout(timeoutId);
        console.warn("[tmdbCache] Chunk fetch failed (timeout or network):", chunkErr);
      }
    }
  } catch (err) {
    console.warn("[tmdbCache] Server API error:", err);
  }

  // Merge: localStorage hits + server results
  const result = new Map<string, TMDBTitle>([...lsHits, ...serverMap]);

  // Update localStorage with server results for future visits
  const lsUpdates: Array<{ key: string; data: TMDBTitle }> = [];
  for (const [key, data] of serverMap) {
    lsUpdates.push({ key, data });
  }
  if (lsUpdates.length > 0) {
    writeLSCache(lsUpdates);
  }

  console.log(
    `[tmdbCache] Fetched ${keys.length} keys: ` +
    `${lsHits.size} from localStorage, ${serverMap.size} from server, ` +
    `${keys.length - lsHits.size - serverMap.size} missing`
  );

  return result;
}

/**
 * Write TMDB metadata entries to the cache (server + localStorage).
 * Called after fetching fresh data from the TMDB API.
 *
 * @param entries Array of { key, tmdb_id, media_type, data }
 */
export async function cacheMetadataEntries(
  entries: Array<{
    key: string;
    tmdb_id: number;
    media_type: "movie" | "tv";
    data: TMDBTitle;
  }>
): Promise<void> {
  if (entries.length === 0) return;

  // Write to localStorage immediately (instant for next visit)
  writeLSCache(entries.map((e) => ({ key: e.key, data: e.data })));

  // Write to server API in the background (don't block the UI)
  // Use fire-and-forget so the user doesn't wait for cache writes
  try {
    fetch("/api/tmdb-cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    }).catch((err) => {
      console.warn("[tmdbCache] Background cache write failed:", err);
    });
  } catch {
    // Silently ignore — cache write is best-effort
  }
}

/**
 * Build a tmdb_cache key from media_type and tmdb_id.
 * Format: "movie/550" or "tv/1399"
 */
export function buildCacheKey(mediaType: "movie" | "tv", tmdbId: number | string): string {
  return `${mediaType}/${tmdbId}`;
}
