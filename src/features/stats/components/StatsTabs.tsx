// src/features/stats/components/StatsTabs.tsx
//
// StatsTabs — the segmented tab bar that switches between the six
// sections of the Statistics page:
//
//   Activity · Genres · Ratings · Decades · People · Trends
//
// The active tab is persisted to localStorage so a user who navigates
// away and back lands on the same view. The tab list uses the shared
// GlassTabs component (pill variant) for consistency with the rest of
// the app.

import { createSignal, onMount, type Component, type Accessor } from "solid-js";
import { GlassTabs, type GlassTabItem } from "~/shared/ui/glass";

export type StatsTab =
  "activity" | "genres" | "ratings" | "decades" | "people" | "trends";

const STORAGE_KEY = "cinelog:stats:activeTab";

const TAB_ITEMS: GlassTabItem<StatsTab>[] = [
  { value: "activity", label: "Activity", icon: "calendar_month" },
  { value: "genres", label: "Genres", icon: "palette" },
  { value: "ratings", label: "Ratings", icon: "star" },
  { value: "decades", label: "Decades", icon: "history" },
  { value: "people", label: "People", icon: "groups" },
  { value: "trends", label: "Trends", icon: "trending_up" }
];

interface StatsTabsProps {
  active: Accessor<StatsTab>;
  onChange: (tab: StatsTab) => void;
}

const StatsTabs: Component<StatsTabsProps> = (props) => {
  return (
    <div class="stats-tabs-wrap">
      <GlassTabs
        items={TAB_ITEMS}
        value={props.active()}
        onChange={(v) => props.onChange(v)}
        variant="pill"
        size="compact"
        fullWidth
        aria-label="Statistics sections"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Convenience hook — keeps the active tab in sync with localStorage.
// Exported so StatisticsPage can own the signal without re-implementing
// the persistence logic.
// ---------------------------------------------------------------------------

export function usePersistentStatsTab(
  defaultTab: StatsTab = "activity"
): [Accessor<StatsTab>, (tab: StatsTab) => void] {
  const [tab, setTab] = createSignal<StatsTab>(defaultTab);

  onMount(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && TAB_ITEMS.some((t) => t.value === stored)) {
        setTab(stored as StatsTab);
      }
    } catch {
      // localStorage may be unavailable (private mode) — ignore.
    }
  });

  const setAndPersist = (next: StatsTab) => {
    setTab(next);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // ignore
    }
  };

  return [tab, setAndPersist];
}

export default StatsTabs;
