// src/features/watchlist/components/WatchlistHeader.tsx
import { For, Show, type Accessor } from "solid-js";
import Icon from "~/shared/ui/Icon";
import VaultHeader from "./VaultHeader";
import VaultSearch from "./VaultSearch";
import QuickFilterTabs from "./QuickFilterTabs";
import type { VaultFilters, WatchlistItem } from "~/shared/types";

/**
 * WatchlistHeader — ZERO-WASTE sticky control center (v2).
 *
 * Layout (single sticky bar):
 *   ┌─────────────────────────────────────────────────────┐
 *   │ [search bar................] [grid|timeline] [filter] │  ← single flex-row
 *   │ [All 47] [Watching 5] [Planned 12] [Completed 27]... │  ← status chips
 *   │ [active filter chips if any]                          │
 *   └─────────────────────────────────────────────────────┘
 *
 * Changes from v1:
 *   - The large "WATCHLIST" text heading has been DELETED.
 *   - Search bar + view toggle + filter button are in a SINGLE
 *     horizontal flex-row (not stacked vertically).
 *   - Status chips are immediately below the search row.
 *   - When a specific status chip is active (not "all"), the sections
 *     hook collapses to a flat grid — no "ALL TITLES" fallback header.
 */
export interface WatchlistHeaderProps {
  viewMode: Accessor<"grid" | "timeline">;
  setViewMode: (v: "grid" | "timeline") => void;
  activeFilterCount: Accessor<number>;
  onFilterClick: () => void;
  searchInput: Accessor<string>;
  onSearchInput: (v: string) => void;
  onClearAll: () => void;
  activeStatusTab: Accessor<string>;
  onSelectStatusTab: (status: string) => void;
  watchlist: Accessor<WatchlistItem[]>;
  chips: Accessor<{ label: string; key: string }[]>;
  onClearFilter: (key: string) => void;
  filters: Accessor<VaultFilters>;
  setFilters: (v: VaultFilters) => void;
}

export default function WatchlistHeader(props: WatchlistHeaderProps) {
  return (
    <div
      class="sticky top-0 z-40 pt-4 pb-2 -mx-4 sm:-mx-5 px-4 sm:px-5 mb-3 watchlist-header-glass"
    >
      {/* SINGLE horizontal row: search bar + view toggle + filter button */}
      <div class="flex flex-row items-center gap-2 w-full">
        <div class="flex-1 min-w-0">
          <VaultSearch
            value={props.searchInput}
            onInput={props.onSearchInput}
            hasActiveFilters={() => props.activeFilterCount() > 0 || props.activeStatusTab() !== "all"}
            onClearAll={props.onClearAll}
          />
        </div>
        <VaultHeader
          viewMode={props.viewMode}
          setViewMode={props.setViewMode}
          activeFilterCount={props.activeFilterCount}
          onFilterClick={props.onFilterClick}
        />
      </div>

      {/* Status chips — horizontally scrollable, immediately below the search row */}
      <Show when={props.viewMode() === "grid"}>
        <div style={{ "margin-top": "0.625rem" }}>
          <QuickFilterTabs
            active={props.activeStatusTab}
            onSelect={(status) => {
              props.onSelectStatusTab(status);
              if (status === "all") {
                props.setFilters({ ...props.filters(), status: "all" });
              } else {
                props.setFilters({ ...props.filters(), status });
              }
            }}
            watchlist={props.watchlist}
          />
        </div>
      </Show>

      {/* Active filter chips */}
      <Show when={props.chips().length > 0}>
        <div class="flex gap-2 flex-wrap mt-2">
          <For each={props.chips()}>
            {(chip) => (
              <button
                onClick={() => props.onClearFilter(chip.key)}
                class="filter-chip focus-ring"
                aria-label={`Remove filter: ${chip.label}`}
              >
                {chip.label}
                <Icon name="close" style={{"font-size":"12px"}} aria-hidden="true" />
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
