import { useNavigate, useLocation } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import NavButton from "./NavButton";

export const PRIMARY_NAV_LABELS = [
  "Discover",
  "Library",
  "Search",
  "Collections",
  "Profile"
] as const;

/**
 * BottomNavigation — primary navigation bar fixed to the viewport bottom.
 *
 * Primary navigation is deliberately split into five destinations:
 *   Discover, Library, Search, Collections, and Profile. Search is a
 *   first-class route rather than an alias for Discover, while Discover
 *   retains its own exploratory surface and Genre Explorer.
 *
 * For logged-out users, the Profile tab opens the AuthModal directly
 * instead of navigating to the empty profile page.
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
        label={PRIMARY_NAV_LABELS[0]}
        href="/discover"
        active={path() === "/discover"}
        onClick={() => go("/discover")}
      />

      <NavButton
        icon="video_library"
        label={PRIMARY_NAV_LABELS[1]}
        href="/library"
        active={path() === "/library" || path() === "/watchlist"}
        onClick={() => go("/library")}
      />

      <NavButton
        icon="search"
        label={PRIMARY_NAV_LABELS[2]}
        href="/search"
        active={path() === "/search"}
        onClick={() => go("/search")}
      />

      <NavButton
        icon="collections_bookmark"
        label={PRIMARY_NAV_LABELS[3]}
        href="/collections"
        active={path() === "/collections" || path().startsWith("/collections/")}
        onClick={() => go("/collections")}
      />

      <NavButton
        icon="person"
        label={PRIMARY_NAV_LABELS[4]}
        href="/profile"
        active={path() === "/profile" || path().startsWith("/profile/")}
        onClick={handleProfileClick}
      />
    </nav>
  );
}
