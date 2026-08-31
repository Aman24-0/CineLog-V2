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
const beginDetailNavigation = vi.fn();
const searchParams: { q?: string } = {};
const setSearchParams = vi.fn((params: { q?: string }) => {
  if (params.q === undefined) delete searchParams.q;
  else searchParams.q = params.q;
});

vi.mock("@solidjs/router", () => ({
  useSearchParams: () => [searchParams, setSearchParams]
}));

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
    closeSearch: vi.fn(),
    beginDetailNavigation,
    searchSessionInvalidated: () => false,
    consumeInvalidatedSearchSession: () => false
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
  default: (props: {
    onOpenTitle: (title: {
      id: number;
      title: string;
      media_type: "movie";
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="open-search-result"
      onClick={() =>
        props.onOpenTitle({
          id: 101,
          title: "Fixture Movie",
          media_type: "movie"
        })
      }
    >
      Open fixture result
    </button>
  )
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
    beginDetailNavigation.mockClear();
    setSearchParams.mockClear();
    delete searchParams.q;
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

  it("hydrates a query from the canonical URL", () => {
    searchParams.q = "inception";
    render(() => <SearchPage />);

    expect(runSearchNow).toHaveBeenCalledWith("inception");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
      "inception"
    );
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
    expect(setSearchParams).toHaveBeenCalledWith(
      { q: "batman" },
      { replace: true }
    );

    fireEvent.click(screen.getByTestId("open-search-result"));
    expect(beginDetailNavigation).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(clearQuery).toHaveBeenCalledTimes(1);
    expect(setSearchParams).toHaveBeenLastCalledWith(
      { q: undefined },
      { replace: true }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2026-09-03 — Search page sticky bar regression tests.
//
// The dedicated /search route has its OWN sticky search bar via the
// .search-page-sticky-bar class (defined in src/styles/features/search.css).
// This is INTENTIONAL and must NOT be affected by the Library header
// sticky removal (the Library header used Tailwind's `sticky top-0 z-40`,
// which is a completely separate mechanism).
//
// These tests verify:
//   - The Search page renders the .search-page-sticky-bar wrapper.
//   - The .search-page-sticky-bar class is present (the CSS hook for
//     position: sticky).
//   - The Library's .library-header-glass class is NOT present on the
//     Search page (the two are independent).
// ─────────────────────────────────────────────────────────────────────
describe("SearchPage — sticky search bar (2026-09-03 regression)", () => {
  beforeEach(() => {
    setQuery("");
    setHasQuery(false);
    delete searchParams.q;
  });
  afterEach(cleanup);

  it("renders the .search-page-sticky-bar wrapper around the search input", () => {
    render(() => <SearchPage />);
    const stickyBar = document.querySelector(".search-page-sticky-bar");
    expect(stickyBar).toBeTruthy();
    // The search input must be inside the sticky bar wrapper.
    const input = screen.getByRole("searchbox", {
      name: "Search movies, series, people, or anime"
    });
    expect(stickyBar!.contains(input)).toBe(true);
  });

  it("does NOT render the Library header on the Search page", () => {
    render(() => <SearchPage />);
    // The Library's .library-header-glass must NOT be present on /search.
    expect(document.querySelector(".library-header-glass")).toBeNull();
  });
});
