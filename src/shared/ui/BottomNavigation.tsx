import { useNavigate, useLocation } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
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
 * Social module removed — "Feed" tab replaced with "Profile":
 *   The social feed, people search, followers/following, and public
 *   profile features have been removed. CineLog is now a premium
 *   personal Movie / TV / Anime tracker. The bottom nav is exactly
 *   four destinations:
 *     1. Discover    — serendipitous browsing + intentional search + genre
 *                      exploration, all in one place
 *     2. Watchlist   — the user's library (formerly "Vault")
 *     3. Collections — user folders + subscribed universes
 *     4. Profile     — personal dashboard (stats, history, achievements)
 *
 *   For logged-out users, the Profile tab opens the AuthModal directly
 *   instead of navigating to the empty "Your Cinematic Identity" page.
 *   This matches the behavior of the previous Header Profile button.
 *
 * The bar is opaque (not glass) so content scrolling underneath never
 * bleeds through — this matches Letterboxd / Trakt / TV Time, which all
 * use solid bottom bars for thumb-zone stability.
 */
export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useAuth();
  const { openAuthModal } = useAuthModal();

  // Active state is derived from the current URL so the highlight matches the
  // page the user is actually on, regardless of how they navigated.
  const path = () => location.pathname;

  const go = (href: string) => {
    navigate(href);
  };

  /**
   * Handle Profile tab click:
   *   - Logged in → navigate to /profile
   *   - Logged out → open AuthModal directly
   * This avoids showing the empty "Your Cinematic Identity" placeholder
   * page for logged-out users.
   */
  const handleProfileClick = () => {
    if (isSignedIn()) {
      go("/profile");
    } else {
      openAuthModal();
    }
  };

  return (
    <nav class="bottom-nav-glass fixed flex" aria-label="Primary navigation">
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

      <NavButton
        icon="person"
        label="Profile"
        active={path() === "/profile" || path().startsWith("/profile/")}
        onClick={handleProfileClick}
      />
    </nav>
  );
}
