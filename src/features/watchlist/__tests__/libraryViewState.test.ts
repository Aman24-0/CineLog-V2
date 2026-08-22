import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLibraryViewState,
  readLibraryViewState,
  writeLibraryViewState
} from "../libraryViewState";
import { makeVaultFilters } from "~/__test-fixtures__/factories";

beforeEach(() => {
  sessionStorage.clear();
});

describe("library view state", () => {
  it("round-trips Library presentation state without touching user data", () => {
    const filters = makeVaultFilters({ status: "Completed", genre: "Drama" });
    writeLibraryViewState({
      searchInput: "Alien",
      filters,
      activeStatusTab: "Completed",
      viewMode: "timeline",
      displayLimit: 80,
      expandedShelves: ["recently-completed"],
      filterCollapsed: true
    });

    expect(readLibraryViewState()).toEqual({
      searchInput: "Alien",
      filters,
      activeStatusTab: "Completed",
      viewMode: "timeline",
      displayLimit: 80,
      expandedShelves: ["recently-completed"],
      filterCollapsed: true
    });
  });

  it("returns safe defaults for malformed session state", () => {
    sessionStorage.setItem("cinelog.library-view.v1", "not-json");
    const state = readLibraryViewState();
    expect(state.searchInput).toBe("");
    expect(state.activeStatusTab).toBe("all");
    expect(state.viewMode).toBe("grid");
    expect(state.displayLimit).toBe(20);
  });

  it("bounds display pagination and clears only the view-state key", () => {
    const state = readLibraryViewState();
    writeLibraryViewState({ ...state, displayLimit: 999999, searchInput: "x".repeat(500) });
    const stored = readLibraryViewState();
    expect(stored.displayLimit).toBe(2000);
    expect(stored.searchInput).toHaveLength(200);

    sessionStorage.setItem("cinelog.user-library.fixture", "preserved");
    clearLibraryViewState();
    expect(sessionStorage.getItem("cinelog.library-view.v1")).toBeNull();
    expect(sessionStorage.getItem("cinelog.user-library.fixture")).toBe("preserved");
  });
});
