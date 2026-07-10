// src/features/search/searchStorage.ts
/**
 * searchStorage — localStorage helpers for recent searches.
 *
 * Extracted from useSearch.ts to keep the hook focused on state + effects.
 * Max 8 entries, deduped, MRU first. All functions are SSR-safe (guard
 * against `localStorage === undefined`).
 */
export const RECENT_KEY = "cinelog_recent_searches";
export const MAX_RECENT = 8;

export function loadRecent(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s) => typeof s === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function saveRecent(items: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    /* ignore quota errors */
  }
}
