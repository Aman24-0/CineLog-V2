/**
 * CineLog V2 — Scroll Restoration for Main Tab Routes
 * ---------------------------------------------------------------------
 * Saves and restores window scroll position when navigating between
 * the four main tab routes (Discover, Watchlist, Collections, Profile).
 *
 * How it works:
 *   1. Before leaving a tab route, the current scrollY is saved to a Map.
 *   2. After arriving at a previously-visited tab route, scrollY is
 *      restored from the Map.
 *
 * Integration:
 *   Call `initScrollRestoration()` once from a component that lives
 *   above the route level (e.g. AppShell). It uses `useLocation()` to
 *   track navigations and `useIsRouting()` to detect when routing is
 *   in progress.
 *
 * SSR Safety:
 *   ALL window/document access is guarded with `typeof window !== "undefined"`.
 *   The scroll event listener and scrollTo calls only run in the browser.
 *
 * Memory safety:
 *   - Only 4 entries max (one per tab route).
 *   - Positions are simple numbers — negligible memory.
 *   - Cleaned up when the owner component unmounts (via onCleanup).
 *
 * Limitations:
 *   - Only tracks the 4 main tab routes. Sub-pages (settings, admin,
 *     collection detail, etc.) are NOT tracked — they get native
 *     browser back/forward behavior.
 *   - Does NOT restore carousel horizontal scroll positions (that
 *     would require DOM refs to each carousel, which is fragile).
 *   - On page refresh, all positions are lost (by design — this is
 *     a session-only optimization for SPA tab switching).
 */

import { createEffect, onCleanup } from "solid-js";
import { useLocation, useIsRouting } from "@solidjs/router";

/** The routes whose scroll positions we track. */
const TAB_ROUTES = ["/discover", "/watchlist", "/collections", "/profile"] as const;

/** Check if a pathname belongs to a tracked tab route (prefix match). */
function isTabRoute(pathname: string): boolean {
  return TAB_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

/** Extract the base tab key from a pathname. */
function getTabKey(pathname: string): string | null {
  for (const r of TAB_ROUTES) {
    if (pathname === r || pathname.startsWith(r + "/")) return r;
  }
  return null;
}

/** In-memory scroll position store. Keyed by tab route path. */
const scrollPositions = new Map<string, number>();

/** Previous pathname for detecting navigation. */
let prevPathname: string | null = null;

/** Whether we just restored (to prevent save-then-restore race). */
let justRestored = false;

/**
 * Initialize scroll restoration.
 *
 * Call once from a component mounted above the route level (AppShell).
 * Uses createEffect to react to pathname changes from the router.
 *
 * When navigating away from a tab route: saves current scrollY.
 * When navigating to a previously-visited tab route: restores scrollY.
 */
export function initScrollRestoration(): void {
  // SSR guard — bail out entirely on the server.
  // useLocation() and useIsRouting() are safe in SSR (they return
  // reactive signals), but all window/document access below must
  // only happen in the browser.
  const isBrowser = typeof window !== "undefined";

  const location = useLocation();
  const isRouting = useIsRouting();

  createEffect(() => {
    const pathname = location.pathname;

    // Skip if this is the very first render (no previous route to save).
    if (prevPathname === null) {
      prevPathname = pathname;
      // On first load, if we land on a tab route, don't save or restore.
      // The browser handles the initial scroll position.
      return;
    }

    // --- LEAVING the previous route ---
    // Save scroll position of the previous route if it was a tab route.
    if (prevPathname !== pathname && isTabRoute(prevPathname)) {
      const key = getTabKey(prevPathname);
      if (key !== null && isBrowser) {
        scrollPositions.set(key, window.scrollY);
      }
    }

    // --- ARRIVING at the new route ---
    if (isTabRoute(pathname)) {
      const key = getTabKey(pathname);
      if (key !== null && scrollPositions.has(key) && isBrowser) {
        const savedY = scrollPositions.get(key)!;
        if (savedY > 0) {
          justRestored = true;
          // Use requestAnimationFrame to ensure the new page's DOM
          // has rendered before we scroll. Two rAFs ensure the
          // browser has painted the new content.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo(0, savedY);
              justRestored = false;
            });
          });
        }
      }
    }

    prevPathname = pathname;
  });

  // Also save scroll position on scroll events (debounced)
  // so if the user scrolls, waits a bit, then navigates, we still
  // capture the latest position.
  // Guard: only attach the listener in the browser.
  if (isBrowser) {
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (justRestored) return;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const current = prevPathname;
        if (current && isTabRoute(current)) {
          const key = getTabKey(current);
          if (key !== null) {
            scrollPositions.set(key, window.scrollY);
          }
        }
      }, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    onCleanup(() => {
      window.removeEventListener("scroll", onScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
    });
  }
}

/**
 * Clear a specific tab's saved scroll position.
 * Useful when a page forces scroll-to-top (e.g. after a search).
 */
export function clearScrollPosition(pathname: string): void {
  const key = getTabKey(pathname);
  if (key !== null) {
    scrollPositions.delete(key);
  }
}

/**
 * Clear all saved scroll positions.
 * Useful on sign-out to reset all tabs.
 */
export function clearAllScrollPositions(): void {
  scrollPositions.clear();
}
