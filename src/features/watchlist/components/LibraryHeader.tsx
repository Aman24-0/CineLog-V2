import { For, Show, createMemo, batch, type Component, type Accessor } from "solid-js";
import Icon from "~/shared/ui/Icon";
import QuickFilterTabs from "./QuickFilterTabs";
import type { VaultFilters, WatchlistItem } from "~/shared/types";

export interface LibraryHeaderProps {
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

/** The Library’s compact control center. Search is intentionally always open. */
const LibraryHeader: Component<LibraryHeaderProps> = (props) => {
  const totalCount = createMemo(() => props.watchlist().length);
  const showClear = createMemo(
    () =>
      props.searchInput().length > 0 ||
      props.activeFilterCount() > 0 ||
      props.activeStatusTab() !== "all"
  );

  return (
    <div class="library-header-glass sticky top-0 z-40 -mx-4 mb-4 px-4 pb-3 pt-4 sm:-mx-5 sm:px-5">
      <div class="library-header-top">
        <div class="library-header-title-group">
          <p class="type-eyebrow" style={{ color: "var(--p)", margin: 0 }}>
            YOUR LIBRARY
          </p>
          <div class="library-header-title-row">
            <h1 class="type-display library-header-title">Library</h1>
            <span
              class="library-header-count"
              aria-label={`${totalCount()} titles in your library`}
            >
              {totalCount()}
            </span>
          </div>
        </div>

        <div class="library-header-actions">
          <button
            type="button"
            class="filter-button library-filter-button focus-ring"
            onClick={() => props.onFilterClick()}
            data-active={props.activeFilterCount() > 0}
            aria-label={`Open library filters${props.activeFilterCount() > 0 ? ` — ${props.activeFilterCount()} active` : ""}`}
            aria-pressed={props.activeFilterCount() > 0}
          >
            <Icon name="tune" style={{ "font-size": "18px" }} aria-hidden="true" />
            <Show when={props.activeFilterCount() > 0}>
              <span class="filter-count-badge" aria-hidden="true">
                {props.activeFilterCount()}
              </span>
            </Show>
          </button>
          <div class="view-toggle" role="group" aria-label="Library view mode">
            <button
              type="button"
              onClick={() => batch(() => props.setViewMode("grid"))}
              class="view-toggle-btn focus-ring"
              data-active={props.viewMode() === "grid"}
              aria-label="Grid view"
              aria-pressed={props.viewMode() === "grid"}
            >
              <Icon name="grid_view" style={{ "font-size": "16px" }} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => batch(() => props.setViewMode("timeline"))}
              class="view-toggle-btn focus-ring"
              data-active={props.viewMode() === "timeline"}
              aria-label="Timeline view"
              aria-pressed={props.viewMode() === "timeline"}
            >
              <Icon name="timeline" style={{ "font-size": "16px" }} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div class="library-search-row">
        <Icon name="search" style={{ "font-size": "20px" }} aria-hidden="true" />
        <input
          type="search"
          value={props.searchInput()}
          onInput={(event) => props.onSearchInput(event.currentTarget.value)}
          placeholder="Search your library…"
          autocomplete="off"
          spellcheck={false}
          class="library-search-input"
          aria-label="Search your library"
        />
        <Show when={showClear()}>
          <button
            type="button"
            class="library-search-clear focus-ring"
            onClick={() => props.onClearAll()}
            aria-label="Clear library search and filters"
          >
            <Icon name="close" style={{ "font-size": "18px" }} aria-hidden="true" />
          </button>
        </Show>
      </div>

      <div class="library-status-row">
        <QuickFilterTabs
          active={props.activeStatusTab}
          onSelect={(status) => props.onSelectStatusTab(status)}
          watchlist={props.watchlist}
        />
      </div>

      <Show when={props.chips().length > 0}>
        <div class="library-filter-chips" aria-label="Active library filters">
          <For each={props.chips()}>
            {(chip) => (
              <button
                type="button"
                onClick={() => props.onClearFilter(chip.key)}
                class="filter-chip focus-ring"
                aria-label={`Remove filter: ${chip.label}`}
              >
                {chip.label}
                <Icon name="close" style={{ "font-size": "12px" }} aria-hidden="true" />
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default LibraryHeader;
