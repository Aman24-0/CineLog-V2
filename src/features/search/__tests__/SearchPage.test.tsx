import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";

const [query, setQuery] = createSignal("");
const [hasQuery, setHasQuery] = createSignal(false);
const runSearchNow = vi.fn((value: string) => {
  setQuery(value);
  setHasQuery(value.trim().length >= 2);
});
const clearQuery = vi.fn(() => {
  setQuery("");
  setHasQuery(false);
});
const commitSearch = vi.fn();

vi.mock("~/shared/contexts/SearchContext", () => ({
  useGlobalSearch: () => ({
    query,
    setQuery,
    runSearchNow,
    clearQuery,
    retrySearch: vi.fn(),
    debouncedQuery: query,
    hasQuery,
    results: () => ({ movies: [], series: [], people: [], totalCount: 0 }),
    loading: () => false,
    error: () => null,
    recentSearches: () => [],
    trending: () => [],
    trendingLoading: () => false,
    commitSearch,
    removeRecent: vi.fn(),
    clearRecent: vi.fn(),
    isInVault: () => false,
    genreBrowse: () => ({ genre: null }),
    browseGenre: vi.fn(),
    loadMoreGenre: vi.fn(),
    clearGenre: vi.fn(),
    isGenreBrowse: () => false,
    animeResults: () => [],
    animeLoading: () => false,
    searchOpen: () => false,
    openSearch: vi.fn(),
    closeSearch: vi.fn()
  })
}));

vi.mock("~/shared/hooks/useUserLibrary", () => ({
  useUserLibrary: () => ({
    watchlist: () => [],
    isGuest: () => true
  })
}));

vi.mock("~/features/discover/useDiscoverActions", () => ({
  useDiscoverActions: () => ({
    handleOpenTitle: vi.fn(),
    addToVault: vi.fn()
  })
}));

vi.mock("~/shared/ui/PageContainer", () => ({
  default: (props: { children: unknown }) => <>{props.children}</>
}));

vi.mock("../SearchResults", () => ({
  default: () => <div data-testid="search-results" />
}));

vi.mock("../SearchResultRow", () => ({
  default: () => <div data-testid="trending-result" />
}));

const { default: SearchPage } = await import("../SearchPage");

describe("SearchPage", () => {
  beforeEach(() => {
    setQuery("");
    setHasQuery(false);
    runSearchNow.mockClear();
    clearQuery.mockClear();
    commitSearch.mockClear();
  });

  afterEach(cleanup);

  it("keeps the dedicated page intentionally simple with Trending below the search field", () => {
    render(() => <SearchPage />);

    expect(screen.getByRole("heading", { name: "Search" })).toBeTruthy();
    expect(
      screen.getByRole("searchbox", {
        name: "Search movies, series, people, or anime"
      })
    ).toBeTruthy();
    expect(screen.getByText("Trending this week")).toBeTruthy();
    expect(screen.queryByText("DISCOVERY")).toBeNull();
    expect(screen.queryByText(/Find movies, series/)).toBeNull();
  });

  it("submits through the shared immediate-search path and clears back to the cold-start state", () => {
    render(() => <SearchPage />);
    const input = screen.getByRole("searchbox", {
      name: "Search movies, series, people, or anime"
    });
    const form = input.closest("form");
    expect(form).toBeTruthy();

    fireEvent.input(input, { target: { value: "batman" } });
    fireEvent.submit(form!);

    expect(runSearchNow).toHaveBeenCalledWith("batman");
    expect(commitSearch).toHaveBeenCalledWith("batman");

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(clearQuery).toHaveBeenCalledTimes(1);
  });
});
