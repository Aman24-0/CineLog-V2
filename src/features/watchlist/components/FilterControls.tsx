// src/features/watchlist/components/FilterControls.tsx
import { For, Show, createSignal, createMemo, onMount, onCleanup, type Component } from "solid-js";
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
// The previous UI exposed 9 sort "modes" as a single bloated <select>.
// v2.7 — drops <Portal> and rewrites the dropdown as an inline
// relative/absolute layer. Rationale: the filter drawer establishes
// multiple overflow + transform contexts that broke the portal's
// fixed positioning on mobile (menu clipped, off-screen, or unopenable).
// Rendering the menu as an absolute child of the field selector's
// `relative flex-1` wrapper keeps it anchored to the button, and the
// `max-h-60 overflow-y-auto` cap keeps the menu scrollable within the
// drawer's own scroll area.
//
// LAYOUT:
//   Row: `flex gap-2 w-full`
//   LEFT  — `relative flex-1` wrapper holding the field button + the
//           absolute dropdown menu (`top-full left-0 mt-2 w-full z-50`).
//   RIGHT — Compact square icon toggle (`w-11 h-11 flex-shrink-0`)
//           showing arrow_downward (desc) or arrow_upward (asc).
//           Text labels were too wide for mobile alongside the field
//           selector; the icon is universal and takes a fixed 44×44.
//
// REACTIVITY:
//   - `isOpen` signal controls the dropdown menu visibility.
//   - `dirLabel` memo still recomputes for the aria-label so screen
//     readers announce direction in friendly field-specific language.
//   - Click-outside + scroll + resize listeners are registered in onMount
//     and cleaned up in onCleanup (no leaks across drawer open/close).

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

  // Refs — assigned during render via ref={...}. Typed as `undefined`
  // initially because SolidJS refs run after the first render.
  let fieldBtnRef: HTMLButtonElement | undefined;
  let menuRef: HTMLDivElement | undefined;

  const openMenu = () => setIsOpen(true);
  const closeMenu = () => setIsOpen(false);
  const toggleMenu = () => (isOpen() ? closeMenu() : openMenu());

  /** Flip the direction between "asc" and "desc". */
  const toggleDirection = () => {
    props.setDirection(props.direction === "desc" ? "asc" : "desc");
  };

  /** Live direction label — recomputes whenever field or direction changes.
   *  Used only for the aria-label now; the visible UI is the icon. */
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
      // Click inside the dropdown menu — let the option's onClick handle
      // the selection, don't close here.
      if (menuRef && menuRef.contains(target)) return;
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
      {/* v2.8 — internal "Sort By" label REMOVED.
          VaultFiltersContent already renders a `<p class="filter-section-title">Sort By</p>`
          section header (uppercase "SORT BY" with hairline rule) immediately
          above this control, so rendering a second label here produced
          "SORT BY" / "Sort By" stacked. The other filter primitives
          (FilterSel, FilterChips, RangeFilter) DO keep their internal
          labels because they are nested inside a `<div class="space-y-3">`
          under their section title — they need the label to identify
          which sub-filter they are. SortControl is the ONLY primitive
          rendered directly under its section title, so the section
          title alone is sufficient. */}
      {/* Compact side-by-side row: field selector (left, flex-1) +
          direction icon toggle (right, fixed 44×44). */}
      <div class="flex gap-2 w-full">
        {/* LEFT — Field dropdown.
            `relative flex-1 min-w-0` so the absolute menu anchors here,
            the selector takes the remaining horizontal space, and the
            `min-w-0` allows truncation to work inside flex children
            (without it, flex items refuse to shrink below their
            content's intrinsic min-width, breaking `truncate`). */}
        <div class="relative flex-1 min-w-0">
          <button
            ref={fieldBtnRef}
            type="button"
            class="filter-select-premium w-full flex items-center justify-between gap-2"
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

          {/* Inline dropdown menu — absolute-positioned inside the
              `relative flex-1 min-w-0` wrapper. No <Portal>; the menu
              flows in the drawer's own stacking + scroll context.

              v2.8 fixes:
              - Opens UPWARDS (`bottom-full mb-2` instead of `top-full
                mt-2`) so the menu pops above the button. Previously
                it opened downwards and was hidden behind the sticky
                "CLEAR ALL / APPLY" footer at the bottom of the drawer.
                Opening upwards keeps every option visible regardless
                of how far the drawer is scrolled.
              - `w-full max-w-full overflow-x-hidden` so long option
                labels can never push the menu wider than the field
                button's width (which previously broke the drawer
                layout horizontally on mobile). Each option button
                uses `truncate w-full text-left` so any overflow
                gracefully cuts off with an ellipsis. */}
          <Show when={isOpen()}>
            <div
              ref={menuRef}
              class="absolute bottom-full left-0 mb-2 w-full max-w-full overflow-x-hidden overflow-y-auto rounded-xl border animate-fade-in"
              style={{
                background: "var(--glass-bg-strong)",
                "backdrop-filter": "blur(20px) saturate(140%)",
                "-webkit-backdrop-filter": "blur(20px) saturate(140%)",
                "border-color": "var(--hairline)",
                "box-shadow": "var(--shadow-premium)",
                "z-index": "50",
                "max-height": "15rem",
                padding: "0.25rem 0",
              }}
              role="listbox"
              aria-label="Sort field"
            >
              <For each={ALL_SORT_FIELDS}>
                {(f) => (
                  <button
                    type="button"
                    class="w-full text-left truncate transition-colors focus-ring"
                    style={{
                      padding: "0.625rem 0.875rem",
                      background: f === props.field ? "var(--p-dim)" : "transparent",
                      color: f === props.field ? "var(--p)" : "var(--text-body)",
                      "font-family": "'Outfit', sans-serif",
                      "font-size": "0.8125rem",
                      "font-weight": f === props.field ? 700 : 500,
                      "overflow": "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
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
          </Show>
        </div>

        {/* RIGHT — Compact direction toggle (square icon button).
            Material Symbols: arrow_downward = desc, arrow_upward = asc.
            The field-dependent directionLabel is kept only for the
            aria-label so screen readers still announce "Newest First",
            "High to Low", "Z → A", etc. in friendly language. */}
        <button
          type="button"
          class="filter-select-premium w-11 h-11 flex-shrink-0 flex items-center justify-center focus-ring"
          onClick={toggleDirection}
          aria-label={`Sort direction — currently ${dirLabel()}`}
        >
          <Icon
            name={props.direction === "desc" ? "arrow_downward" : "arrow_upward"}
            style={{ "font-size": "20px", color: "var(--text-strong)" }}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
};
