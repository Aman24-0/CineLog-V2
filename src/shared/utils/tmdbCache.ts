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
// 7 days — matches the server-side tmdb_cache TTL. At 24h the browser
// cache expired every single day, so the first load of the day fell back
// to ~900 individual TMDB requests (the "watchlist takes 30-40s" report).
// 7 days also means the localStorage payload is bigger; writes are pruned
// by expiry and capped below so we never blow the 5MB quota.
const LS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
// Hard cap on cached titles. ~900 titles × ~1KB ≈ 1MB, well inside quota,
// and it stops a 5000-item library from filling localStorage.
const LS_MAX_ENTRIES = 2000;

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
    // Cap the payload size — drop the entries closest to expiry first.
    const keys = Object.keys(existing);
    if (keys.length > LS_MAX_ENTRIES) {
      keys
        .sort((a, b) => existing[a].expiresAt - existing[b].expiresAt)
        .slice(0, keys.length - LS_MAX_ENTRIES)
        .forEach((key) => delete existing[key]);
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
        const res = await fetch(
          `/api/tmdb-cache?keys=${encodeURIComponent(keysParam)}`,
          {
            signal: controller.signal
          }
        );
        clearTimeout(timeoutId);
        if (!res.ok) {
          console.warn(`[tmdbCache] Server API returned ${res.status}`);
          continue;
        }
        const json = await res.json();
        if (json.data) {
          for (const [key, data] of Object.entries(
            json.data as Record<string, TMDBTitle>
          )) {
            serverMap.set(key, data);
          }
        }
      } catch (chunkErr) {
        clearTimeout(timeoutId);
        console.warn(
          "[tmdbCache] Chunk fetch failed (timeout or network):",
          chunkErr
        );
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
    // Phase 13 Chunk 2 (Bug #5): the POST route now requires an
    // authenticated session. We attach the Supabase access token
    // via the Authorization header so the server can verify the
    // caller. If no session is active (signed-out visitor), the
    // fetch will 401 — that's fine; the LS cache still works for
    // the next visit, and the server cache is just an optimization.
    const { getAuthHeaders } = await import("~/lib/supabase/session");
    const headers = {
      "Content-Type": "application/json",
      ...(await getAuthHeaders())
    };

    // Chunk the write. A cold 900-title library used to send ONE body of
    // ~900 rows; PostgREST upserts that large are slow and prone to
    // timeouts, which silently dropped the whole batch (leaving the server
    // cache empty and every future load slow). 100 rows per request keeps
    // each upsert fast and lets the rest succeed if one chunk fails.
    const WRITE_CHUNK = 100;
    for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
      const chunk = entries.slice(i, i + WRITE_CHUNK);
      await fetch("/api/tmdb-cache", {
        method: "POST",
        headers,
        body: JSON.stringify({ entries: chunk })
      }).catch((err) => {
        console.warn("[tmdbCache] Background cache write failed:", err);
      });
    }
  } catch {
    // Silently ignore — cache write is best-effort
  }
}

/**
 * Build a tmdb_cache key from media_type and tmdb_id.
 * Format: "movie/550" or "tv/1399"
 */
export function buildCacheKey(
  mediaType: "movie" | "tv",
  tmdbId: number | string
): string {
  return `${mediaType}/${tmdbId}`;
}
