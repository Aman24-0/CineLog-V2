import { createEffect, onCleanup, onMount } from "solid-js";
import { useLocation } from "@solidjs/router";

const STORAGE_KEY = "cinelog.route-scroll.v1";
const MAX_SAVED_ROUTES = 24;

type ScrollPositions = Record<string, number>;

function readPositions(storage: Storage): ScrollPositions {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<ScrollPositions>((result, [key, value]) => {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        result[key] = value;
      }
      return result;
    }, {});
  } catch {
    return {};
  }
}

function writePositions(storage: Storage, positions: ScrollPositions): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Storage can be unavailable in private browsing or under a strict quota.
    // Scroll restoration is best-effort and must never affect navigation.
  }
}

function scrollTarget(): Window | HTMLElement {
  if (typeof window === "undefined" || typeof document === "undefined") return window;
  const main = document.getElementById("main-content");
  // DesktopWorkspace makes #main-content the scroll container. Mobile keeps
  // normal document scrolling, so use window there.
  if (main && window.matchMedia?.("(min-width: 1024px)").matches) return main;
  return window;
}

function readScrollTop(): number {
  const target = scrollTarget();
  return target instanceof HTMLElement ? target.scrollTop : window.scrollY;
}

function restoreScrollTop(top: number): void {
  const target = scrollTarget();
  target.scrollTo({ top, behavior: "auto" });
}

/** Small storage-backed route scroll store, exported for deterministic tests. */
export function createRouteScrollStore(storage: Storage) {
  const positions = readPositions(storage);

  return {
    get(route: string): number {
      return positions[route] ?? 0;
    },
    save(route: string, y: number): void {
      if (!route || !Number.isFinite(y) || y < 0) return;
      positions[route] = Math.floor(y);
      const routes = Object.keys(positions);
      if (routes.length > MAX_SAVED_ROUTES) {
        for (const oldRoute of routes.slice(0, routes.length - MAX_SAVED_ROUTES)) {
          delete positions[oldRoute];
        }
      }
      writePositions(storage, positions);
    }
  };
}

export function canonicalRouteKey(
  pathname: string,
  search = "",
  hash = ""
): string {
  const canonicalPath = pathname === "/watchlist" ? "/library" : pathname;
  return `${canonicalPath}${search}${hash}`;
}

function routeKey(location: ReturnType<typeof useLocation>): string {
  return canonicalRouteKey(location.pathname, location.search, location.hash);
}

/**
 * Preserve the current route's scroll position without coupling it to data
 * fetching. Positions are scoped by pathname + query + hash, so returning to
 * a long page restores that page only rather than applying one global offset.
 */
export function useRouteScrollRestoration(): void {
  const location = useLocation();
  let store: ReturnType<typeof createRouteScrollStore> | null = null;
  let activeRoute = "";
  let restoreTimer: ReturnType<typeof setTimeout> | null = null;
  let restoreToken = 0;
  let previousScrollRestoration: ScrollRestoration | null = null;

  const saveActiveRoute = () => {
    if (!store || !activeRoute || typeof window === "undefined") return;
    store.save(activeRoute, readScrollTop());
  };

  const scheduleRestore = (route: string) => {
    if (!store || typeof window === "undefined") return;
    const token = ++restoreToken;
    if (restoreTimer !== null) clearTimeout(restoreTimer);

    const restore = () => {
      if (token !== restoreToken || activeRoute !== route) return;
      restoreScrollTop(store!.get(route));
      restoreTimer = null;
    };

    // Wait for the route tree and its first layout pass. The timeout is a
    // second pass for long pages whose data-backed content mounts one tick
    // later; it still restores only this route's saved position.
    requestAnimationFrame(() => requestAnimationFrame(restore));
    restoreTimer = setTimeout(restore, 120);
  };

  onMount(() => {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
    store = createRouteScrollStore(sessionStorage);
    previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveActiveRoute();
      else scheduleRestore(activeRoute);
    };
    const onPageHide = () => saveActiveRoute();
    const onPageShow = () => scheduleRestore(activeRoute);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    if (!activeRoute) activeRoute = routeKey(location);
    scheduleRestore(activeRoute);

    onCleanup(() => {
      saveActiveRoute();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      if (restoreTimer !== null) clearTimeout(restoreTimer);
      if (previousScrollRestoration !== null) {
        window.history.scrollRestoration = previousScrollRestoration;
      }
    });
  });

  createEffect(() => {
    const nextRoute = routeKey(location);
    if (!nextRoute || nextRoute === activeRoute) return;
    saveActiveRoute();
    activeRoute = nextRoute;
    scheduleRestore(nextRoute);
  });
}
