// src/features/watchlist/components/WatchlistHeader.tsx
import { For, Show, type Accessor } from "solid-js";
import Icon from "~/shared/ui/Icon";
import VaultHeader from "./VaultHeader";
import VaultSearch from "./VaultSearch";
import QuickFilterTabs from "./QuickFilterTabs";
import type { VaultFilters, WatchlistItem } from "~/shared/types";

/**
 * WatchlistHeader — the sticky top section of the Vault page.
 *
 * Composes:
 *   - VaultHeader (brand + view-mode toggle + filter button with badge)
 *   - VaultSearch (debounced search input + clear-all)
 *   - QuickFilterTabs (grid mode only — All / In-Progress / Watching / Planned / Completed)
 *   - Active filter chips (clickable to remove)
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
      class="sticky top-0 z-40 pt-4 pb-3 -mx-5 px-5 mb-4"
      style={{
        background: "rgba(5,6,10,0.88)",
        "backdrop-filter": "blur(24px)",
        "-webkit-backdrop-filter": "blur(24px)",
        "border-bottom": "1px solid var(--hairline)",
      }}
    >
      <VaultHeader
        viewMode={props.viewMode}
        setViewMode={props.setViewMode}
        activeFilterCount={props.activeFilterCount}
        onFilterClick={props.onFilterClick}
      />
      <VaultSearch
        value={props.searchInput}
        onInput={props.onSearchInput}
        hasActiveFilters={() => props.activeFilterCount() > 0 || props.activeStatusTab() !== "all"}
        onClearAll={props.onClearAll}
      />

      {/* Quick-filter tabs (only in grid mode) */}
      <Show when={props.viewMode() === "grid"}>
        <div style={{ "margin-top": "0.75rem" }}>
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
        <div class="flex gap-2 flex-wrap mt-3">
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
