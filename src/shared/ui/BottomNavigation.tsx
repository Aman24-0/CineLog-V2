import { useNavigate, useLocation } from "@solidjs/router";
import NavButton from "./NavButton";
import { useAppState } from "~/shared/hooks/useAppState";
import { useToast } from "~/shared/hooks/useToast";

export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setView } = useAppState();
  const { showToast } = useToast();

  // Active state is derived from the current URL so the highlight matches the
  // page the user is actually on, regardless of how they navigated.
  const path = () => location.pathname;

  const go = (view: "dashboard" | "watchlist" | "discover" | "upcoming", href: string) => {
    setView(view);
    navigate(href);
  };

  // Upcoming route doesn't exist yet (future phase). Surface this to
  // the user instead of letting the button appear dead.
  const comingSoon = (label: string) =>
    showToast(`${label} is coming soon`, "info", 2000);

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
        icon="calendar_month"
        label="Upcoming"
        active={false}
        onClick={() => comingSoon("Upcoming")}
      />
    </nav>
  );
}
