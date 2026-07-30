// src/features/profile/hooks/useProfileTabs.ts
//
// useProfileTabs — tiny state hook for the Profile page's tab strip.
//
// The Profile page has four tabs: Activity, Favorites, Lists, Achievements.
// This hook centralises the active-tab signal + optional localStorage
// persistence so a page refresh keeps the user on the tab they were
// viewing. The hook is SSR-safe (localStorage is only read on the client).

import { createSignal, onMount, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";

export type ProfileTab = "activity" | "favorites" | "lists" | "achievements";

export const PROFILE_TABS: { id: ProfileTab; label: string; icon: string }[] = [
  { id: "activity", label: "Activity", icon: "timeline" },
  { id: "favorites", label: "Favorites", icon: "favorite" },
  { id: "lists", label: "Lists", icon: "video_library" },
  { id: "achievements", label: "Achievements", icon: "military_tech" }
];

const STORAGE_KEY = "cinelog:profile:activeTab";

function readStoredTab(): ProfileTab | null {
  if (isServer) return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (
      v === "activity" ||
      v === "favorites" ||
      v === "lists" ||
      v === "achievements"
    ) {
      return v;
    }
  } catch {
    // localStorage may be disabled (private mode, etc.) — silently ignore.
  }
  return null;
}

function writeStoredTab(tab: ProfileTab) {
  if (isServer) return;
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}

/**
 * useProfileTabs — manage the active tab on the Profile page.
 *
 * Returns:
 *   • activeTab()  — the currently-selected tab
 *   • setActiveTab(tab) — switch tabs (also persists to localStorage)
 *
 * On mount, restores the last-used tab from localStorage (default
 * "activity" if no preference is stored).
 */
export function useProfileTabs(): {
  activeTab: Accessor<ProfileTab>;
  setActiveTab: (tab: ProfileTab) => void;
} {
  const [activeTab, setActiveTabSignal] = createSignal<ProfileTab>("activity");

  // Restore last-used tab on mount (client only).
  onMount(() => {
    const stored = readStoredTab();
    if (stored) setActiveTabSignal(stored);
  });

  // Persist on change.
  const setActiveTab = (tab: ProfileTab) => {
    setActiveTabSignal(tab);
    writeStoredTab(tab);
  };

  return { activeTab, setActiveTab };
}
