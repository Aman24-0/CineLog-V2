// src/features/watchlist/components/FilterControls.tsx
import {
  For,
  Show,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  type Component
} from "solid-js";
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
  // ESLint: `id` is a stable DOM id derived from props.label once at mount.
  // The label prop is set by the parent filter drawer and never changes
  // during the FilterSel's lifetime — making it reactive would just
  // churn the DOM id (and break <label for=...> association) for no
  // benefit. Computed once, used as a constant.
  // eslint-disable-next-line solid/reactivity
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
 * GlassSelect — custom dark-glass dropdown replacement for native <select>.
 *
 * Used for the Genre and Platform filters in the VaultFilters drawer.
 * Matches the SortControl visual language: `bg-[var(--tier-2)]` background,
 * `border-[var(--hairline)]` hairline border, `rounded-xl`, glass
 * `backdrop-blur-xl` on the menu, accent color (`var(--p)`) highlight on
 * the active option.
 *
 * WHY NOT NATIVE <select>?
 *   On mobile devices, the native <select> element opens an OS-default
 *   white/grey modal picker that completely breaks the app's dark glass
 *   theme. This custom dropdown renders entirely inside the drawer with
 *   the same dark glass styling as the rest of the UI, so the visual
 *   language is consistent across all filters.
 *
 * OPEN DIRECTION:
 *   Opens DOWNWARDS (`top-full mt-2`). Genre and Platform live in the
 *   Content section near the TOP of the drawer — there's plenty of room
 *   below them, and the sticky CLEAR ALL / APPLY footer is far away. If
 *   this filter ever moves near the bottom of the drawer, switch to
 *   `bottom-full mb-2` (see SortControl) so the menu pops upwards
 *   instead.
 *
 * STRUCTURE (mirrors SortControl):
 *   - OUTER: `flex flex-col gap-1.5` (label on top, control below).
 *   - WRAPPER: `relative w-full` with the menuRef — anchors the absolute
 *     menu and serves as the click-outside boundary.
 *   - TRIGGER: `<button>` styled with `bg-[var(--tier-2)]` +
 *     `border-[var(--hairline)]` + `rounded-xl`. NOT absolute — it
 *     participates in normal flow so the wrapper has a measurable height
 *     for the menu's `top-full` to anchor against.
 *   - MENU: the ONLY absolutely-positioned element. `top-full left-0 mt-2`
 *     pops it DOWNWARDS from the trigger button. `max-h-60 overflow-y-auto`
 *     caps the visible height so long option lists (20+ genres) are still
 *     reachable on short viewports. `overflow-x-hidden` + each option's
 *     `truncate` keep long labels from forcing the menu wider than the
 *     trigger.
 *
 * REACTIVITY:
 *   - `isOpen` signal controls dropdown visibility.
 *   - `currentLabel` memo recomputes on `val` change to keep the trigger
 *     button label in sync.
 *   - Click-outside + resize listeners are registered in onMount
 *     (SSR-safe) and cleaned up in onCleanup. No scroll listener —
 *     matches SortControl v3 behavior (scrolling the drawer is natural
 *     and shouldn't close the menu).
 *
 * NO <Portal>. NO absolute positioning on the trigger button. Only the
 * dropdown menu div is absolute.
 */
export const GlassSelect: Component<{
  label: string;
  val: string;
  set: (v: string) => void;
  opts: FilterOption[];
}> = (props) => {
  // Dropdown open/close state. SolidJS signal — reactivity-safe.
  const [isOpen, setIsOpen] = createSignal(false);

  // Single ref on the WRAPPER — covers BOTH the trigger button AND the
  // menu div, so click-outside detection is one `contains()` check.
  let menuRef: HTMLDivElement | undefined;

  /** Label of the currently selected option. Recomputes on val change. */
  const currentLabel = createMemo(() => {
    const found = props.opts.find((o) => o.v === props.val);
    return found ? found.l : props.val;
  });

  // ── Click-outside + resize listeners ──────────────────────────────────
  // Same pattern as SortControl: mousedown closes on outside click,
  // resize closes because the trigger's position would no longer match
  // the menu's. No scroll listener — see component docstring above.
  onMount(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!isOpen()) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef && menuRef.contains(target)) return;
      setIsOpen(false);
    };
    const onResize = () => {
      if (isOpen()) setIsOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onResize);

    onCleanup(() => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onResize);
    });
  });

  return (
    <div class="flex flex-col gap-1.5">
      <span class="type-meta" style={{ "font-size": "0.5625rem" }}>
        {props.label}
      </span>

      {/* WRAPPER — `relative w-full` anchors the absolute menu; the
          menuRef on this div covers both the trigger button and the
          menu for click-outside detection. */}
      <div class="relative w-full" ref={menuRef}>
        {/* TRIGGER — styled to match SortControl. NOT absolute. */}
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-xl border bg-[var(--glass-bg)] px-3 py-2.5 text-[var(--text)]"
          style={{ "border-color": "var(--hairline)" }}
          onClick={() => setIsOpen(!isOpen())}
          aria-haspopup="listbox"
          aria-expanded={isOpen()}
          aria-label={`${props.label} — currently ${currentLabel()}`}
        >
          <span class="truncate text-sm font-medium">{currentLabel()}</span>
          <span
            class="material-symbols-outlined text-lg text-[var(--text-muted)]"
            aria-hidden="true"
          >
            {isOpen() ? "expand_less" : "expand_more"}
          </span>
        </button>

        {/* MENU — opens DOWNWARDS. The ONLY absolutely-positioned element. */}
        <Show when={isOpen()}>
          <div
            class="absolute left-0 top-full z-[100] mt-2 max-h-60 w-full overflow-y-auto overflow-x-hidden rounded-xl border bg-[var(--glass-bg-strong)] shadow-elevated backdrop-blur-xl"
            style={{ "border-color": "var(--hairline)" }}
            role="listbox"
            aria-label={props.label}
          >
            <For each={props.opts}>
              {(option) => (
                <button
                  type="button"
                  class="w-full truncate px-4 py-3 text-left text-sm transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                  classList={{
                    "text-[var(--p)] font-bold": props.val === option.v,
                    "text-[var(--text-body)] font-medium":
                      props.val !== option.v
                  }}
                  style={{
                    background:
                      props.val === option.v ? "var(--p-dim)" : "transparent"
                  }}
                  onClick={() => {
                    props.set(option.v);
                    setIsOpen(false);
                  }}
                  role="option"
                  aria-selected={props.val === option.v}
                >
                  {option.l}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
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
      <div
        class="hide-scrollbar flex gap-2 overflow-x-auto"
        role="tablist"
        aria-label={props.label}
      >
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
// v2.9 — rewritten with a strict structural skeleton to fix the
// overlapping/squished button regression introduced in v2.8.
//
// KEY STRUCTURAL RULES (do not regress):
//   1. The OUTER row is `flex items-center gap-2 w-full` — exactly two
//      flex children: the LEFT wrapper and the RIGHT toggle button.
//   2. The LEFT wrapper is `relative flex-1 min-w-0` and contains
//      BOTH the trigger button AND the dropdown menu div. `min-w-0`
//      is critical: without it, flex children refuse to shrink below
//      their content's intrinsic min-width, and long option labels
//      would force the whole row wider than the drawer.
//   3. The trigger button is `w-full flex items-center justify-between`
//      — NOT absolute. It participates in normal flow so the wrapper
//      has a measurable height for the menu's `bottom-full` to anchor.
//   4. The dropdown menu div is the ONLY absolutely-positioned element.
//      It uses `bottom-full left-0 mb-2 w-full` to pop UPWARDS from
//      the trigger button (avoids the sticky CLEAR ALL / APPLY footer).
//   5. The RIGHT toggle is a fixed `w-11 h-11 flex-shrink-0` square.
//      `flex-shrink-0` prevents it from being squeezed by the LEFT
//      wrapper under any width pressure.
//
// No <Portal>. No absolute positioning on the buttons themselves.
// Only the dropdown menu div is absolute.
//
// REACTIVITY:
//   - `isOpen` signal controls dropdown visibility.
//   - `currentFieldLabel` memo recomputes on sortField change.
//   - `directionLabel` memo recomputes on sortField/sortDirection change
//     and is used for the aria-label (screen-reader-friendly, field-
//     specific language like "Newest First" / "High to Low" / "Z → A").
//   - Click-outside + scroll + resize listeners are registered in
//     onMount (SSR-safe) and cleaned up in onCleanup.
//
// PROP API (v2.9):
//   Switched from { field, direction, setField, setDirection } to
//   { filters, onChange } so the control owns nothing and the parent
//   stays the single source of truth. `filters` is a structural slice
//   ({ sortField, sortDirection }) — the parent passes its full
//   VaultFilters object and the spread inside this component preserves
//   every other filter field when emitting onChange.

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
  "title"
];

