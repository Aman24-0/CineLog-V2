// src/shared/contexts/SearchContext.tsx
//
// SearchContext — INDEPENDENT global search overlay state.
//
// Search is an application-level feature, NOT a Discover feature.
// It works from ANY page without navigating away.
//
// KEY BEHAVIOUR:
//   • The dedicated /search route is the primary catalog-search surface.
//   • openSearch() remains available for contextual overlay callers.
//   • closeSearch() closes the overlay and clears query/results state.
//   • The search overlay renders its own shared results independently.
//   • DiscoverPage does NOT render search results.
//
// ARCHITECTURE:
//   <SearchProvider> wraps the app (inside UserLibraryProvider).
//   SearchPage and SearchOverlay consume the same useSearch instance,
//   so catalog requests and library-aware result actions are not duplicated.

import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  onCleanup,
  type Component,
  type JSX
} from "solid-js";
import { useBeforeLeave } from "@solidjs/router";
import {
  getSearchNavigationIntent,
  isDedicatedDetailPath,
  pathnameFromNavigationTarget
} from "~/shared/utils/searchNavigation";
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
  runSearchNow: (q: string) => void;
  clearQuery: () => void;
  retrySearch: () => void;
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
  /** Mark a Search result → movie/TV detail transition as session-preserving. */
  beginDetailNavigation: () => void;
  /** True while a Search session is being invalidated during route departure. */
  searchSessionInvalidated: Accessor<boolean>;
  /** Consume the one-shot reset marker when a Search route mounts again. */
  consumeInvalidatedSearchSession: () => boolean;
}

const SearchContext = createContext<SearchContextValue>();

export function useGlobalSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error("useGlobalSearch must be used within a <SearchProvider>");
  }
  return ctx;
}

export const SearchProvider: Component<{ children: JSX.Element }> = (props) => {
  const { watchlist } = useUserLibrary();

  // Instantiate the search hook ONCE — all consumers share this instance.
  const search = useSearch({ vault: watchlist });

  // Search overlay open/close state
  const [searchOpen, setSearchOpen] = createSignal(false);
  // True only after the current Search session has entered a dedicated title
  // detail route. It lets the next primary-page departure reset the session
  // while preserving Search → Detail → Back browser history.
  const [searchOriginDetail, setSearchOriginDetail] = createSignal(false);
  // A reset must also invalidate a historical /search?q=… entry. The marker
  // is consumed once when that route mounts again, where the URL key can be
  // removed with normal router replace semantics.
  const [invalidatedSearchSession, setInvalidatedSearchSession] =
    createSignal(false);

  /** Open the search overlay — does NOT navigate to any page. */
  const openSearch = () => {
    setSearchOpen(true);
  };

  const beginDetailNavigation = () => {
    setSearchOriginDetail(true);
  };

  const consumeInvalidatedSearchSession = () => {
    const invalidated = invalidatedSearchSession();
    if (invalidated) setInvalidatedSearchSession(false);
    return invalidated;
  };

  /** Close the search overlay AND completely reset the search session.
   *  Destroys: query, results, focus, scroll position.
   *  Every new search starts clean. */
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchOriginDetail(false);

    // Reset all search state — complete session destruction
    search.clearQuery();
    search.clearGenre();
    // Results will be cleared automatically by the useSearch hook
    // when the query is set to "" (hasQuery becomes false)
  };

  // Search is app-global so its live signals outlive a route component. The
  // router lifecycle is the correct place to distinguish a temporary detail
  // hop from intentionally leaving the Search destination for another page.
  // Search → Detail keeps state for browser Back; every other departure from
  // /search destroys the live session before the destination mounts.
  useBeforeLeave(({ from, to }) => {
    const intent = getSearchNavigationIntent(from.pathname, to);
    const toPathname = pathnameFromNavigationTarget(to);

    if (intent === "preserve") {
      setSearchOriginDetail(true);
      return;
    }

    const leavingSearchOriginDetail =
      searchOriginDetail() &&
      isDedicatedDetailPath(from.pathname) &&
      toPathname !== null &&
      !isDedicatedDetailPath(toPathname);

    if (intent === "reset" || leavingSearchOriginDetail) {
      setInvalidatedSearchSession(true);
      closeSearch();
    }
  });

  // Escape closes the search overlay.
  //
  // Search is intentionally not bound to the Discover header. The
  // dedicated /search route owns its input, while this provider keeps the
  // shared request and result state available to the overlay elsewhere.
  const handleGlobalKeyDown = (e: KeyboardEvent) => {
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
    closeSearch,
    beginDetailNavigation,
    searchSessionInvalidated: invalidatedSearchSession,
    consumeInvalidatedSearchSession
  };

  return (
    <SearchContext.Provider value={value}>
      {props.children}
    </SearchContext.Provider>
  );
};
