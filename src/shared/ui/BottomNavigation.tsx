import NavButton from "./NavButton";
import { useAppState } from "~/shared/hooks/useAppState";

export default function BottomNavigation() {
  const { view, setView } = useAppState();

  return (
    <nav class="fixed bottom-0 left-0 flex h-16 w-full border-t border-zinc-800 bg-black">
      <NavButton
        icon="dashboard"
        label="Home"
        active={view() === "dashboard"}
        onClick={() => setView("dashboard")}
      />

      <NavButton
        icon="visibility"
        label="Vault"
        active={view() === "watchlist"}
        onClick={() => setView("watchlist")}
      />

      <NavButton
        icon="search"
        label="Search"
        active={view() === "search"}
        onClick={() => setView("search")}
      />

      <NavButton
        icon="calendar_month"
        label="Upcoming"
        active={view() === "upcoming"}
        onClick={() => setView("upcoming")}
      />
    </nav>
  );
}
