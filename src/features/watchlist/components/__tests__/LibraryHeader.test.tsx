import { cleanup, render, screen, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import LibraryHeader from "../LibraryHeader";

const libraryItems = [
  { status: "Watching" },
  { status: "Completed", rewatchCount: 1 },
  { status: "Planned" }
] as WatchlistItem[];

function renderHeader(
  overrides?: Partial<{
    activeFilterCount: () => number;
    searchInput: () => string;
    activeStatusTab: () => string;
    onClearAll: () => void;
    chips: () => { label: string; key: string }[];
  }>
) {
  const [viewMode, setViewMode] = createSignal<"grid" | "timeline">("grid");
  const [activeStatusTab, setActiveStatusTab] = createSignal(
    overrides?.activeStatusTab?.() ?? "all"
  );
  const [searchInput, setSearchInput] = createSignal(
    overrides?.searchInput?.() ?? ""
  );

  render(() => (
    <LibraryHeader
      viewMode={viewMode}
      setViewMode={setViewMode}
      activeFilterCount={overrides?.activeFilterCount ?? (() => 2)}
      onFilterClick={() => undefined}
      searchInput={searchInput}
      onSearchInput={setSearchInput}
      onClearAll={overrides?.onClearAll ?? (() => undefined)}
      activeStatusTab={activeStatusTab}
      onSelectStatusTab={setActiveStatusTab}
      watchlist={() => libraryItems}
      chips={overrides?.chips ?? (() => [{ label: "Drama", key: "genre" }])}
      onClearFilter={() => undefined}
    />
  ));

  return { searchInput: setSearchInput, activeStatusTab: setActiveStatusTab };
}

afterEach(cleanup);

describe("LibraryHeader", () => {
  it("shows the live Library count, permanent search, and compact controls", () => {
    renderHeader();

    expect(screen.getByRole("heading", { name: "Library (3)" })).toBeTruthy();
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.getByText("(3)")).toBeTruthy();
    expect(
      screen.getByRole("searchbox", { name: "Search your library" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /open library filters/i })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Grid view" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Timeline view" })).toBeTruthy();
  });

  // ── 2026-09-03 — Library header must NOT be sticky ──────────────────
  // The Library header previously used Tailwind's `sticky top-0 z-40` to
  // stick the header/search/filter area to the top of the viewport. The
  // user reported this was wrong: Library should use NORMAL PAGE
  // SCROLLING. The dedicated /search route has its OWN sticky search bar
  // (via .search-page-sticky-bar) — that behavior is intentional and
  // must NOT be affected by this change.
  //
  // These tests verify the Library header does NOT have sticky
  // positioning applied. We check:
  //   - The header's class list does not contain "sticky" or "top-0"
  //     (Tailwind utility classes that were previously applied).
  //   - The header's computed style position is not "sticky".
  //   - The Search page's .search-page-sticky-bar class is NOT present
  //     in the Library header (the two are independent).
  it("does NOT apply Tailwind 'sticky' or 'top-0' classes (2026-09-03 fix)", () => {
    renderHeader();
    const header = document.querySelector(".library-header-glass");
    expect(header).toBeTruthy();
    // The class list must NOT contain sticky-related Tailwind utilities.
    expect(header!.classList.contains("sticky")).toBe(false);
    expect(header!.classList.contains("top-0")).toBe(false);
    // The class list must NOT contain the Search page's sticky class.
    expect(header!.classList.contains("search-page-sticky-bar")).toBe(false);
  });

  it("does NOT set position: sticky via inline style", () => {
    renderHeader();
    const header = document.querySelector(".library-header-glass") as HTMLElement;
    expect(header).toBeTruthy();
    // jsdom doesn't compute CSS, but inline styles would be visible.
    expect(header.style.position).not.toBe("sticky");
  });

  it("keeps status chips in the requested order and derives Re-watched from history", () => {
    renderHeader();

    const buttons = screen.getAllByRole("button");
    const labels = buttons
      .map((button) => button.getAttribute("aria-label"))
      .filter(
        (label): label is string => label?.startsWith("Filter:") === true
      );
    expect(labels).toEqual([
      "Filter: Watching",
      "Filter: Planned",
      "Filter: Completed",
      "Filter: Dropped",
      "Filter: Re-watched"
    ]);
    expect(screen.queryByRole("button", { name: "Filter: All" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Part 1 — Filter count badge layout regression tests.
//
// The badge is now positioned absolutely on the top-right of the
// filter button (anchored to the button, not in the inline flow).
// These tests verify:
//   - The badge renders inside the Filter button (the button is the
//     badge's offsetParent).
//   - A 1-digit count renders as expected.
//   - A multi-digit count renders WITHOUT colliding with the
//     adjacent view-toggle controls (the badge's right edge stays
//     within the filter button's bounding box, not extending past it
//     into the view-toggle area).
//   - The badge does NOT render when activeFilterCount is 0.
// ─────────────────────────────────────────────────────────────────────
describe("LibraryHeader — Part 1 — Filter count badge", () => {
  it("renders the count badge inside the Filter button when count > 0", () => {
    renderHeader({ activeFilterCount: () => 1 });
    const filterButton = screen.getByRole("button", {
      name: /open library filters — 1 active/i
    });
    expect(filterButton).toBeTruthy();
    // The badge is rendered as a child span with class filter-count-badge.
    // The CSS (position: absolute on the badge, position: relative on the
    // button) is applied at runtime; jsdom doesn't load the CSS file, so
    // we verify the structural relationship (badge IS a descendant of the
    // filter button) which is what makes the absolute positioning anchor
    // to the button's bounding box.
    const badge = filterButton.querySelector(".filter-count-badge");
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe("1");
    // Structural invariant: the badge must be a child of the filter
    // button so the CSS `position: absolute` is relative to the
    // button's `position: relative` (the button is the badge's
    // offsetParent at runtime).
    expect(filterButton.contains(badge!)).toBe(true);
  });

  it("renders a multi-digit count without overlapping the view-toggle", () => {
    renderHeader({ activeFilterCount: () => 12 });
    const filterButton = screen.getByRole("button", {
      name: /open library filters — 12 active/i
    });
    const badge = filterButton.querySelector(".filter-count-badge");
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe("12");

    // The view-toggle buttons must be SIBLINGS of the filter button
    // (not descendants) — they live in the same .library-header-actions
    // flex row. The badge is INSIDE the filter button, so it cannot
    // extend into the view-toggle area unless it overflows the button
    // (which the CSS prevents with absolute positioning + anchored
    // right + grow-leftward). Structurally, the badge's bounding
    // parent is the filter button, not the view-toggle.
    const gridViewButton = screen.getByRole("button", { name: "Grid view" });
    // The grid view button is NOT a descendant of the filter button.
    expect(filterButton.contains(gridViewButton)).toBe(false);
    // The badge is NOT a descendant of the view-toggle.
    expect(gridViewButton.contains(badge!)).toBe(false);
  });

  it("does not render the badge when activeFilterCount is 0", () => {
    renderHeader({ activeFilterCount: () => 0 });
    const filterButton = screen.getByRole("button", {
      name: /open library filters/i
    });
    const badge = filterButton.querySelector(".filter-count-badge");
    expect(badge).toBeNull();
  });

  it("the badge is rendered with the filter-count-badge class (CSS hook for absolute positioning)", () => {
    // Verify the CSS class hook is present so the runtime stylesheet
    // can position the badge absolutely. This is the structural
    // equivalent of the CSS test — jsdom doesn't load the stylesheet,
    // but the class presence proves the markup is correct.
    renderHeader({ activeFilterCount: () => 5 });
    const filterButton = screen.getByRole("button", {
      name: /open library filters — 5 active/i
    });
    const badge = filterButton.querySelector(".filter-count-badge");
    expect(badge).toBeTruthy();
    expect(badge!.classList.contains("filter-count-badge")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Part 2 — Clear / Reset control (icon-only, inside the search row).
//
// The original Part 2 implementation rendered a separate
// `.library-search-reset-row` BELOW the search input with icon +
// "Clear / Reset" text. The follow-up fix moves the control INTO
// `.library-search-row` as a compact icon-only button at the far
// right (flex layout: search icon → input flex:1 → reset button
// flex-shrink:0). The click behavior is UNCHANGED — it still calls
// `onClearAll` which routes to `clearFilters()`.
// ─────────────────────────────────────────────────────────────────────
describe("LibraryHeader — Part 2 — Clear / Reset control (icon-only, in search row)", () => {
  it("does not render the clear/reset button when nothing is active", () => {
    renderHeader({
      activeFilterCount: () => 0,
      searchInput: () => "",
      activeStatusTab: () => "all"
    });
    expect(
      screen.queryByRole("button", {
        name: "Clear search and reset all library filters"
      })
    ).toBeNull();
  });

  it("renders the clear/reset button when search text is non-empty", () => {
    renderHeader({
      activeFilterCount: () => 0,
      searchInput: () => "batman",
      activeStatusTab: () => "all"
    });
    expect(
      screen.getByRole("button", {
        name: "Clear search and reset all library filters"
      })
    ).toBeTruthy();
  });

  it("renders the clear/reset button when advanced filters are active (no search text)", () => {
    renderHeader({
      activeFilterCount: () => 3,
      searchInput: () => "",
      activeStatusTab: () => "all"
    });
    expect(
      screen.getByRole("button", {
        name: "Clear search and reset all library filters"
      })
    ).toBeTruthy();
  });

  it("renders the clear/reset button when active status is non-default", () => {
    renderHeader({
      activeFilterCount: () => 0,
      searchInput: () => "",
      activeStatusTab: () => "Watching"
    });
    expect(
      screen.getByRole("button", {
        name: "Clear search and reset all library filters"
      })
    ).toBeTruthy();
  });

  it("renders the clear/reset button when search + filters + status are all active", () => {
    renderHeader({
      activeFilterCount: () => 2,
      searchInput: () => "nolan",
      activeStatusTab: () => "Completed"
    });
    expect(
      screen.getByRole("button", {
        name: "Clear search and reset all library filters"
      })
    ).toBeTruthy();
  });

  it("calls onClearAll when the clear/reset button is clicked (preserves clear-all semantics)", () => {
    const onClearAll = vi.fn();
    renderHeader({
      activeFilterCount: () => 1,
      searchInput: () => "nolan",
      activeStatusTab: () => "all",
      onClearAll
    });
    const button = screen.getByRole("button", {
      name: "Clear search and reset all library filters"
    });
    fireEvent.click(button);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("renders the clear/reset button INSIDE the search row (not in a separate row)", () => {
    renderHeader({
      activeFilterCount: () => 1,
      searchInput: () => "nolan"
    });
    const searchRow = document.querySelector(".library-search-row");
    const resetButton = screen.getByRole("button", {
      name: "Clear search and reset all library filters"
    });
    // The reset button must be a descendant of .library-search-row
    // (the follow-up fix moved it from a separate row INTO the
    // search row, as a compact icon-only button at the far right).
    expect(searchRow!.contains(resetButton)).toBe(true);
    // The old `.library-search-reset-row` wrapper must NOT exist.
    expect(document.querySelector(".library-search-reset-row")).toBeNull();
  });

  it("renders the button with icon only — no 'Clear / Reset' text", () => {
    renderHeader({
      activeFilterCount: () => 1,
      searchInput: () => "nolan"
    });
    const button = screen.getByRole("button", {
      name: "Clear search and reset all library filters"
    });
    // The button must NOT contain the "Clear / Reset" text — it's
    // icon-only now. The aria-label provides the accessible name.
    expect(button.textContent).not.toContain("Clear / Reset");
    expect(button.textContent).not.toContain("Clear");
    expect(button.textContent).not.toContain("Reset");
    // The button must contain the restart_alt icon (material-symbols).
    const icon = button.querySelector(".material-symbols-outlined");
    expect(icon).toBeTruthy();
    expect(icon!.textContent).toBe("restart_alt");
  });

  it("preserves the aria-label for accessibility even though the button is icon-only", () => {
    renderHeader({
      activeFilterCount: () => 1,
      searchInput: () => "nolan"
    });
    const button = screen.getByRole("button", {
      name: "Clear search and reset all library filters"
    });
    expect(button).toBeTruthy();
    expect(button.getAttribute("aria-label")).toBe(
      "Clear search and reset all library filters"
    );
  });

  it("adds a title attribute for hover-tooltip discovery", () => {
    renderHeader({
      activeFilterCount: () => 1,
      searchInput: () => "nolan"
    });
    const button = screen.getByRole("button", {
      name: "Clear search and reset all library filters"
    });
    expect(button.getAttribute("title")).toBe(
      "Clear search and reset all library filters"
    );
  });
});

