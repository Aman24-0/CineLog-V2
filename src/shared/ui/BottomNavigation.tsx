import { useNavigate, useLocation } from "@solidjs/router";
import NavButton from "./NavButton";

/**
 * BottomNavigation — primary navigation bar fixed to the viewport bottom.
 *
 * Navigation restructure (Profile phase):
 *   The Home/Dashboard page has been removed. Its responsibilities
 *   (Recently Added, Continue Watching, Statistics) already exist in
 *   the Watchlist and Profile pages, so keeping a duplicate Home page
 *   would violate the "no duplicated information" principle.
 *
 * Bottom nav is now exactly four destinations, in this order:
 *   1. Discover  — serendipitous browsing, Spotlight, upcoming
 *   2. Search    — intentional search-by-query
 *   3. Watchlist — the user's library (formerly "Vault")
 *   4. Collections — user folders + subscribed universes (promoted
 *      from a Watchlist sub-page to a primary destination)
 *
 * Profile is NOT in the bottom nav — it's accessed from the AppHeader
 * avatar, which navigates to /profile.
 *
 * The bar is opaque (not glass) so content scrolling underneath never
 * bleeds through — this matches Letterboxd / Trakt / TV Time, which all
 * use solid bottom bars for thumb-zone stability.
 */
export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  // Active state is derived from the current URL so the highlight matches the
  // page the user is actually on, regardless of how they navigated.
  const path = () => location.pathname;

  const go = (href: string) => {
    navigate(href);
  };

  return (
    <nav
      class="fixed bottom-0 left-0 flex w-full"
      style={{
        height: "var(--nav-total-height)",
        "padding-bottom": "var(--nav-safe-area)",
        "z-index": 40,
        background: "var(--tier-1)",
        "border-top": "1px solid var(--hairline)",
        "box-shadow": "0 -1px 0 0 var(--hairline), 0 -8px 24px -8px rgba(0,0,0,0.6)",
      }}
      aria-label="Primary navigation"
    >
      <NavButton
        icon="explore"
        label="Discover"
        active={path() === "/discover"}
        onClick={() => go("/discover")}
      />

      <NavButton
        icon="search"
        label="Search"
        active={path() === "/search"}
        onClick={() => go("/search")}
      />

      <NavButton
        icon="visibility"
        label="Watchlist"
        active={path() === "/watchlist"}
        onClick={() => go("/watchlist")}
      />

      <NavButton
        icon="collections_bookmark"
        label="Collections"
        active={path() === "/collections" || path().startsWith("/collections/")}
        onClick={() => go("/collections")}
      />
    </nav>
  );
}
