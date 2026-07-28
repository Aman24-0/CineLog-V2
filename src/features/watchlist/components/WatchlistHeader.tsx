// src/features/watchlist/components/WatchlistHeader.tsx
import { For, Show, createSignal, batch, type Accessor } from "solid-js";
import Icon from "~/shared/ui/Icon";
import QuickFilterTabs from "./QuickFilterTabs";
import type { VaultFilters, WatchlistItem } from "~/shared/types";

/**
 * WatchlistHeader — three-row sticky control center (v4).
 *
 * LAYOUT RESTRUCTURE (v4):
 *   The previous version clumped all controls in the top-left, leaving
 *   empty black space on the right. The new layout uses THREE full-width
 *   rows so controls span the entire header width:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ MAIN ACTION BAR  (flex justify-between items-center w-full)   │
 *   │   LEFT:  [grid|timeline] [stats count badge]                   │
 *   │   RIGHT: [filter btn] [🔍 search btn]                          │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ TABS ROW  (flex overflow-x-auto hide-scrollbar gap-2 mb-3)    │
 *   │   [All 47] [Watching 5] [Planned 12] [Completed 27] [Dropped 3]│
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ CHIPS ROW  (flex flex-wrap gap-2) — only when filters active  │
 *   │   [INDIAN ×] [FANTASY ×] [NETFLIX ×]                          │
 *   └──────────────────────────────────────────────────────────────┘
 *
 *   The View Toggle is inlined here (instead of using VaultHeader) so
 *   the Grid/Timeline buttons can live in the LEFT group while the
 *   Filter + Search buttons live in the RIGHT group — satisfying the
 *   `justify-between` layout that spans the full header width.
 *
 * EXPANDABLE SEARCH:
 *   When the Search icon button is tapped, the Main Action Bar is
 *   REPLACED by a full-width search input with a back arrow (←) on the
 *   left and a Clear button on the right. The Tabs Row and Chips Row
 *   remain visible below the expanded search so the user keeps their
 *   context. The expanded input uses `pl-10 pr-16` padding so text
 *   NEVER overlaps the icons.
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
  // Collapsed ↔ Expanded search state. When expanded, the Main Action Bar
  // is replaced by a full-width search input.
  const [isSearchExpanded, setIsSearchExpanded] = createSignal(false);

  /** Collapse the search — returns to the Main Action Bar view. */
  const collapseSearch = () => {
    setIsSearchExpanded(false);
  };

  /** Whether the Clear button should be visible in the expanded search —
   *  only when there's text in the search input OR there are active
   *  filters/status tab. */
  const showClear = () =>
    props.searchInput().length > 0 ||
    props.activeFilterCount() > 0 ||
    props.activeStatusTab() !== "all";

  /** Total vault count for the stats badge in the Main Action Bar. */
  const totalCount = () => props.watchlist().length;

  return (
    <div
      class="sticky top-0 z-40 pt-4 pb-2 -mx-4 sm:-mx-5 px-4 sm:px-5 mb-3 watchlist-header-glass"
    >
      {/* ───────────────────────────────────────────────────────────────
          MAIN ACTION BAR  OR  EXPANDED SEARCH
          The Main Action Bar uses `flex justify-between items-center w-full`
          so the View Toggle (left) and the Filter + Search buttons (right)
          span the ENTIRE header width — no empty black space on the right.

          When search is expanded, this row is REPLACED by a full-width
          search input with a back arrow (←) and Clear button.
          ─────────────────────────────────────────────────────────────── */}
      <Show
        when={!isSearchExpanded()}
        fallback={
          /* ── EXPANDED: full-width Search Input with Back arrow + Clear ── */
          <div class="w-full relative flex items-center mb-4">
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

            {/* Search input — pl-10 (back arrow) + pr-12 (Clear button) so
                text NEVER overlaps the icons.

                v2 — TIGHTER RIGHT PADDING:
                Previously pr-16 (4rem / 64px), which over-reserved space
                for the Clear pill and truncated the long placeholder
                ("Search title, cast, director, genre, platform, year...").
                Now pr-12 (3rem / 48px) — the Clear pill is ~40px wide and
                sits at right-2 (8px from the right edge), so 48px of right
                padding clears it with no overlap while giving the placeholder
                ~16px more breathing room. The native browser × (which used
                to live in the right padding area and caused the "duplicate
                clear buttons" bug) is hidden via `.search-premium::-webkit-
                search-cancel-button` in watchlist.css. */}
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
                "padding-right": "3rem",
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
        }
      >
        {/* ── COLLAPSED: Main Action Bar ──
            `flex justify-between items-center w-full` so the left group
            (View Toggle + stats) and the right group (Filter + Search)
            push to opposite edges of the header — no empty space. */}
        <div class="flex justify-between items-center w-full mb-4">
          {/* LEFT group: View Toggle (grid/timeline) + a subtle vault-count
              badge. The count gives the user a quick "you have N titles"
              readout without needing a separate stats bar. */}
          <div class="flex items-center gap-2">
            {/* View mode toggle — inlined here (instead of using VaultHeader)
                so the Grid/Timeline buttons stay in the LEFT group while
                Filter + Search go in the RIGHT group. */}
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
            {/* Vault count badge — only shown when there are items, so an
                empty vault doesn't show a misleading "0". */}
            <Show when={totalCount() > 0}>
              <span
                class="type-meta shrink-0 hidden sm:inline-flex items-center gap-1"
                style={{
                  "font-size": "0.5625rem",
                  "font-weight": 800,
                  "letter-spacing": "0.10em",
                  "text-transform": "uppercase",
                  color: "var(--text-muted)",
                  "padding": "0.375rem 0.625rem",
                  "border-radius": "var(--radius-pill)",
                  background: "var(--tier-1)",
                  border: "1px solid var(--hairline)",
                }}
                aria-label={`${totalCount()} titles in your vault`}
              >
                <Icon name="video_library" style={{"font-size":"12px"}} aria-hidden="true" />
                {totalCount()}
              </span>
            </Show>
          </div>

          {/* RIGHT group: Filter Button + circular Search icon button.
              These are right-aligned via the parent's `justify-between`. */}
          <div class="flex items-center gap-2">
            {/* Filter Button — opens the filter drawer. Shows a count
                badge when filters are active. */}
            <button
              type="button"
              onClick={() => props.onFilterClick()}
              class="filter-button focus-ring flex items-center justify-center shrink-0"
              data-active={props.activeFilterCount() > 0}
              style={{
                height: "40px",
                "padding": "0 0.875rem",
                "border-radius": "var(--radius-pill)",
                gap: "0.375rem",
              }}
              aria-label={`Filter${props.activeFilterCount() > 0 ? ` — ${props.activeFilterCount()} active` : ""}`}
              aria-pressed={props.activeFilterCount() > 0}
            >
              <Icon name="tune" style={{ "font-size": "16px" }} aria-hidden="true" />
              <span
                class="type-meta"
                style={{
                  "font-size": "0.5625rem",
                  "font-weight": 800,
                  "letter-spacing": "0.10em",
                  "text-transform": "uppercase",
                }}
              >
                Filter
              </span>
              <Show when={props.activeFilterCount() > 0}>
                <span class="filter-count-badge" aria-hidden="true">
                  {props.activeFilterCount()}
                </span>
              </Show>
            </button>

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
          </div>
        </div>
      </Show>

      {/* ───────────────────────────────────────────────────────────────
          TABS ROW
          The status pills (All / Watching / Planned / Completed / Dropped)
          live inside QuickFilterTabs, which already renders a
          `.quick-filter-bar` container with `display:flex; gap:0.375rem;
          overflow-x:auto; scrollbar-width:none;` so the pills scroll
          horizontally on mobile without wrapping or overflowing.
          We add `mb-3` spacing here and let the inner bar take the full
          width. Hidden in timeline mode (timeline forces Completed +
          watch_desc).
          ─────────────────────────────────────────────────────────────── */}
      <Show when={props.viewMode() === "grid"}>
        <div class="mb-3">
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

      {/* ───────────────────────────────────────────────────────────────
          CHIPS ROW
          `flex flex-wrap gap-2` — active filter pills (e.g. "INDIAN ×",
          "FANTASY ×", "NETFLIX ×") wrap to multiple lines if needed.
          Highly visible: gold-tinted bg + white text (see watchlist.css
          `.filter-chip` rule). Only rendered when there are active chips.
          ─────────────────────────────────────────────────────────────── */}
      <Show when={props.chips().length > 0}>
        <div class="flex flex-wrap gap-2">
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

