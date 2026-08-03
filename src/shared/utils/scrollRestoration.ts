/**
 * CineLog V2 — Scroll Restoration for Main Tab Routes
 * ---------------------------------------------------------------------
 * Saves and restores window scroll position when navigating between
 * the four main tab routes (Discover, Watchlist, Collections, Profile).
 *
 * How it works:
 *   1. When the user navigates away from a tab route, the current
 *      scrollY is saved (via the debounced scroll listener + a
 *      synchronous save in the pathname-change effect).
 *   2. When the user navigates to a previously-visited tab route,
 *      the scroll position is restored AFTER the route transition
 *      completes (isRouting goes false) and the new page's DOM
 *      has been painted (one rAF).
 *
 * Why this approach:
 *   The naive 2× rAF approach failed for three reasons:
 *     a) @solidjs/router calls scrollTo(0,0) synchronously on every
 *        navigation (scroll: true default). This fires AFTER our
 *        effect schedules rAF but BEFORE those rAFs execute, so the
 *        router scrolls the loading skeleton to top.
 *     b) 2× rAF (~33ms) fires before lazy chunks resolve and the
 *        Suspense boundary swaps the fallback for real content.
 *     c) There was no mechanism to re-apply the scroll position after
 *        the real content finally rendered.
 *
 *   Solution: watch isRouting() go true → false. This signal only
 *   transitions to false AFTER the route transition completes, lazy
 *   chunks have loaded, and Suspense has resolved. One final rAF
 *   ensures the browser has painted the new DOM before we scroll.
 *
 * SSR Safety:
 *   ALL window/document access is guarded with `typeof window !== "undefined"`.
 *   The function itself is called inside onMount() in AppShell.
 *
 * Memory safety:
 *   - Only 4 entries max (one per tab route).
 *   - Positions are simple numbers — negligible memory.
 *   - Cleaned up when the owner component unmounts (via onCleanup).
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

/**
 * Initialize scroll restoration.
 *
 * Call once from onMount in a component above the route level (AppShell).
 */
export function initScrollRestoration(): void {
  const isBrowser = typeof window !== "undefined";

  const location = useLocation();
  const isRouting = useIsRouting();

  // The pathname to restore scroll for, set during the navigation
  // effect and consumed when isRouting transitions to false.
  let pendingRestore: { key: string; y: number } | null = null;

  // --- Effect 1: Track pathname changes, save scroll, arm restore ---
  createEffect(() => {
    const pathname = location.pathname;

    // Skip the very first render — no previous route to save.
    if (prevPathname === null) {
      prevPathname = pathname;
      return;
    }

    // --- LEAVING the previous route ---
    // Synchronously save scroll position of the route we're leaving.
    // This captures the position at the exact moment of navigation,
    // before the router's own scrollTo(0,0) fires.
    if (prevPathname !== pathname && isTabRoute(prevPathname) && isBrowser) {
      const key = getTabKey(prevPathname);
      if (key !== null) {
        scrollPositions.set(key, window.scrollY);
      }
    }

    // --- ARRIVING at the new route ---
    // Don't restore immediately — the router will scrollTo(0,0) and
    // the page is still showing the Suspense fallback. Instead, arm
    // a pending restore that fires when isRouting goes false (i.e.
    // after the route transition, lazy chunks, and Suspense resolve).
    if (isTabRoute(pathname)) {
      const key = getTabKey(pathname);
      if (key !== null && scrollPositions.has(key)) {
        const savedY = scrollPositions.get(key)!;
        if (savedY > 0) {
          pendingRestore = { key, y: savedY };
        }
      }
    }

    prevPathname = pathname;
  });

  // --- Effect 2: Restore scroll AFTER route transition completes ---
  // isRouting goes false after the router finishes the transition,
  // lazy chunks have loaded, and Suspense has swapped the fallback
  // for the real DOM. One rAF ensures the browser has painted.
  createEffect(() => {
    const routing = isRouting();
    if (!routing && pendingRestore !== null && isBrowser) {
      const { y } = pendingRestore;
      pendingRestore = null;

      requestAnimationFrame(() => {
        window.scrollTo(0, y);
      });
    }
  });

  // --- Debounced scroll listener for continuous position capture ---
  // This ensures we always have the latest scroll position even if
  // the user scrolls, waits, then navigates.
  if (isBrowser) {
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      // Don't save while we're mid-restore.
      if (pendingRestore) return;
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
