// src/features/stats/components/DateRangeSelector.tsx
import { For, Show, type Component, type Accessor } from "solid-js";
import type { StatsDateRange } from "../hooks/useStatsData";

/**
 * DateRangeSelector — Phase 6.2 Task 3a
 *
 * A horizontal chip-style selector for the Stats page's date-range
 * filter. Three options:
 *
 *   - "All Time"      → every title in the vault (default)
 *   - "This Year"     → titles added since Jan 1 of the current year
 *   - "Last 6 Months" → titles added in the rolling 6-month window
 *
 * The selected chip is highlighted with the accent color. Tapping a
 * chip calls `onChange` with the new range, which re-derives all the
 * stats reactively (see useStatsData).
 *
 * LAYOUT:
 *   [All Time] [This Year] [Last 6 Months]
 *
 * The chips wrap on narrow screens. The container is right-aligned
 * within the Stats header so it sits next to the page title on desktop
 * and stacks below on mobile.
 */
export interface DateRangeSelectorProps {
  /** Currently-selected range. */
  value: Accessor<StatsDateRange>;
  /** Called when the user taps a chip. */
  onChange: (r: StatsDateRange) => void;
  /** Optional: total titles in the vault (pre-filter). Shown as a
   *  small hint below the chips when provided. */
  totalTitlesAllTime?: Accessor<number>;
  /** Optional: count of titles matching the current filter. Shown
   *  alongside the total when both are provided. */
  filteredCount?: Accessor<number>;
}

interface Option {
  label: string;
  value: StatsDateRange;
  hint: string;
}

const OPTIONS: Option[] = [
  { label: "All Time", value: "all", hint: "Every title in your vault" },
  { label: "This Year", value: "year", hint: "Added since Jan 1" },
  { label: "Last 6 Months", value: "6months", hint: "Rolling 6-month window" }
];

const DateRangeSelector: Component<DateRangeSelectorProps> = (props) => {
  return (
    <div
      class="stats-date-range-selector"
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--sp-1)",
        "margin-bottom": "var(--sp-3)"
      }}
    >
      <div
        role="radiogroup"
        aria-label="Statistics date range"
        style={{
          display: "inline-flex",
          gap: "var(--sp-1)",
          padding: "3px",
          "border-radius": "9999px",
          background: "var(--glass-bg-strong)",
          border: "1px solid var(--hairline)",
          "align-self": "flex-start"
        }}
      >
        <For each={OPTIONS}>
          {(opt) => {
            const isActive = () => props.value() === opt.value;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={isActive()}
                onClick={() => props.onChange(opt.value)}
                title={opt.hint}
                style={{
                  "font-size": "0.6875rem",
                  "font-weight": isActive() ? 800 : 600,
                  padding: "5px 12px",
                  "border-radius": "9999px",
                  border: "none",
                  cursor: "pointer",
                  "white-space": "nowrap",
                  color: isActive() ? "var(--active-text)" : "var(--text-soft)",
                  background: isActive() ? "var(--p)" : "transparent",
                  transition:
                    "background 150ms ease-out, color 150ms ease-out"
                }}
              >
                {opt.label}
              </button>
            );
          }}
        </For>
      </div>
      {/* Count hint — shows "X of Y titles" when both counts are provided
          and the filter is active. Hidden when the filter is "all" (the
          counts would always be equal, so the hint is redundant). */}
      <Show
        when={
          props.value() !== "all" &&
          props.totalTitlesAllTime &&
          props.filteredCount
        }
      >
        <span
          class="type-meta"
          style={{
            "font-size": "0.6875rem",
            color: "var(--text-soft)"
          }}
          aria-live="polite"
        >
          {props.filteredCount!()} of {props.totalTitlesAllTime!()} titles
        </span>
      </Show>
    </div>
  );
};

export default DateRangeSelector;
