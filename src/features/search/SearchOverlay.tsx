// src/features/search/SearchOverlay.tsx
//
// SearchOverlay — a standalone search results overlay that renders
// INDEPENDENTLY from DiscoverPage. It floats above the current page
// (whichever page the user is on) when the global search is open.
//
// KEY BEHAVIOUR:
//   • Shows when searchOpen() is true
//   • Renders SearchResults directly — no dependency on DiscoverPage
//   • Clicking a result opens the details modal (same as Discover)
//   • The overlay sits below the header search bar
//   • Scrolling the overlay does NOT scroll the page behind it

import {
  Show,
  type Component
} from "solid-js";
import { useGlobalSearch } from "~/shared/contexts/SearchContext";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useDiscoverActions } from "~/features/discover/useDiscoverActions";
import SearchResults from "./SearchResults";

/**
 * SearchOverlay — renders search results when the global search is active.
 *
 * This component is rendered in AppShell (not DiscoverPage), so it works
 * from ANY page. It uses the global search context for state and the
 * discover actions for opening titles / adding to vault.
 */
const SearchOverlay: Component = () => {
  const search = useGlobalSearch();
  const { watchlist, isGuest } = useUserLibrary();
  const { handleOpenTitle, addToVault } = useDiscoverActions({
    watchlist,
    isGuest
  });

  return (
    <Show when={search.searchOpen() && search.hasQuery()}>
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
