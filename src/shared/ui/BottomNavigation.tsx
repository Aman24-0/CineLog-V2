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
 *   avatar, which navigates to /profile.
 *
 * ── PREMIUM OTT REDESIGN (visual only) ─────────────────────────────
 * The bar is now a FLOATING PILL:
 *   - Centered, rounded 32px, glass blur, dark glass background
 *   - Selected item sits inside a soft pill (handled by NavButton)
 *   - Inactive icons muted; large icon targets
 *   - No top border — floats above the page with a soft diffuse shadow
 *   - Safe-area-aware so it clears the iOS home indicator
 *   - The layout container still occupies var(--nav-total-height) at
 *     the page bottom so the existing page padding-bottom still works.
 *   No logic, routes, or ARIA semantics changed.
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
      class="fixed bottom-0 left-0 flex w-full pointer-events-none"
      style={{
        height: "var(--nav-total-height)",
        "padding-bottom": "var(--nav-safe-area)",
        "z-index": 40,
        "justify-content": "center",
        "align-items": "flex-end",
      }}
      aria-label="Primary navigation"
    >
      {/* Floating pill bar — pointer-events auto on the inner bar only
          so the gap above the bar (between bar and bottom of screen)
          lets content underneath receive taps (e.g. scroll-to-top button). */}
      <div
        class="flex pointer-events-auto"
        style={{
          "margin-bottom": "calc(env(safe-area-inset-bottom, 0px) + 14px)",
          "margin-left": "16px",
          "margin-right": "16px",
          width: "calc(100% - 32px)",
          "max-width": "440px",
          height: "var(--nav-height)",
          "padding": "8px",
          "border-radius": "var(--radius-bottom-nav)",
          background: "var(--glass-bg-strong)",
          "backdrop-filter": "blur(28px) saturate(150%)",
          "-webkit-backdrop-filter": "blur(28px) saturate(150%)",
          border: "1px solid var(--glass-border)",
          "box-shadow": "var(--shadow-floating-nav)",
          "gap": "4px",
        }}
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
      </div>
    </nav>
  );
}
