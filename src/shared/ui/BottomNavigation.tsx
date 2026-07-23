import { useNavigate, useLocation } from "@solidjs/router";
import NavButton from "./NavButton";

/**
 * BottomNavigation — CineLog primary 4-tab navigation.
 *
 * Tabs: Discover · Watchlist · Collections · Profile
 *
 * DESIGN: Floating glass bar with soft blur, rounded pill shape,
 * subtle indicator on active tab. Premium streaming-app feel
 * without copying any specific app's layout or feature set.
 *
 * NAVIGATION RULE (per spec):
 *   Never include Home, Live, Movies, Shows, Library, Shorts,
 *   Streaming, Channels, or Anime — those belong to other apps.
 *   CineLog has exactly four primary destinations.
 */
export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = () => location.pathname;

  const go = (href: string) => navigate(href);

  return (
    <nav
      class="fixed bottom-0 left-0 flex w-full cinelog-bottom-nav glass-nav"
      style={{
        height: "var(--nav-total-height)",
        "padding-bottom": "var(--nav-safe-area)",
        "z-index": 40,
      }}
      aria-label="Primary navigation"
    >
      <NavButton
        icon="explore"
        label="Discover"
        active={path() === "/" || path() === "/discover"}
        onClick={() => go("/discover")}
      />
      <NavButton
        icon="bookmark"
        label="Watchlist"
        active={path() === "/watchlist"}
        onClick={() => go("/watchlist")}
      />
      <NavButton
        icon="collection"
        label="Collections"
        active={path() === "/collections" || path().startsWith("/collections/")}
        onClick={() => go("/collections")}
      />
      <NavButton
        icon="person"
        label="Profile"
        active={
          path() === "/profile" ||
          path().startsWith("/profile/")
        }
        onClick={() => go("/profile")}
      />
    </nav>
  );
}
