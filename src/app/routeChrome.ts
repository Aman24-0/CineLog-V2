const BACK_NAVIGATION_ROUTES = new Set([
  "/profile/achievements",
  "/profile/recent-activity",
  "/profile/stats",
  "/profile/upcoming",
  "/profile/trash"
]);

/**
 * These pages expose an explicit back-to-profile/settings control and should
 * not also show the primary bottom navigation on mobile.
 */
export function shouldHideBottomNavigation(pathname: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return (
    BACK_NAVIGATION_ROUTES.has(normalizedPath) ||
    normalizedPath === "/settings" ||
    normalizedPath.startsWith("/settings/")
  );
}
