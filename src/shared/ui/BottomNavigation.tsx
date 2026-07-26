import { useNavigate, useLocation } from "@solidjs/router";
import NavButton from "./NavButton";

/**
 * BottomNavigation — primary navigation bar fixed to the viewport bottom.
 *
 * Navigation restructure (Search → Discover merge):
 *   The dedicated Search page has been removed. Search is now a first-
 *   class citizen of the Discover page (search bar pinned to the top of
 *   Discover, with the Genre Explorer right below it). This collapses
 *   the "intentional vs serendipitous" split into a single primary
 *   surface — the user no longer has to switch tabs to do both.
 *
 * Bottom nav is now exactly three destinations, in this order:
 *   1. Discover    — serendipitous browsing + intentional search + genre
 *                    exploration, all in one place
 *   2. Watchlist   — the user's library (formerly "Vault")
 *   3. Collections — user folders + subscribed universes (promoted
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
      class="fixed flex bottom-nav-glass"
      aria-label="Primary navigation"
    >
      <NavButton
        icon="explore"
        label="Discover"
        active={path() === "/discover" || path() === "/search"}
        onClick={() => go("/discover")}
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
