// src/features/collections/components/CollectionToolbar.tsx
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
 * CollectionToolbar — the sort / filter / search toolbar above the
 * entry list on a collection detail page.
 *
 * Layout (single row on desktop, wraps on mobile):
 *
 *   [Sort ▾] [🔍 Search………]                 [All] [Watching] [Completed] ...
 *
 * For USER collections: the sort dropdown is shown (Manual Order,
 * Release Date, Date Added, Title, Rating).
 *
 * For SUBSCRIBED UNIVERSES: the sort dropdown is HIDDEN — universes
 * are always in "Timeline Order" managed by the admin. The search
 * and filter pills still apply (search within this universe, filter
 * by user's status).
 */
export interface CollectionToolbarProps {
  collection: Collection;
  search: Accessor<string>;
  onSearchInput: (v: string) => void;
  status: Accessor<CollectionStatusFilter>;
  onStatusChange: (s: CollectionStatusFilter) => void;
  sortMode?: Accessor<UserCollectionSortMode>;
  onSortModeChange?: (m: UserCollectionSortMode) => void;
}

const CollectionToolbar: Component<CollectionToolbarProps> = (props) => {
  const isUniverse = () => props.collection.type === "curated";

  return (
    <div class="collection-toolbar">
      <div class="collection-toolbar-row">
        {/* Sort dropdown — user collections only.
            Universes are locked to "Timeline Order". */}
        <Show when={!isUniverse() && props.sortMode && props.onSortModeChange}>
          <SortDropdown
            value={props.sortMode!()}
            onChange={props.onSortModeChange!}
          />
        </Show>
        <Show when={isUniverse()}>
          <div
            style={{
              display: "inline-flex",
              "align-items": "center",
              gap: "6px",
              padding: "8px 14px",
              "border-radius": "999px",
              background: "var(--tier-2)",
              border: "1px solid var(--hairline)",
              color: "var(--text-soft)",
              "font-family": "'Outfit', sans-serif",
              "font-size": "0.75rem",
            }}
          >
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">timeline</span>
            Timeline Order
          </div>
        </Show>

        {/* Search input */}
        <div class="collection-toolbar-search">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>
          <input
            type="text"
            placeholder="Search title, cast, director, genre…"
            value={props.search()}
            onInput={(e) => props.onSearchInput(e.currentTarget.value)}
            aria-label="Search within this collection"
          />
        </div>
      </div>

      {/* Status filter pills — applies to both user collections and universes */}
      <div class="collection-toolbar-pills">
        <For each={STATUS_FILTER_OPTIONS}>
          {(opt) => (
            <button
              type="button"
              class={`collection-toolbar-pill${props.status() === opt.value ? " is-active" : ""}`}
              onClick={() => props.onStatusChange(opt.value)}
              aria-pressed={props.status() === opt.value}
            >
              {opt.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// SortDropdown — custom dark-glass dropdown for the sort mode.
// Uses the same pattern as SortControl / GlassSelect: relative wrapper,
// button trigger, absolute menu, click-outside detection.
// ──────────────────────────────────────────────────────────────────────────

interface SortDropdownProps {
  value: UserCollectionSortMode;
  onChange: (m: UserCollectionSortMode) => void;
}

function SortDropdown(props: SortDropdownProps) {
  return (
    <SortDropdownInner value={props.value} onChange={props.onChange} />
  );
}

function SortDropdownInner(props: SortDropdownProps) {
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
    <div ref={ref} class="relative">
      <button
        type="button"
        class="collection-action-dock-btn focus-ring"
        onClick={() => setOpen(!open())}
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-label="Sort entries"
      >
        <span class="material-symbols-outlined" aria-hidden="true">sort</span>
        {currentLabel()}
        <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">
          {open() ? "expand_less" : "expand_more"}
        </span>
      </button>
      <Show when={open()}>
        <div
          class="collection-action-dock-more-menu"
          role="menu"
          style={{ left: "0", right: "auto", "min-width": "180px", top: "calc(100% + 6px)" }}
        >
          <For each={USER_SORT_OPTIONS}>
            {(opt) => (
              <button
                type="button"
                class={`collection-action-dock-more-menu-item${opt.value === props.value ? " is-active" : ""}`}
                role="menuitem"
                style={opt.value === props.value ? { color: "var(--p)" } : {}}
                onClick={() => {
                  props.onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  {opt.value === props.value ? "check" : "sort"}
                </span>
                {opt.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default CollectionToolbar;
