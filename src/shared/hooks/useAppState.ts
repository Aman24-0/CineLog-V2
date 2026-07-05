import { createSignal } from "solid-js";

export type AppView =
  | "dashboard"
  | "watchlist"
  | "search"
  | "franchises"
  | "upcoming"
  | "analytics"
  | "settings"
  | "sync";

const [view, setView] = createSignal<AppView>("dashboard");

export function useAppState() {
  return {
    view,
    setView
  };
}
