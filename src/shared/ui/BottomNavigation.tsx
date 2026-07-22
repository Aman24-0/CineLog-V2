import { useNavigate, useLocation } from "@solidjs/router";
import NavButton from "./NavButton";

/**
 * BottomNavigation — floating glass pill bar (premium OTT style).
 *
 * Three destinations (unchanged): Discover, Watchlist, Collections.
 * Profile is accessed from the AppHeader avatar (unchanged).
 *
 * Visual-only redesign — no logic, routes, or ARIA changed.
 * The bar floats above the page with a 32px radius, glass blur,
 * and soft shadow. The active item sits inside a warm bronze pill.
 */
export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
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
      <div
        class="flex pointer-events-auto"
        style={{
          "margin-bottom": "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          "margin-left": "20px",
          "margin-right": "20px",
          width: "calc(100% - 40px)",
          "max-width": "420px",
          height: "60px",
          padding: "8px",
          "border-radius": "32px",
          background: "rgba(19,19,19,0.85)",
          "backdrop-filter": "blur(32px) saturate(160%)",
          "-webkit-backdrop-filter": "blur(32px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.06)",
          "box-shadow": "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
          gap: "4px",
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
