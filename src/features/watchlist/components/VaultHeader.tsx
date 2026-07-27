// src/features/watchlist/components/VaultHeader.tsx
import { Show, batch } from "solid-js";
import Icon from "~/shared/ui/Icon";

interface VaultHeaderProps {
  viewMode: () => "grid" | "timeline";
  setViewMode: (mode: "grid" | "timeline") => void;
  activeFilterCount: () => number;
  onFilterClick: () => void;
}

/**
 * VaultHeader — ZERO-WASTE compact control row (v2).
 *
 * The large "WATCHLIST" text heading has been DELETED. The search bar,
 * view toggle, and filter button are now combined into a SINGLE
 * horizontal flex row by the parent (WatchlistHeader), which places
 * them inline with the search input.
 *
 * This component now renders ONLY the view toggle + filter button
 * (the search bar is rendered separately by the parent and they share
 * a single flex-row container).
 *
 * Layout: [search bar........] [view toggle] [filter button]
 */
export default function VaultHeader(props: VaultHeaderProps) {
  return (
    <div class="flex items-center gap-2 shrink-0">
      {/* View mode toggle */}
      <div class="view-toggle" role="group" aria-label="View mode">
        <button
          onClick={() => batch(() => props.setViewMode("grid"))}
          class="view-toggle-btn focus-ring"
          data-active={props.viewMode() === "grid"}
          aria-label="Grid view"
          aria-pressed={props.viewMode() === "grid"}
        >
          <Icon name="grid_view" style={{ "font-size": "16px" }} aria-hidden="true" />
        </button>
        <button
          onClick={() => batch(() => props.setViewMode("timeline"))}
          class="view-toggle-btn focus-ring"
          data-active={props.viewMode() === "timeline"}
          aria-label="Timeline view"
          aria-pressed={props.viewMode() === "timeline"}
        >
          <Icon name="timeline" style={{ "font-size": "16px" }} aria-hidden="true" />
        </button>
      </div>

      {/* Filter button */}
      <button
        onClick={() => props.onFilterClick()}
        class="filter-button focus-ring"
        data-active={props.activeFilterCount() > 0}
        aria-label={`Filter${props.activeFilterCount() > 0 ? ` — ${props.activeFilterCount()} active` : ""}`}
        aria-pressed={props.activeFilterCount() > 0}
      >
        <Icon name="tune" style={{ "font-size": "14px" }} aria-hidden="true" />
        <Show when={props.activeFilterCount() > 0}>
          <span class="filter-count-badge" aria-hidden="true">
            {props.activeFilterCount()}
          </span>
        </Show>
      </button>
    </div>
  );
}
