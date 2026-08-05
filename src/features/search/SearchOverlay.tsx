// src/features/search/SearchOverlay.tsx
//
// SearchOverlay — a standalone search results overlay that renders
// INDEPENDENTLY from DiscoverPage. It floats above the current page
// (whichever page the user is on) when there is an active search query.
//
// KEY BEHAVIOUR:
//   • Shows when search.hasQuery() is true (i.e. the user has typed
//     something in the desktop inline search bar).
//   • Renders SearchResults directly — no dependency on DiscoverPage.
//   • Clicking a result opens the details modal (same as Discover).
//   • The overlay sits below the header search bar.
//   • Scrolling the overlay does NOT scroll the page behind it.
//
// PHASE 10 CHUNK 1 NOTE:
//   Previously the overlay required `search.searchOpen() && hasQuery()`.
//   The `searchOpen()` flag was driven by the mobile slide-down bar's
//   open/close state — which has been removed. The desktop inline bar
//   now drives the overlay directly: typing shows results, clearing
//   the query hides them. On mobile, search is reached via /discover
//   (separate context), so hasQuery() is only true on desktop.

import {
  Show,
  type Component
} from "solid-js";
import { useGlobalSearch } from "~/shared/contexts/SearchContext";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useDiscoverActions } from "~/features/discover/useDiscoverActions";
import SearchResults from "./SearchResults";

/**
 * SearchOverlay — renders search results when the global search has
 * an active query. Rendered in AppShell (not DiscoverPage), so it
 * works from ANY page.
 */
const SearchOverlay: Component = () => {
  const search = useGlobalSearch();
  const { watchlist, isGuest } = useUserLibrary();
  const { handleOpenTitle, addToVault } = useDiscoverActions({
    watchlist,
    isGuest
  });

  return (
    <Show when={search.hasQuery()}>
      <div class="search-overlay">
        <div class="search-overlay-content">
          <SearchResults
            loading={search.loading}
            error={search.error}
            query={search.query}
            results={search.results}
            isInVault={search.isInVault}
            onOpenTitle={handleOpenTitle}
            onAddToVault={addToVault}
            animeResults={search.animeResults}
            animeLoading={search.animeLoading}
          />
        </div>
      </div>
    </Show>
  );
};

export default SearchOverlay;
