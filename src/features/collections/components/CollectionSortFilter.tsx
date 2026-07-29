// src/features/collections/components/CollectionSortFilter.tsx
import { Show, For, createSignal, onMount, onCleanup, type Accessor, type Component } from "solid-js";
import type { Collection } from "~/shared/types";
import {
  STATUS_FILTER_OPTIONS,
  type CollectionStatusFilter,
} from "../hooks/useCollectionFilter";
import {
  type UserCollectionSortMode,
  USER_SORT_OPTIONS,
} from "../hooks/useCollectionSort";

/**
 * CollectionSortFilter — Row 2 of the collection detail page's
 * action area (below the action bar).
 *
 * LAYOUT (single row with flex-wrap, consistent gap-3, no jumping):
 *
 *   [Sort ▾ w-48] [🔍 Search…… flex-1 min-w-[200px]]  [All][Watching][Completed][Planned]
 *
 * USER COLLECTIONS:
 *   - Sort dropdown shown (Manual Order, Release Date, Date Added,
 *     Title, Rating).
 *   - When sort = Manual Order, the parent renders drag handles on
 *     each entry.
 *
 * SUBSCRIBED UNIVERSES:
 *   - Sort dropdown HIDDEN. Universes are always in "Timeline Order"
 *     managed by the admin.
 *   - Search + status pills still apply (search within this universe,
 *     filter by user's vault status).
 *
 * STATUS PILLS — only 4 statuses, matching the actual vault enum:
 *   All / Watching / Completed / Planned
 * (On Hold and Dropped were removed — they don't exist in the
 * watchlist.)
 *
 * Layout-stability guarantees:
 *   - Sort dropdown has fixed width (w-48 = 12rem).
 *   - Filter chips use `flex-shrink-0` so they don't get squeezed.
 *   - Search uses `flex-1 min-w-[200px]` so it grows but never
 *     shrinks below 200px.
 *   - The whole row uses `flex flex-wrap items-center gap-3` so on
 *     narrow screens chips wrap to a second line, never displacing
 *     the sort/search.
 */
export interface CollectionSortFilterProps {
  collection: Collection;
  search: Accessor<string>;
  onSearchInput: (v: string) => void;
  status: Accessor<CollectionStatusFilter>;
  onStatusChange: (s: CollectionStatusFilter) => void;
  /** Sort mode accessor — undefined for universes (sort hidden). */
  sortMode?: Accessor<UserCollectionSortMode>;
  onSortModeChange?: (m: UserCollectionSortMode) => void;
}

const CollectionSortFilter: Component<CollectionSortFilterProps> = (props) => {
  const isUniverse = () => props.collection.type === "curated";

  return (
    <div class="collection-sort-filter">
      <div class="collection-sort-filter-row">
        {/* Sort dropdown — user collections only.
            Universes are locked to "Timeline Order" managed by the admin. */}
        <Show when={!isUniverse() && props.sortMode && props.onSortModeChange}>
          <SortDropdown
            value={props.sortMode!()}
            onChange={props.onSortModeChange!}
          />
        </Show>
        <Show when={isUniverse()}>
          <div
            class="collection-sort-filter-timeline-badge"
            title="Universes are always shown in timeline order"
          >
            <span class="material-symbols-outlined" aria-hidden="true">timeline</span>
            <span>Timeline Order</span>
          </div>
        </Show>

        {/* Search input — flex-1 so it grows, min-w so it doesn't
            shrink to nothing when chips wrap on mobile. */}
        <div class="collection-sort-filter-search">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>
          <input
            type="text"
            placeholder="Search title, cast, director, genre..."
            value={props.search()}
            onInput={(e) => props.onSearchInput(e.currentTarget.value)}
            aria-label="Search within this collection"
          />
          <Show when={props.search().length > 0}>
            <button
              type="button"
              class="collection-sort-filter-search-clear focus-ring"
              onClick={() => props.onSearchInput("")}
              aria-label="Clear search"
            >
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </Show>
        </div>

        {/* Status filter pills — fixed-width, flex-shrink-0 so they
            never squeeze the search bar. */}
        <div class="collection-sort-filter-pills">
          <For each={STATUS_FILTER_OPTIONS}>
            {(opt) => (
              <button
                type="button"
                class={`collection-sort-filter-pill${props.status() === opt.value ? " is-active" : ""}`}
                onClick={() => props.onStatusChange(opt.value)}
                aria-pressed={props.status() === opt.value}
              >
                {opt.label}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// SortDropdown — custom dark-glass dropdown for the sort mode.
// Same pattern as ThreeDotMenu / GlassSelect: relative wrapper,
// button trigger, absolute menu, click-outside detection.
// ──────────────────────────────────────────────────────────────────────────

interface SortDropdownProps {
  value: UserCollectionSortMode;
  onChange: (m: UserCollectionSortMode) => void;
}

function SortDropdown(props: SortDropdownProps) {
  const [open, setOpen] = createSignal(false);
  let ref: HTMLDivElement | undefined;

  const close = (e: MouseEvent) => {
    if (ref && !ref.contains(e.target as Node)) setOpen(false);
  };
  onMount(() => document.addEventListener("mousedown", close));
  onCleanup(() => document.removeEventListener("mousedown", close));

  const currentLabel = () =>
    USER_SORT_OPTIONS.find((o) => o.value === props.value)?.label ?? "Sort";

  return (
    <div ref={ref} class="collection-sort-filter-dropdown">
      <button
        type="button"
        class="collection-sort-filter-dropdown-trigger focus-ring"
        onClick={() => setOpen(!open())}
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-label="Sort entries"
      >
        <span class="material-symbols-outlined" aria-hidden="true">sort</span>
        <span class="collection-sort-filter-dropdown-label">{currentLabel()}</span>
        <span
          class="material-symbols-outlined collection-sort-filter-dropdown-caret"
          aria-hidden="true"
        >
          {open() ? "expand_less" : "expand_more"}
        </span>
      </button>
      <Show when={open()}>
        <div class="collection-sort-filter-dropdown-menu" role="menu">
          <For each={USER_SORT_OPTIONS}>
            {(opt) => (
              <button
                type="button"
                class={`collection-sort-filter-dropdown-item${opt.value === props.value ? " is-active" : ""}`}
                role="menuitem"
                aria-pressed={opt.value === props.value}
                onClick={() => {
                  props.onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  {opt.value === props.value ? "check" : "sort"}
                </span>
                <span>{opt.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default CollectionSortFilter;
