// src/shared/utils/clearStorage.ts
//
// Real utilities for clearing user data — used by Privacy page.
//
// - clearSearchHistory()  → wipes all search-related localStorage keys
// - clearTmdbCache()      → wipes IndexedDB TMDB cache + in-memory cache
// - clearAllLocalStorage() → nuclear option (used by reset library)
// - getStorageBreakdown()  → returns sizes per category for UI display

/** Keys / prefixes that count as "search history". */
const SEARCH_HISTORY_PATTERNS = [
  "cinelog_search_history",
  "cinelog_recent_searches",
  "cinelog_search_",
];

/** Keys / patterns that count as "TMDB cache". */
const TMDB_CACHE_KEYS = [
  "cinelog_tmdb_cache",
  "cinelog_tmdb_meta",
];

/** All localStorage keys CineLog owns (used for nuclear reset). */
export const ALL_CINELOG_PREFIXES = ["cinelog_"];

/** Clear all search history. Returns number of keys removed. */
export function clearSearchHistory(): number {
  let removed = 0;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (SEARCH_HISTORY_PATTERNS.some((p) => key.startsWith(p) || key === p)) {
      localStorage.removeItem(key);
      removed++;
    }
  }
  return removed;
}

/**
 * Clear TMDB cache.
 * Tries IndexedDB first (if used), then localStorage fallback.
 * Returns the number of stores/keys cleared.
 */
export async function clearTmdbCache(): Promise<number> {
  let removed = 0;

  // Try IndexedDB — CineLog may use a 'tmdb-cache' DB or similar
  try {
    if (typeof indexedDB !== "undefined") {
      // Best-effort: open and clear known DBs
      const dbs = await indexedDB.databases?.();
      if (dbs) {
        for (const db of dbs) {
          if (db.name && /tmdb|cinelog/i.test(db.name)) {
            await new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(db.name!);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            });
            removed++;
          }
        }
      }
    }
  } catch {
    // IndexedDB may not be available — fall through
  }

  // localStorage fallback
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (TMDB_CACHE_KEYS.some((p) => key.startsWith(p) || key === p)) {
      localStorage.removeItem(key);
      removed++;
    }
  }

  // Also clear sessionStorage TMDB keys
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (TMDB_CACHE_KEYS.some((p) => key.startsWith(p) || key === p)) {
        sessionStorage.removeItem(key);
        removed++;
      }
    }
  } catch {
    // ignore
  }

  return removed;
}

/** Nuclear — clear ALL cinelog_* localStorage. Returns count removed. */
export function clearAllCinelogStorage(): number {
  let removed = 0;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (ALL_CINELOG_PREFIXES.some((p) => key.startsWith(p))) {
      localStorage.removeItem(key);
      removed++;
    }
  }
  return removed;
}

export interface StorageBreakdown {
  searchHistoryKeys: number;
  tmdbCacheKeys: number;
  totalKeys: number;
  approxBytes: number;
}

/** Inspect localStorage to report size per category (for the Privacy page UI). */
export function getStorageBreakdown(): StorageBreakdown {
  let searchHistoryKeys = 0;
  let tmdbCacheKeys = 0;
  let totalKeys = 0;
  let approxBytes = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!key.startsWith("cinelog_")) continue;
    totalKeys++;
    const value = localStorage.getItem(key) ?? "";
    approxBytes += key.length + value.length;
    if (SEARCH_HISTORY_PATTERNS.some((p) => key.startsWith(p) || key === p)) {
      searchHistoryKeys++;
    }
    if (TMDB_CACHE_KEYS.some((p) => key.startsWith(p) || key === p)) {
      tmdbCacheKeys++;
    }
  }

  return { searchHistoryKeys, tmdbCacheKeys, totalKeys, approxBytes };
}

/** Human-readable byte size, e.g. "12.4 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
