import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import LibraryHeader from "../LibraryHeader";

const libraryItems = [
  { status: "Watching" },
  { status: "Completed", rewatchCount: 1 },
  { status: "Planned" }
] as WatchlistItem[];

function renderHeader() {
  const [viewMode, setViewMode] = createSignal<"grid" | "timeline">("grid");
  const [activeStatusTab, setActiveStatusTab] = createSignal("all");
  const [searchInput, setSearchInput] = createSignal("");

  render(() => (
    <LibraryHeader
      viewMode={viewMode}
      setViewMode={setViewMode}
      activeFilterCount={() => 2}
      onFilterClick={() => undefined}
      searchInput={searchInput}
      onSearchInput={setSearchInput}
      onClearAll={() => undefined}
      activeStatusTab={activeStatusTab}
      onSelectStatusTab={setActiveStatusTab}
      watchlist={() => libraryItems}
      chips={() => [{ label: "Drama", key: "genre" }]}
      onClearFilter={() => undefined}
    />
  ));
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
