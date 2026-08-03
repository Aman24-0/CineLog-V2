// src/shared/contexts/SearchContext.tsx
//
// SearchContext — shared search state for the global AppHeader search bar
// and the DiscoverPage search results.
//
// WHY: The search bar moved from DiscoverPage into the global AppHeader.
// Both components need access to the same search state (query, results,
// loading, etc.) without prop drilling. This context provides a single
// instance of `useSearch` that both can consume.
//
// USAGE:
//   <SearchProvider>  ← wraps the app (inside UserLibraryProvider)
//     <AppHeader />   ← consumes useGlobalSearch() for the search bar
//     <DiscoverPage />← consumes useGlobalSearch() for search results
//   </SearchProvider>

import {
  createContext,
  useContext,
  createSignal,
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
// Mirrors the return type of useSearch() exactly so consumers can't
// tell the difference between the context and a direct hook call.
interface SearchContextValue {
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
  // Extra: search bar open/close state for the AppHeader expand/collapse
  searchOpen: Accessor<boolean>;
  setSearchOpen: (open: boolean) => void;
  toggleSearch: () => void;
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

  // Search bar open/close state — used by AppHeader for the expand/collapse
  // animation. When the user clicks the search icon, this flips to true
  // and the search bar expands. Clicking outside or pressing Escape
  // collapses it.
  const [searchOpen, setSearchOpen] = createSignal(false);
  const toggleSearch = () => setSearchOpen((v) => !v);

  const value: SearchContextValue = {
    ...search,
    searchOpen,
    setSearchOpen,
    toggleSearch
  };

  return (
    <SearchContext.Provider value={value}>
      {props.children}
    </SearchContext.Provider>
  );
};