/** Human-readable label for each sort field, shown in the dropdown. */
function fieldLabel(f: SortField): string {
  switch (f) {
    case "added_date":
      return "Date Added";
    case "watch_date":
      return "Watch Date";
    case "release_date":
      return "Release Date";
    case "user_rating":
      return "User Rating";
    case "imdb":
      return "IMDb Rating";
    case "rt":
      return "Rotten Tomatoes";
    case "mt":
      return "Metacritic";
    case "runtime":
      return "Runtime";
    case "title":
      return "Title";
  }
}

/**
 * Direction toggle label, field-dependent. Used for the aria-label so
 * screen readers announce direction in friendly field-specific language.
 *
 * Conventions:
 *   - ↓ = sortDirection "desc" (larger values at the top of the list)
 *   - ↑ = sortDirection "asc"  (smaller values at the top of the list)
 *
 * For title, "desc" = Z → A (alphabetical descending) and "asc" = A → Z.
 * This matches the pattern of the other dimensions (desc = larger first)
 * and keeps the arrow semantics consistent across all fields.
 */
function directionLabelText(
  field: SortField,
  direction: SortDirection
): string {
  const isTitle = field === "title";
  const isDate =
    field === "release_date" ||
    field === "added_date" ||
    field === "watch_date";
  if (isTitle) {
    return direction === "desc" ? "↓ Z → A" : "↑ A → Z";
  }
  if (isDate) {
    return direction === "desc" ? "↓ Newest First" : "↑ Oldest First";
  }
  // Ratings & Runtime (user_rating, imdb, rt, mt, runtime)
  return direction === "desc" ? "↓ High to Low" : "↑ Low to High";
}

