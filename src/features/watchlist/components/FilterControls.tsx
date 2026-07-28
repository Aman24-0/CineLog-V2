// src/features/watchlist/components/FilterControls.tsx
import { For, Show, createSignal, createMemo, onMount, onCleanup, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import Icon from "~/shared/ui/Icon";
import type { SortField, SortDirection } from "~/shared/types";

/**
 * FilterControls — reusable form primitives for the VaultFilters drawer.
 *
 * Three primitives:
 *   - FilterSel: premium-styled <select> with a label (for long lists like Genre)
 *   - FilterChips: horizontal scrollable chip selector (for short lists like Type/Region)
 *   - RangeFilter: two side-by-side number inputs (min/max) with a label
 *
 * v2: Added FilterChips + dark-theme polished RangeFilter inputs.
 * v2.6: Added SortControl — custom SolidJS dropdown replacing the native
 *       <select> for sort. Splits the previous "sort" string into two
 *       side-by-side controls: a field dropdown (left) + direction toggle
 *       (right). See SortControl docstring for details.
 */

export interface FilterOption {
  l: string;
  v: string;
}

export const FilterSel: Component<{
  label: string;
  val: string;
  set: (v: string) => void;
  opts: FilterOption[] | string[];
}> = (props) => {
  const id = `filter-${props.label.toLowerCase().replace(/\s/g, "-")}`;
  return (
    <div class="flex flex-col gap-1.5">
      <label class="type-meta" for={id} style={{ "font-size": "0.5625rem" }}>
        {props.label}
      </label>
      <select
        id={id}
        value={props.val}
        onChange={(e) => props.set(e.currentTarget.value)}
        class="filter-select-premium"
      >
        <For each={props.opts}>
          {(o) => (
            <option value={typeof o === "string" ? o : o.v}>
              {typeof o === "string" ? o : o.l}
            </option>
          )}
        </For>
      </select>
    </div>
  );
};

/**
 * FilterChips — horizontal scrollable chip selector for short option lists.
 *
 * Replaces <select> dropdowns for filters with ≤5 options (Type, Region).
 * Each chip is a toggle button — the active chip gets the accent color.
 * Horizontally scrollable on mobile (no wrapping) to preserve the
 * one-line layout.
 */
export const FilterChips: Component<{
  label: string;
  val: string;
  set: (v: string) => void;
  opts: FilterOption[];
}> = (props) => {
  return (
    <div class="flex flex-col gap-1.5">
      <span class="type-meta" style={{ "font-size": "0.5625rem" }}>
        {props.label}
      </span>
      <div class="flex gap-2 overflow-x-auto hide-scrollbar" role="tablist" aria-label={props.label}>
        <For each={props.opts}>
          {(opt) => (
            <button
              type="button"
              class="filter-chip-option focus-ring"
              data-active={props.val === opt.v}
              onClick={() => props.set(opt.v)}
              role="tab"
              aria-selected={props.val === opt.v}
            >
              {opt.l}
            </button>
          )}
        </For>
      </div>
    </div>
  );
};

export const RangeFilter: Component<{
  label: string;
  min: string;
  max: string;
  setMin: (v: string) => void;
  setMax: (v: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}> = (props) => (
  <div class="flex flex-col gap-1.5">
    <span class="type-meta" style={{ "font-size": "0.5625rem" }}>
      {props.label}
    </span>
    <div class="grid grid-cols-2 gap-2">
      <input
        value={props.min}
        onInput={(e) => props.setMin(e.currentTarget.value)}
        type="number"
        placeholder={props.minPlaceholder || "Min"}
        aria-label={`${props.label} minimum`}
        class="filter-range-input"
      />
      <input
        value={props.max}
        onInput={(e) => props.setMax(e.currentTarget.value)}
        type="number"
        placeholder={props.maxPlaceholder || "Max"}
        aria-label={`${props.label} maximum`}
        class="filter-range-input"
      />
    </div>
  </div>
);

// ── SORT CONTROL ─────────────────────────────────────────────────────────
// v2.6 — replaces the previous <FilterSel label="Order" ...> sort dropdown.
// The previous UI exposed 9 sort "modes" as a single bloated <select>:
//   Recently Added / Recently Updated / Watch Date / Release Year /
//   User Rating / IMDb High→Low / IMDb Low→High / Runtime / Alphabetical
// Some of those were redundant (IMDb High→Low and IMDb Low→High differ
// only in direction) and the list was visually overwhelming on mobile.
// The new SortControl splits sort into two orthogonal controls:
//   LEFT  — a custom dropdown button showing the currently selected field.
//           Clicking opens an absolute-positioned menu with 9 field options.
//   RIGHT — a direction toggle button. Label is dynamic (createMemo) and
//           field-dependent: ratings/runtime show "High to Low"/"Low to
//           High", dates show "Newest First"/"Oldest First", title shows
//           "Z → A"/"A → Z".
//
// REACTIVITY:
//   - `isOpen` signal controls the dropdown menu visibility.
//   - `directionLabel` memo recomputes whenever `field` or `direction` changes.
//   - Click-outside + scroll + resize listeners are registered in onMount
//     and cleaned up in onCleanup (no leaks across drawer open/close).
//   - The dropdown menu is rendered via <Portal> at document.body level
//     so it escapes any `overflow-y-auto`/`overflow-hidden` ancestors
//     (the filter drawer has overflow-y-auto on its scroll area, which
//     would otherwise clip an absolutely-positioned child).

/** Canonical ordered list of all sortable fields. The order here is the
 *  order shown in the dropdown menu. Add new fields to this array AND to
 *  the `SortField` union in `shared/types/index.ts` AND to the
 *  `fieldLabel` switch AND to the `sortItems` comparator in
 *  `vaultFilterUtils.ts`. */
const ALL_SORT_FIELDS: SortField[] = [
  "added_date",
  "watch_date",
  "release_date",
  "user_rating",
  "imdb",
  "rt",
  "mt",
  "runtime",
  "title",
];

/** Human-readable label for each sort field, shown in the dropdown. */
function fieldLabel(f: SortField): string {
  switch (f) {
    case "added_date":   return "Date Added";
    case "watch_date":   return "Watch Date";
    case "release_date": return "Release Date";
    case "user_rating":  return "User Rating";
    case "imdb":         return "IMDb Rating";
    case "rt":           return "Rotten Tomatoes";
    case "mt":           return "Metacritic";
    case "runtime":      return "Runtime";
    case "title":        return "Title";
  }
}

/**
 * Direction toggle label, field-dependent.
 *
 * Conventions:
 *   - ↓  = sortDirection "desc" (larger values at the top of the list)
 *   - ↑  = sortDirection "asc"  (smaller values at the top of the list)
 *   - The text after the arrow describes what the user sees top-to-bottom.
 *
 * For title, "desc" = Z → A (alphabetical descending) and "asc" = A → Z.
 * This matches the pattern of the other dimensions (desc = larger first)
 * and keeps the arrow semantics consistent across all fields.
 */
function directionLabel(field: SortField, direction: SortDirection): string {
  const isTitle = field === "title";
  const isDate = field === "release_date" || field === "added_date" || field === "watch_date";
  if (isTitle) {
    return direction === "desc" ? "↓ Z → A" : "↑ A → Z";
  }
  if (isDate) {
    return direction === "desc" ? "↓ Newest First" : "↑ Oldest First";
  }
  // Ratings & Runtime (user_rating, imdb, rt, mt, runtime)
  return direction === "desc" ? "↓ High to Low" : "↑ Low to High";
}

export const SortControl: Component<{
  /** Currently selected sort field */
  field: SortField;
  /** Currently selected sort direction */
  direction: SortDirection;
  /** Setter for sortField — called when user picks an option from the dropdown */
  setField: (f: SortField) => void;
  /** Setter for sortDirection — called when user clicks the direction toggle */
  setDirection: (d: SortDirection) => void;
}> = (props) => {
  // Dropdown open/close state. SolidJS signal — reactivity-safe.
  const [isOpen, setIsOpen] = createSignal(false);
  // Computed position of the portal-rendered menu, derived from the
  // field button's bounding rect whenever the menu opens. Stored as a
  // signal so the Portal menu re-renders at the new position.
  const [menuPos, setMenuPos] = createSignal<{ top: number; left: number; width: number }>({
    top: 0, left: 0, width: 0,
  });

  // Refs — assigned during render via ref={...}. Typed as `undefined`
  // initially because SolidJS refs run after the first render.
  let fieldBtnRef: HTMLButtonElement | undefined;

  /** Open the dropdown menu. Reads the field button's bounding rect and
   *  stashes it in `menuPos` so the Portal menu can be positioned
   *  directly below the button. */
  const openMenu = () => {
    if (!fieldBtnRef) return;
    const rect = fieldBtnRef.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4, // 4px gap below the button
      left: rect.left,
      width: rect.width,
    });
    setIsOpen(true);
  };

  const closeMenu = () => setIsOpen(false);
  const toggleMenu = () => (isOpen() ? closeMenu() : openMenu());

  /** Flip the direction between "asc" and "desc". */
  const toggleDirection = () => {
    props.setDirection(props.direction === "desc" ? "asc" : "desc");
  };

  /** Live direction label — recomputes whenever field or direction changes. */
  const dirLabel = createMemo(() => directionLabel(props.field, props.direction));

  // ── Click-outside + scroll + resize listeners ─────────────────────────
  // Registered in onMount so they're attached only on the client (SSR-safe)
  // and cleaned up when the SortControl unmounts (drawer close). The
  // capture flag on the scroll listener is critical: most scrolls happen
  // on inner containers (the drawer's overflow-y-auto area), not the
  // window, so a non-capturing scroll listener would never fire.
  onMount(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!isOpen()) return;
      const target = e.target as Node | null;
      if (!target) return;
      // Click on the field button itself — let the button's onClick
      // handle the toggle, don't double-close here.
      if (fieldBtnRef && fieldBtnRef.contains(target)) return;
      // Click inside the portal menu — let the option's onClick handle
      // the selection, don't close here.
      const menuEl = document.getElementById("sort-control-menu");
      if (menuEl && menuEl.contains(target)) return;
      // Click anywhere else — close.
      closeMenu();
    };
    // Close on any scroll (capture: true catches scroll events on inner
    // containers, not just window) and on resize, since the field
    // button's position would no longer match the menu's position.
    const onScrollOrResize = () => {
      if (isOpen()) closeMenu();
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    onCleanup(() => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    });
  });

  return (
    <div class="flex flex-col gap-1.5">
      <span class="type-meta" style={{ "font-size": "0.5625rem" }}>
        Sort By
      </span>
      {/* Side-by-side layout: field dropdown (left, flex-1) + direction toggle (right, shrink-0).
          `relative` on the row so any non-portal decoration could anchor here, but the
          actual dropdown menu is portal-rendered to body to escape overflow clipping. */}
      <div class="flex items-center gap-2">
        {/* LEFT — Field dropdown button.
            Uses `filter-select-premium` for visual parity with FilterSel's <select>. */}
        <button
          ref={fieldBtnRef}
          type="button"
          class="filter-select-premium flex-1 flex items-center justify-between gap-2"
          onClick={toggleMenu}
          aria-haspopup="listbox"
          aria-expanded={isOpen()}
          aria-label={`Sort by field — currently ${fieldLabel(props.field)}`}
        >
          <span class="truncate">{fieldLabel(props.field)}</span>
          <Icon
            name={isOpen() ? "expand_less" : "expand_more"}
            style={{ "font-size": "18px", "flex-shrink": "0", color: "var(--text-soft)" }}
            aria-hidden="true"
          />
        </button>

        {/* RIGHT — Direction toggle button.
            `shrink-0` + `min-width` keeps the button from collapsing and
            prevents the label from truncating on mobile. */}
        <button
          type="button"
          class="filter-select-premium shrink-0 focus-ring"
          style={{
            "min-width": "8.75rem",
            "font-weight": 700,
          }}
          onClick={toggleDirection}
          aria-label={`Sort direction — currently ${dirLabel()}`}
        >
          {dirLabel()}
        </button>
      </div>

      {/* Dropdown menu — portal-rendered to document.body to escape the
          filter drawer's overflow-y-auto clipping. Positioned fixed using
          the field button's bounding rect (captured at open time). */}
      <Show when={isOpen()}>
        <Portal>
          <div
            id="sort-control-menu"
            class="fixed animate-fade-in"
            style={{
              top: `${menuPos().top}px`,
              left: `${menuPos().left}px`,
              "min-width": `${Math.max(menuPos().width, 200)}px`,
              background: "var(--glass-bg-strong)",
              "backdrop-filter": "blur(20px) saturate(140%)",
              "-webkit-backdrop-filter": "blur(20px) saturate(140%)",
              border: "1px solid var(--hairline)",
              "border-radius": "var(--radius-md)",
              "box-shadow": "var(--shadow-premium)",
              "z-index": "var(--z-dropdown)",
              overflow: "hidden",
              padding: "0.25rem 0",
            }}
            role="listbox"
            aria-label="Sort field"
          >
            <For each={ALL_SORT_FIELDS}>
              {(f) => (
                <button
                  type="button"
                  class="w-full text-left transition-colors focus-ring"
                  style={{
                    padding: "0.625rem 0.875rem",
                    background: f === props.field ? "var(--p-dim)" : "transparent",
                    color: f === props.field ? "var(--p)" : "var(--text-body)",
                    "font-family": "'Outfit', sans-serif",
                    "font-size": "0.8125rem",
                    "font-weight": f === props.field ? 700 : 500,
                  }}
                  onClick={() => {
                    props.setField(f);
                    closeMenu();
                  }}
                  role="option"
                  aria-selected={f === props.field}
                  onMouseEnter={(e) => {
                    if (f !== props.field) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = f === props.field ? "var(--p-dim)" : "transparent";
                  }}
                >
                  {fieldLabel(f)}
                </button>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </div>
  );
};
