import { useNavigate, useLocation } from "@solidjs/router";
import NavButton from "./NavButton";
import { useAppState } from "~/shared/hooks/useAppState";

/**
 * BottomNavigation — primary navigation bar fixed to the viewport bottom.
 *
 * Polished: uses design tokens (--tier-1, --hairline) for consistency
 * with the rest of the app, adds a subtle top-edge hairline glow, and
 * keeps the safe-area-aware padding so the bar never sits under the
 * iOS home indicator.
 *
 * The bar is opaque (not glass) so content scrolling underneath never
 * bleeds through — this matches Letterboxd / Trakt / TV Time, which all
 * use solid bottom bars for thumb-zone stability.
 */
export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setView } = useAppState();

  // Active state is derived from the current URL so the highlight matches the
  // page the user is actually on, regardless of how they navigated.
  const path = () => location.pathname;

  const go = (view: "dashboard" | "watchlist" | "discover" | "search", href: string) => {
    setView(view);
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
        // Subtle top-edge accent glow — barely visible, adds depth.
        "box-shadow": "0 -1px 0 0 var(--hairline), 0 -8px 24px -8px rgba(0,0,0,0.6)",
      }}
      aria-label="Primary navigation"
    >
      <NavButton
        icon="dashboard"
        label="Home"
        active={path() === "/"}
        onClick={() => go("dashboard", "/")}
      />

      <NavButton
        icon="visibility"
        label="Vault"
        active={path() === "/watchlist"}
        onClick={() => go("watchlist", "/watchlist")}
      />

      <NavButton
        icon="explore"
        label="Discover"
        active={path() === "/discover"}
        onClick={() => go("discover", "/discover")}
      />

      <NavButton
        icon="search"
        label="Search"
        active={path() === "/search"}
        onClick={() => go("search", "/search")}
      />
    </nav>
  );
}
