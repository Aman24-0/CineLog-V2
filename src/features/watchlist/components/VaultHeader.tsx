// src/features/watchlist/components/VaultHeader.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";

interface VaultHeaderProps {
  viewMode: () => "grid" | "timeline";
  setViewMode: (mode: "grid" | "timeline") => void;
  activeFilterCount: () => number;
  onFilterClick: () => void;
}

/**
 * Premium Vault header — title + view toggle + filter button.
 *
 * Layout: [VAULT title] ........ [view toggle] [filter button]
 *
 * - View toggle uses .view-toggle / .view-toggle-btn CSS for clear active state
 * - Filter button shows a .filter-count-badge when filters are active
 * - Sticky-safe: the parent sticky container handles the blur background
 */
export default function VaultHeader(props: VaultHeaderProps) {
  return (
    <div class="flex justify-between items-center mb-4">
      <h2 class="type-page-title text-white">VAULT</h2>

      <div class="flex items-center gap-3">
        {/* View mode toggle */}
        <div class="view-toggle" role="group" aria-label="View mode">
          <button
            onClick={() => props.setViewMode("grid")}
            class="view-toggle-btn"
            data-active={props.viewMode() === "grid"}
            aria-label="Grid view"
            aria-pressed={props.viewMode() === "grid"}
          >
            <Icon name="grid_view" style="font-size: 14px" aria-hidden="true" />
          </button>
          <button
            onClick={() => props.setViewMode("timeline")}
            class="view-toggle-btn"
            data-active={props.viewMode() === "timeline"}
            aria-label="Timeline view"
            aria-pressed={props.viewMode() === "timeline"}
          >
            <Icon name="timeline" style="font-size: 14px" aria-hidden="true" />
          </button>
        </div>

        {/* Filter button */}
        <button
          onClick={() => props.onFilterClick()}
          class="flex items-center gap-2 px-4 py-2 rounded-full type-meta border active:scale-95 transition-all"
          style={{
            background: "var(--tier-1)",
            "border-color": "var(--hairline-2)",
            color: "var(--text-soft)",
            "font-size": "0.625rem",
            "font-weight": 700,
            "letter-spacing": "0.12em",
            "text-transform": "uppercase"
          }}
          aria-label={`Filter vault${props.activeFilterCount() > 0 ? ` — ${props.activeFilterCount()} active` : ""}`}
        >
          <Icon name="tune" style="font-size: 14px" aria-hidden="true" />
          <span class="hidden sm:inline">Filter</span>
          <Show when={props.activeFilterCount() > 0}>
            <span class="filter-count-badge" aria-hidden="true">
              {props.activeFilterCount()}
            </span>
          </Show>
        </button>
      </div>
    </div>
  );
}
