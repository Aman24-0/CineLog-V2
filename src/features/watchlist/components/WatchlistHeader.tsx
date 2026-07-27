// src/features/watchlist/components/WatchlistHeader.tsx
import { For, Show, createSignal, type Accessor } from "solid-js";
import Icon from "~/shared/ui/Icon";
import VaultHeader from "./VaultHeader";
import QuickFilterTabs from "./QuickFilterTabs";
import type { VaultFilters, WatchlistItem } from "~/shared/types";

/**
 * WatchlistHeader — ZERO-WASTE sticky control center (v3).
 *
 * EXPANDABLE SEARCH (v3):
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Collapsed: [grid|timeline] [filter] [🔍 search btn] │  ← default
 *   │ Expanded:  [← back] [search input............] [clr]│  ← full width
 *   │ [All 47] [Watching 5] [Planned 12] [Completed 27]...│  ← status chips
 *   │ [active filter chips if any]                          │
 *   └─────────────────────────────────────────────────────┘
 *
 * The collapsed state shows the View Toggle + Filter Button + a circular
 * "Search" icon button inline. Tapping the Search button expands the
 * input to take the ENTIRE header width (`w-full`), hiding the View
 * Toggle and Filter Button. The expanded input has a "Back" arrow (←)
 * on the left to collapse the search, and a "Clear" button on the right.
 *
 * Because the expanded input takes full width, it uses `pl-10 pr-16`
 * padding so text NEVER overlaps the back arrow (left) or the Clear
 * button (right).
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
  // Collapsed ↔ Expanded search state. When expanded, the search input
  // takes the full header width and hides the View Toggle + Filter Button.
  const [isSearchExpanded, setIsSearchExpanded] = createSignal(false);

  /** Collapse the search — also clears the query so the user returns to
   *  the unfiltered view. */
  const collapseSearch = () => {
    setIsSearchExpanded(false);
  };

  /** Whether the Clear button should be visible — only when there's
   *  text in the search input OR there are active filters/status tab. */
  const showClear = () =>
    props.searchInput().length > 0 ||
    props.activeFilterCount() > 0 ||
    props.activeStatusTab() !== "all";

  return (
    <div
      class="sticky top-0 z-40 pt-4 pb-2 -mx-4 sm:-mx-5 px-4 sm:px-5 mb-3 watchlist-header-glass"
    >
      {/* SINGLE horizontal row — contents depend on search-expanded state */}
      <div class="flex flex-row items-center gap-2 w-full">
        {/* ── COLLAPSED: View Toggle + Filter Button + circular Search icon ── */}
        <Show when={!isSearchExpanded()}>
          <VaultHeader
            viewMode={props.viewMode}
            setViewMode={props.setViewMode}
            activeFilterCount={props.activeFilterCount}
            onFilterClick={props.onFilterClick}
          />
          {/* Circular "Search" icon button — expands the search input */}
          <button
            type="button"
            onClick={() => setIsSearchExpanded(true)}
            class="filter-button focus-ring flex items-center justify-center shrink-0"
            style={{
              width: "40px",
              height: "40px",
              "border-radius": "var(--radius-pill)",
            }}
            aria-label="Search watchlist"
            aria-expanded="false"
          >
            <Icon name="search" style={{ "font-size": "18px" }} aria-hidden="true" />
          </button>
          <div class="flex-1" />
        </Show>

        {/* ── EXPANDED: full-width Search Input with Back arrow + Clear ── */}
        <Show when={isSearchExpanded()}>
          <div class="w-full relative flex items-center">
            {/* Back arrow (←) — left side, collapses the search */}
            <button
              type="button"
              onClick={collapseSearch}
              class="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center z-10"
              style={{
                width: "40px",
                height: "40px",
                "border-radius": "var(--radius-pill)",
                background: "transparent",
                border: "none",
                color: "var(--text-soft)",
                cursor: "pointer",
              }}
              aria-label="Close search"
            >
              <Icon name="arrow_back" style={{ "font-size": "20px" }} aria-hidden="true" />
            </button>

            {/* Search input — pl-10 (back arrow) + pr-16 (Clear button) so
                text NEVER overlaps the icons. */}
            <input
              type="search"
              value={props.searchInput()}
              onInput={(e) => props.onSearchInput(e.currentTarget.value)}
              placeholder="Search title, cast, director, genre, platform, year..."
              autofocus
              autocomplete="off"
              spellcheck={false}
              class="search-premium w-full"
              style={{
                "padding-left": "2.5rem",
                "padding-right": "4rem",
                "font-family": "'Outfit', sans-serif",
                "font-size": "0.875rem",
                "font-weight": 600,
                color: "var(--text-strong)",
                "border-radius": "var(--radius-pill)",
              }}
              aria-label="Search watchlist"
            />

            {/* Clear button — right side. Visible when there's text or
                active filters. Clears search + filters via onClearAll. */}
            <Show when={showClear()}>
              <button
                type="button"
                onClick={() => props.onClearAll()}
                class="absolute right-2 top-1/2 -translate-y-1/2 type-meta shrink-0 active:scale-95 transition-all focus-ring"
                style={{
                  background: "rgba(255,45,85,0.12)",
                  border: "1px solid rgba(255,45,85,0.35)",
                  color: "#ff2d55",
                  padding: "0.375rem 0.75rem",
                  "border-radius": "var(--radius-pill)",
                  "font-size": "0.5625rem",
                  "font-weight": 700,
                  "letter-spacing": "0.12em",
                  "text-transform": "uppercase",
                  cursor: "pointer",
                  "z-index": "1",
                }}
                aria-label="Clear search and filters"
              >
                Clear
              </button>
            </Show>
          </div>
        </Show>
      </div>

      {/* Status chips — horizontally scrollable, immediately below the search row.
          Hidden in timeline mode (timeline forces Completed + watch_desc). */}
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

      {/* Active filter chips — small pills below the status chips.
          Highly visible: gold-tinted bg + white text (see watchlist.css
          `.filter-chip` rule). */}
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
