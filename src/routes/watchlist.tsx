import { Navigate } from "@solidjs/router";

/**
 * Legacy compatibility route. The product-facing destination is /library,
 * but existing bookmarks and shared links should continue to resolve.
 */
export default function LegacyWatchlistRoute() {
  return <Navigate href="/library" />;
}
