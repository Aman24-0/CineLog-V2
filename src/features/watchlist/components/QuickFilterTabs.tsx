// src/features/watchlist/components/QuickFilterTabs.tsx
import { For, Component } from "solid-js";

interface QuickFilterTabsProps {
  active: () => string;
  onSelect: (status: string) => void;
}

interface TabDef {
  label: string;
  value: string;
  icon: string;
}

export const LIBRARY_STATUS_TABS: TabDef[] = [
  { label: "Watching", value: "Watching", icon: "visibility" },
  { label: "Planned", value: "Planned", icon: "bookmark" },
  { label: "Completed", value: "Completed", icon: "task_alt" },
  { label: "Dropped", value: "Dropped", icon: "block" },
  { label: "Re-watched", value: "Re-watched", icon: "replay" }
];

/**
 * QuickFilterTabs — five inline status-toggle buttons.
 *
 * The base Library state is represented internally by the existing `all`
 * filter value, but it has no visible control. Each visible status is a
 * mutually exclusive icon-only toggle; selecting the active status again
 * returns to the base Library state.
 *
 * The active state is conveyed by the existing glass/accent treatment,
 * `aria-pressed`, and the accessible label/title. The fixed five-column
 * layout keeps every status visible without horizontal scrolling.
 */
const QuickFilterTabs: Component<QuickFilterTabsProps> = (props) => {
  const TABS = LIBRARY_STATUS_TABS;

  return (
    <div
      class="quick-filter-bar"
      role="group"
      aria-label="Library status filters"
    >
      <For each={TABS}>
        {(tab) => (
          <button
            type="button"
            class="quick-filter-tab focus-ring"
            data-active={props.active() === tab.value}
            data-value={tab.value}
            onClick={() => props.onSelect(tab.value)}
            aria-label={`Filter: ${tab.label}`}
            aria-pressed={props.active() === tab.value}
            title={`Filter: ${tab.label}`}
          >
            <span
              class="material-symbols-outlined quick-filter-tab-icon"
              aria-hidden="true"
            >
              {tab.icon}
            </span>
            <span class="quick-filter-tab-label sr-only">{tab.label}</span>
          </button>
        )}
      </For>
    </div>
  );
};

export default QuickFilterTabs;
