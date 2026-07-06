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

  const go = (view: "dashboard" | "watchlist" | "search" | "upcoming", href: string) => {
    setView(view);
    navigate(href);
  };

  // Search and Upcoming routes don't exist yet (Phase 2). Surface this to
  // the user instead of letting the button appear dead.
  const comingSoon = (label: string) =>
    showToast(`${label} is coming in Phase 2`, "info", 2000);

  return (
    <nav class="fixed bottom-0 left-0 flex h-16 w-full border-t border-zinc-800 bg-black">
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
        icon="search"
        label="Search"
        active={false}
        onClick={() => comingSoon("Search")}
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
