import { createSignal } from "solid-js";

/**
 * AppView — the set of primary navigation destinations.
 *
 * Updated for the navigation restructure:
 *   • "dashboard" removed — Home/Dashboard page deleted.
 *   • "collections" added — promoted to primary nav.
 *   • "franchises" / "upcoming" / "analytics" / "sync" removed —
 *     these were legacy views that no longer have dedicated pages.
 *
 * The signal is kept for backward compatibility with any consumer that
 * still reads `view()`, but it is no longer the source of truth for
 * navigation — the URL is. BottomNavigation derives active state from
 * `useLocation().pathname`, not from this signal.
 */
export type AppView =
  | "discover"
  | "search"
  | "watchlist"
  | "collections"
  | "profile"
  | "settings";

const [view, setView] = createSignal<AppView>("discover");

export function useAppState() {
  return {
    view,
    setView
  };
}
