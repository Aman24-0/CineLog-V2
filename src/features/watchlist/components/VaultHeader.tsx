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
 * Watchlist header — title + view toggle + filter button.
 *
 * PHASE 4 (Glass UI migration):
 *   - Title uses font-display (Bebas Neue) with accent on the leading letter
 *   - View toggle is a glass pill container with stronger blur
 *   - Filter button uses the glass pill aesthetic
 *
 * Navigation restructure (Profile phase):
 *   The "Collections" button has been REMOVED from this header.
 *   Collections is now a primary bottom-navigation destination
 *   (/collections), so a duplicate entry point here would be
 *   redundant. The Watchlist now focuses purely on the user's
 *   titles: Watching, Planned, Completed, Dropped, All.
 *
 * Layout: [WATCHLIST title] ........ [view toggle] [filter button]
 */
export default function VaultHeader(props: VaultHeaderProps) {
  return (
    <div class="flex justify-between items-center mb-4">
      <h2
        class="font-display m-0"
        style={{
          "font-size": "2rem",
          "line-height": "1",
          "letter-spacing": "0.06em",
          color: "var(--text-strong)",
        }}
      >
        WATCH<span style={{ color: "var(--p)" }}>LIST</span>
      </h2>

      <div class="flex items-center gap-2">
        {/* View mode toggle */}
        <div class="view-toggle" role="group" aria-label="View mode">
          <button
            onClick={() => props.setViewMode("grid")}
            class="view-toggle-btn focus-ring"
            data-active={props.viewMode() === "grid"}
            aria-label="Grid view"
            aria-pressed={props.viewMode() === "grid"}
          >
            <Icon name="grid_view" style={{ "font-size": "16px" }} aria-hidden="true" />
          </button>
          <button
            onClick={() => props.setViewMode("timeline")}
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
          aria-label={`Filter watchlist${props.activeFilterCount() > 0 ? ` — ${props.activeFilterCount()} active` : ""}`}
          aria-pressed={props.activeFilterCount() > 0}
        >
          <Icon name="tune" style={{ "font-size": "14px" }} aria-hidden="true" />
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
