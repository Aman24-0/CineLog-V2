import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import type { VaultFilters, WatchlistItem } from "~/shared/types";
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
  const [filters, setFilters] = createSignal({} as VaultFilters);

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
      filters={filters}
      setFilters={setFilters}
    />
  ));
}

afterEach(cleanup);

describe("LibraryHeader", () => {
  it("shows the live Library count, permanent search, and compact controls", () => {
    renderHeader();

    expect(screen.getByRole("heading", { name: "Library" })).toBeTruthy();
    expect(screen.getByLabelText("3 titles in your library").textContent).toBe("3");
    expect(screen.getByRole("searchbox", { name: "Search your library" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /open library filters/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Grid view" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Timeline view" })).toBeTruthy();
  });

  it("keeps status chips in the requested order and derives Re-watched from history", () => {
    renderHeader();

    const labels = screen.getAllByRole("tab").map(
      (tab) => tab.querySelector(".quick-filter-tab-label")?.textContent
    );
    expect(labels).toEqual([
      "All",
      "Watching",
      "Planned",
      "Completed",
      "Dropped",
      "Re-watched"
    ]);
    const rewatchedTab = screen
      .getAllByRole("tab")
      .find((tab) => tab.textContent?.includes("Re-watched"));
    expect(rewatchedTab?.textContent).toContain("1");
  });
});
