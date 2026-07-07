// src/features/watchlist/components/VaultHeader.tsx
import { Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import Icon from "~/shared/ui/Icon";

interface VaultHeaderProps {
  viewMode: () => "grid" | "timeline";
  setViewMode: (mode: "grid" | "timeline") => void;
  activeFilterCount: () => number;
  onFilterClick: () => void;
}

/**
 * Premium Vault header — title + collections link + view toggle + filter button.
 *
 * Layout: [VAULT title] ........ [Collections] [view toggle] [filter button]
 *
 * The Collections button navigates to /collections — the dedicated
 * Collections page. It's not a bottom nav tab; it's a sibling of the Vault.
 */
export default function VaultHeader(props: VaultHeaderProps) {
  const navigate = useNavigate();

  return (
    <div class="flex justify-between items-center mb-4">
      <h2 class="type-page-title text-white">VAULT</h2>

      <div class="flex items-center gap-3">
        {/* Collections link */}
        <button
          onClick={() => navigate("/collections")}
          class="filter-button"
          data-active={false}
          aria-label="Open Collections"
        >
          <Icon name="collections_bookmark" style="font-size: 14px" aria-hidden="true" />
          <span class="hidden sm:inline">Collections</span>
        </button>

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
          class="filter-button"
          data-active={props.activeFilterCount() > 0}
          aria-label={`Filter vault${props.activeFilterCount() > 0 ? ` — ${props.activeFilterCount()} active` : ""}`}
          aria-pressed={props.activeFilterCount() > 0}
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
