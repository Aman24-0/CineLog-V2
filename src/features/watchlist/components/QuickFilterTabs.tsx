// src/features/watchlist/components/QuickFilterTabs.tsx
import { For, Show, Component, createMemo, startTransition } from "solid-js";
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
 *
 * PERFORMANCE: The status counts are computed in a SINGLE pass over the
 * watchlist via createMemo, not 10 separate .filter() calls (2 per tab
 * × 5 tabs). The memo only re-runs when the watchlist actually changes.
 */
const QuickFilterTabs: Component<QuickFilterTabsProps> = (props) => {
  // Single-pass status count — runs once per watchlist change, not once
  // per tab per render. Previously countFor() called .filter() 10 times
  // (2 per tab × 5 tabs), each iterating the full array.
  const statusCounts = createMemo(() => {
    const list = props.watchlist();
    const counts: Record<string, number> = {
      all: list.length,
      Watching: 0,
      Planned: 0,
      Completed: 0,
      Dropped: 0,
    };
    for (let i = 0; i < list.length; i++) {
      const s = list[i].status;
      if (s === "Planned" || s === "Plan to Watch") counts.Planned++;
      else if (s === "Watching") counts.Watching++;
      else if (s === "Completed") counts.Completed++;
      else if (s === "Dropped") counts.Dropped++;
    }
    return counts;
  });

  const countFor = (value: string): number => statusCounts()[value] ?? 0;

  return (
    <div class="quick-filter-bar" role="tablist" aria-label="Filter watchlist by status">
      <For each={TABS}>
        {(tab) => {
          const count = () => countFor(tab.value);
          return (
            <button
              type="button"
              class="quick-filter-tab focus-ring"
              data-active={props.active() === tab.value}
              onClick={() => {
                startTransition(() => props.onSelect(tab.value));
              }}
              role="tab"
              aria-selected={props.active() === tab.value}
            >
              {tab.label}
              <Show when={count() > 0}>
                <span class="quick-filter-tab-count">{count()}</span>
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
};

export default QuickFilterTabs;
