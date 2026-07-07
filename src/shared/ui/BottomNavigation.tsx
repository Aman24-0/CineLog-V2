import { useNavigate, useLocation } from "@solidjs/router";
import NavButton from "./NavButton";
import { useAppState } from "~/shared/hooks/useAppState";

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
      class="fixed bottom-0 left-0 flex w-full border-t border-zinc-800 bg-black"
      style={{
        height: "var(--nav-total-height)",
        "padding-bottom": "var(--nav-safe-area)",
        "z-index": 40
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