/** Static dropdown options array — derived once from ALL_SORT_FIELDS.
 *  Used by the <For each={SORT_OPTIONS}> render. */
const SORT_OPTIONS: { value: SortField; label: string }[] = ALL_SORT_FIELDS.map(
  (f) => ({
    value: f,
    label: fieldLabel(f)
  })
);

export const SortControl: Component<{
  /** Current filter state. Accepts the parent's full VaultFilters object
   *  (only `sortField` + `sortDirection` are read here); the spread
   *  inside this component preserves all other fields when emitting
   *  `onChange`, so non-sort filters are never clobbered. */
  filters: { sortField: SortField; sortDirection: SortDirection };
  /** Called with the next sort-state slice whenever the user changes the
   *  sort field or direction. The caller merges it into their filter
   *  store (e.g. via `batchedSet(next)`). */
  onChange: (next: {
    sortField: SortField;
    sortDirection: SortDirection;
  }) => void;
}> = (props) => {
  // Dropdown open/close state. SolidJS signal — reactivity-safe.
  const [isOpen, setIsOpen] = createSignal(false);

  // Single ref on the LEFT wrapper — covers BOTH the trigger button
  // AND the menu div, so click-outside detection is one `contains()`
  // check instead of two refs. (v2.9 simplification.)
  let menuRef: HTMLDivElement | undefined;

  /** Label of the currently selected sort field. Recomputes on
   *  props.filters.sortField change. */
  const currentFieldLabel = createMemo(() =>
    fieldLabel(props.filters.sortField)
  );

  /** Field-aware direction label for the aria-label (e.g. "Newest First",
   *  "High to Low", "Z → A"). Recomputes on field or direction change. */
  const directionLabel = createMemo(() =>
    directionLabelText(props.filters.sortField, props.filters.sortDirection)
  );

  // ── Click-outside + resize listeners ──────────────────────────────────
  // Registered in onMount so they're attached only on the client (SSR-safe)
  // and cleaned up when the SortControl unmounts (drawer close).
  //
  // NOTE: No 'scroll' listener — in a mobile drawer, scrolling is natural
  // and the user often pans while the menu is open to inspect underlying
  // content. Closing on scroll was a regression; the menu should stay open
  // until the user explicitly taps outside or picks an option. The
  // 'resize' listener is kept because resizing changes the trigger button's
  // position and would leave the menu visually detached from its anchor.
  onMount(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!isOpen()) return;
      const target = e.target as Node | null;
      if (!target) return;
      // Click inside the LEFT wrapper (button or menu) — let the
      // respective onClick handle it, don't close here.
      if (menuRef && menuRef.contains(target)) return;
      // Click anywhere else — close.
      setIsOpen(false);
    };
    // Close on resize, since the trigger button's position would no
    // longer match the menu's absolute position.
    const onResize = () => {
      if (isOpen()) setIsOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onResize);

    onCleanup(() => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onResize);
    });
  });

  return (
    <div class="flex w-full items-center gap-2">
      {/* LEFT SIDE: Field Selector & Dropdown Menu
          ────────────────────────────────────────────────────────────
          `relative` anchors the absolute menu; `flex-1 min-w-0` lets the
          wrapper take the remaining space AND shrink so `truncate` works
          inside (long option labels won't push the row wider than the
          drawer). `ref={menuRef}` is on THIS wrapper (not the menu div)
          so click-outside detection covers both the button and the menu
          with a single `contains()` check. */}
      <div class="relative min-w-0 flex-1" ref={menuRef}>
        {/* 1. Main Dropdown Trigger Button
            NOT absolute — participates in normal flow so the wrapper has
            a measurable height for the menu's `bottom-full` to anchor. */}
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-xl border bg-[var(--glass-bg)] px-3 py-2.5 text-[var(--text)]"
          style={{ "border-color": "var(--hairline)" }}
          onClick={() => setIsOpen(!isOpen())}
          aria-haspopup="listbox"
          aria-expanded={isOpen()}
          aria-label={`Sort by field — currently ${currentFieldLabel()}`}
        >
          <span class="truncate text-sm font-medium">
            {currentFieldLabel()}
          </span>
          <span
            class="material-symbols-outlined text-lg text-[var(--text-muted)]"
            aria-hidden="true"
          >
            {isOpen() ? "expand_less" : "expand_more"}
          </span>
        </button>

        {/* 2. The Pop-UP Menu (Opens UPWARDS to avoid footer)
            The ONLY absolutely-positioned element. `bottom-full mb-2`
            pops it above the trigger button so it never gets hidden
            behind the sticky CLEAR ALL / APPLY footer at the drawer's
            bottom. `max-h-60 overflow-y-auto` caps the visible height
            so all 9 options are reachable even on short viewports.
            `overflow-x-hidden` + each option's `truncate` keep long
            labels from forcing the menu wider than the trigger. */}
        <Show when={isOpen()}>
          <div
            class="absolute bottom-full left-0 z-[100] mb-2 max-h-60 w-full overflow-y-auto overflow-x-hidden rounded-xl border bg-[var(--glass-bg-strong)] shadow-elevated backdrop-blur-xl"
            style={{ "border-color": "var(--hairline)" }}
            role="listbox"
            aria-label="Sort field"
          >
            <For each={SORT_OPTIONS}>
              {(option) => (
                <button
                  type="button"
                  class="w-full truncate px-4 py-3 text-left text-sm transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                  classList={{
                    "text-[var(--p)] font-bold":
                      props.filters.sortField === option.value,
                    "text-[var(--text-body)] font-medium":
                      props.filters.sortField !== option.value
                  }}
                  style={{
                    background:
                      props.filters.sortField === option.value
                        ? "var(--p-dim)"
                        : "transparent"
                  }}
                  onClick={() => {
                    props.onChange({
                      ...props.filters,
                      sortField: option.value
                    });
                    setIsOpen(false);
                  }}
                  role="option"
                  aria-selected={props.filters.sortField === option.value}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* RIGHT SIDE: Direction Toggle Button
          Fixed 44×44 square, `flex-shrink-0` so it never gets squeezed
          by the LEFT wrapper under width pressure. Material Symbols:
          arrow_downward = desc, arrow_upward = asc. */}
      <button
        type="button"
        class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border bg-[var(--glass-bg)] text-[var(--text)] transition-colors hover:bg-[rgba(255,255,255,0.05)]"
        style={{ "border-color": "var(--hairline)" }}
        onClick={() =>
          props.onChange({
            ...props.filters,
            sortDirection:
              props.filters.sortDirection === "asc" ? "desc" : "asc"
          })
        }
        aria-label={`Sort direction — currently ${directionLabel()}`}
      >
        <span class="material-symbols-outlined text-xl" aria-hidden="true">
          {props.filters.sortDirection === "desc"
            ? "arrow_downward"
            : "arrow_upward"}
        </span>
      </button>
    </div>
  );
};
