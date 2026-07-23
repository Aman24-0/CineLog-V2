import { useNavigate, useLocation } from "@solidjs/router";
import NavButton from "./NavButton";

/**
 * BottomNavigation — Dulo.tv-inspired 6-tab primary nav.
 *
 * Tabs: Home · Discover · Movies · Shows · Watchlist · Collections
 * Matches the Dulo.tv layout from screenshots: house, radio/live,
 * film-reel, monitor, star, bookmark icons in a row.
 */
export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = () => location.pathname;

  const go = (href: string) => navigate(href);

  return (
    <nav
      class="fixed bottom-0 left-0 flex w-full dulo-bottom-nav"
      style={{
        height: "var(--nav-total-height)",
        "padding-bottom": "var(--nav-safe-area)",
        "z-index": 40,
      }}
      aria-label="Primary navigation"
    >
      <NavButton
        icon="home"
        label="Home"
        active={path() === "/" || path() === "/discover"}
        onClick={() => go("/discover")}
      />
      <NavButton
        icon="live_tv"
        label="Live"
        active={false}
        disabled={true}
        onClick={() => {}}
      />
      <NavButton
        icon="movie"
        label="Movies"
        active={path() === "/watchlist" && false /* future /movies */}
        onClick={() => go("/watchlist")}
      />
      <NavButton
        icon="tv"
        label="Shows"
        active={false}
        disabled={false}
        onClick={() => go("/watchlist")}
      />
      <NavButton
        icon="star"
        label="Watchlist"
        active={path() === "/watchlist"}
        onClick={() => go("/watchlist")}
      />
      <NavButton
        icon="bookmark"
        label="Library"
        active={path() === "/collections" || path().startsWith("/collections/")}
        onClick={() => go("/collections")}
      />
    </nav>
  );
}
