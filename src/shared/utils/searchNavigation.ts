export type SearchNavigationIntent = "preserve" | "reset" | "none";

const DETAIL_ROUTE_PATTERN = /^\/(?:movie|tv)\/\d+\/?$/;

/**
 * Normalize a router navigation target into a pathname without query/hash.
 * Numeric targets represent browser-history movement and have no destination
 * pathname available to the before-leave hook.
 */
export function pathnameFromNavigationTarget(
  target: string | number
): string | null {
  if (typeof target === "number") return null;
  const queryStart = target.search(/[?#]/);
  return queryStart === -1 ? target : target.slice(0, queryStart);
}

export function isDedicatedDetailPath(pathname: string): boolean {
  return DETAIL_ROUTE_PATTERN.test(pathname);
}

/**
 * The global overlay is an explicit contextual surface. A query belonging to
 * the first-class `/search` route must never cause that overlay to mount above
 * a later page.
 */
export function shouldRenderSearchOverlay(
  pathname: string,
  searchOpen: boolean
): boolean {
  return pathname !== "/search" && searchOpen;
}

/**
 * Search is preserved only for a dedicated movie/TV detail transition. Every
 * other departure from /search is a new primary-page session and resets the
 * live query/results state. Same-route query changes are neutral.
 */
export function getSearchNavigationIntent(
  fromPathname: string,
  target: string | number
): SearchNavigationIntent {
  if (fromPathname !== "/search") return "none";

  const toPathname = pathnameFromNavigationTarget(target);
  if (toPathname === "/search") return "none";
  if (toPathname && isDedicatedDetailPath(toPathname)) return "preserve";
  return "reset";
}
