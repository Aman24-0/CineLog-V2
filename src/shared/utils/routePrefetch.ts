/**
 * CineLog V2 — Route Chunk Prefetch
 * ---------------------------------------------------------------------
 * Preloads lazy route chunks on hover/touch/focus of navigation buttons.
 *
 * After the first navigation to a tab, the JS chunk is cached by the
 * browser's module system — subsequent navigations are instant. The
 * prefetch only helps on the VERY FIRST visit to a tab (or after a
 * hard refresh clears the module cache).
 *
 * Usage:
 *   prefetchRoute("/watchlist");
 *   prefetchRoute("/collections");
 *
 * The import() is fire-and-forget. Errors are silently ignored — if
 * the prefetch fails (network issue), the normal lazy() import on
 * navigation will retry.
 */

// Track which routes have been prefetched to avoid redundant import() calls.
const prefetched = new Set<string>();

/** Map of route paths to their lazy import triggers. */
const routeImports: Record<string, () => Promise<unknown>> = {
  "/discover": () => import("~/features/discover/DiscoverPage"),
  "/watchlist": () => import("~/features/watchlist/WatchlistView"),
  "/collections": () => import("~/features/collections/CollectionsPage"),
  "/profile": () => import("~/features/profile/ProfilePage"),
  "/settings": () => import("~/features/settings/SettingsPage"),
  "/search": () => import("~/features/search/SearchOverlay")
};

/**
 * Prefetch the JS chunk for a given route path.
 * Safe to call multiple times — only the first call triggers an import().
 */
export function prefetchRoute(path: string): void {
  // Normalize: strip trailing slash and query string
  const normalized = path.split("?")[0].replace(/\/$/, "");
  if (prefetched.has(normalized)) return;
  const importer = routeImports[normalized];
  if (!importer) return;
  prefetched.add(normalized);
  // Fire-and-forget — errors are non-fatal
  void importer().catch(() => {
    // Remove from prefetched set so a future attempt can retry
    prefetched.delete(normalized);
  });
}
