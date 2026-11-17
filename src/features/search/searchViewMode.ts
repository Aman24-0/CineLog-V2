// src/features/search/searchViewMode.ts
/**
 * searchViewMode — persisted list/card preference for the Search page.
 *
 * SSR-safe (guards against a missing localStorage) and quota-safe, matching
 * the pattern in searchStorage.ts. Stored under its own key so clearing
 * recent searches never resets the user's layout choice.
 */
export type SearchViewMode = "list" | "card";

export const VIEW_MODE_KEY = "cinelog_search_view_mode";

export function loadViewMode(): SearchViewMode {
  if (typeof localStorage === "undefined") return "list";
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    return raw === "card" ? "card" : "list";
  } catch {
    return "list";
  }
}

export function saveViewMode(mode: SearchViewMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
