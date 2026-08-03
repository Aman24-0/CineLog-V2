// src/shared/contexts/SearchContext.tsx
//
// SearchContext — INDEPENDENT global search overlay state.
//
// Search is an application-level feature, NOT a Discover feature.
// It works from ANY page without navigating away.
//
// KEY BEHAVIOUR:
//   • openSearch() — opens the overlay, focuses the input
//   • closeSearch() — closes the overlay, CLEARS everything:
//     query, results, focus, scroll position. Every new search
//     starts completely clean.
//   • The search overlay renders its own results independently.
//   • DiscoverPage does NOT render search results.
//   • The overlay is a Portal — it floats above the current page.
//
// ARCHITECTURE:
//   <SearchProvider> wraps the app (inside UserLibraryProvider).
//   AppHeader consumes it for the search icon + overlay trigger.
//   The SearchOverlay component (rendered in AppShell) consumes
//   it for the search bar + results.

import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  onCleanup,
  type Component,
  type JSX
} from "solid-js";
import { useSearch } from "~/features/search/useSearch";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import type { Accessor } from "solid-js";
import type {
  SearchResults as SearchResultsType,
  GenreBrowseState
} from "~/features/search/useSearch";
import type { TMDBTitle } from "~/shared/types";

// ── Shape of the context value ──────────────────────────────────────
interface SearchContextValue {
  // Search hook state
  query: Accessor<string>;
  setQuery: (q: string) => void;
  debouncedQuery: Accessor<string>;
  results: Accessor<SearchResultsType>;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  recentSearches: Accessor<string[]>;
  trending: Accessor<TMDBTitle[]>;
  trendingLoading: Accessor<boolean>;
  commitSearch: (q: string) => void;
  removeRecent: (q: string) => void;
  clearRecent: () => void;
  isInVault: (title: TMDBTitle) => boolean;
  hasQuery: Accessor<boolean>;
  genreBrowse: Accessor<GenreBrowseState>;
  browseGenre: (name: string) => void;
  loadMoreGenre: () => void;
  clearGenre: () => void;
  isGenreBrowse: Accessor<boolean>;
  animeResults: Accessor<TMDBTitle[]>;
  animeLoading: Accessor<boolean>;
  // Overlay state
  searchOpen: Accessor<boolean>;
  /** Open the search overlay. Does NOT navigate. */
  openSearch: () => void;
  /** Close the search overlay AND reset ALL search state. */
  closeSearch: () => void;
}

const SearchContext = createContext<SearchContextValue>();

export function useGlobalSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error(
      "useGlobalSearch must be used within a <SearchProvider>"
    );
  }
  return ctx;
}

export const SearchProvider: Component<{ children: JSX.Element }> = (
  props
) => {
  const { watchlist } = useUserLibrary();

  // Instantiate the search hook ONCE — all consumers share this instance.
  const search = useSearch({ vault: watchlist });

  // Search overlay open/close state
  const [searchOpen, setSearchOpen] = createSignal(false);

  /** Open the search overlay — does NOT navigate to any page. */
  const openSearch = () => {
    setSearchOpen(true);
  };

  /** Close the search overlay AND completely reset the search session.
   *  Destroys: query, results, focus, scroll position.
   *  Every new search starts clean. */
  const closeSearch = () => {
    setSearchOpen(false);
    // Reset all search state — complete session destruction
    search.setQuery("");
    search.clearGenre();
    // Results will be cleared automatically by the useSearch hook
    // when the query is set to "" (hasQuery becomes false)
  };

  // ⌘K keyboard shortcut — open/close search from anywhere
  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (searchOpen()) {
        closeSearch();
      } else {
        openSearch();
      }
    }
    // Escape closes the search overlay
    if (e.key === "Escape" && searchOpen()) {
      closeSearch();
    }
  };

  // Register global keyboard listeners
  createEffect(() => {
    document.addEventListener("keydown", handleGlobalKeyDown);
    onCleanup(() => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    });
  });

  const value: SearchContextValue = {
    ...search,
    searchOpen,
    openSearch,
    closeSearch
  };

  return (
    <SearchContext.Provider value={value}>
      {props.children}
    </SearchContext.Provider>
  );
};
