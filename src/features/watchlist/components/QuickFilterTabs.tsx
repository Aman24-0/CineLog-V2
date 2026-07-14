// src/features/watchlist/components/QuickFilterTabs.tsx
import { For, Show, Component } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

interface QuickFilterTabsProps {
  active: () => string;
  onSelect: (status: string) => void;
  watchlist: () => WatchlistItem[];
}

interface TabDef {
  label: string;
  value: string;
  icon: string;
}

const TABS: TabDef[] = [
  { label: "All", value: "all", icon: "video_library" },
  { label: "Watching", value: "Watching", icon: "visibility" },
  { label: "Planned", value: "Planned", icon: "bookmark" },
  { label: "Completed", value: "Completed", icon: "task_alt" },
  { label: "Dropped", value: "Dropped", icon: "block" }
];

/**
 * QuickFilterTabs — inline status filter pills.
 *
 * Replaces the filter drawer for the most common filter action (status).
 * One tap filters the vault instantly — no modal, no apply step.
 *
 * The tabs show live counts derived from the watchlist so the user sees
 * their collection's status distribution at a glance:
 *
 *   [All 47] [Watching 5] [Planned 12] [Completed 27] [Dropped 3]
 *
 * The active tab is highlighted with the accent color. The tabs are
 * horizontally scrollable on mobile (no wrapping) to preserve the
 * one-line layout.
 *
 * "In Progress" was removed (it was a virtual status that duplicated
 * "Watching" — both filtered for status === "Watching" with active
 * progress). Replaced with "Dropped" so the user can filter titles they
 * abandoned. The detail modal's Dropped button feeds this filter.
 */
const QuickFilterTabs: Component<QuickFilterTabsProps> = (props) => {
  const countFor = (value: string): number => {
    const list = props.watchlist();
    if (value === "all") return list.length;
    if (value === "Planned") {
      return list.filter((m) => m.status === "Planned" || m.status === "Plan to Watch").length;
    }
    return list.filter((m) => m.status === value).length;
  };

  return (
    <div class="quick-filter-bar" role="tablist" aria-label="Filter watchlist by status">
      <For each={TABS}>
        {(tab) => (
          <button
            type="button"
            class="quick-filter-tab focus-ring"
            data-active={props.active() === tab.value}
            onClick={() => props.onSelect(tab.value)}
            role="tab"
            aria-selected={props.active() === tab.value}
            aria-label={`${tab.label} — ${countFor(tab.value)} titles`}
          >
            {tab.label}
            <Show when={countFor(tab.value) > 0}>
              <span class="quick-filter-tab-count">{countFor(tab.value)}</span>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
};

export default QuickFilterTabs;
