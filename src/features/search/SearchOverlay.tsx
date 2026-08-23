// src/features/search/SearchOverlay.tsx
//
// SearchOverlay — a standalone contextual search surface rendered by AppShell.
// The first-class /search route owns normal Search browsing. This component is
// intentionally limited to explicit overlay sessions so retained Search state
// cannot appear beneath a dedicated title route or another primary page.
//
// KEY BEHAVIOUR:
//   • The dedicated /search route is the primary catalog-search surface.
//   • A programmatic caller may still open this overlay for contextual search;
//     in that case it renders its own input and shared SearchResults.
//   • A shared query alone never mounts the overlay.
//   • Renders SearchResults directly — no dependency on DiscoverPage.
//   • Clicking a result opens the canonical dedicated title route.
//   • Scrolling the overlay does NOT scroll the page behind it.

import { Show, type Component, type JSX } from "solid-js";
import { useGlobalSearch } from "~/shared/contexts/SearchContext";
import { useLocation } from "@solidjs/router";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useDiscoverActions } from "~/features/discover/useDiscoverActions";
import { shouldRenderSearchOverlay } from "~/shared/utils/searchNavigation";
import SearchResults from "./SearchResults";

// Module-level static style for the in-overlay search input row.
// Kept out of the component body so each overlay mount doesn't
// re-allocate the object.
const OVERLAY_INPUT_WRAPPER_STYLE: JSX.CSSProperties = {
  display: "flex",
  "align-items": "center",
  gap: "0.625rem",
  padding: "0.625rem 0",
  "margin-bottom": "0.5rem",
  "border-bottom": "1px solid var(--hairline)"
};
const OVERLAY_INPUT_STYLE: JSX.CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--text-strong)",
  "font-family": "'Outfit', sans-serif",
  "font-size": "1rem",
  "font-weight": 600
};
const OVERLAY_CLOSE_BTN_STYLE: JSX.CSSProperties = {
  display: "inline-flex",
  "align-items": "center",
  "justify-content": "center",
  width: "36px",
  height: "36px",
  "border-radius": "var(--radius-pill)",
  background: "var(--glass-bg)",
  border: "1px solid var(--hairline-2)",
  color: "var(--text-soft)",
  cursor: "pointer",
  "flex-shrink": 0
};

/**
 * SearchOverlay — renders contextual results only while explicitly open.
 * Rendered in AppShell (not DiscoverPage) so programmatic callers can still
 * use it without making the first-class /search route an overlay.
 */
const SearchOverlay: Component = () => {
  const search = useGlobalSearch();
  const location = useLocation();
  const { watchlist, isGuest } = useUserLibrary();
  const { handleOpenTitle, addToVault } = useDiscoverActions({
    watchlist,
    isGuest
  });

  // The dedicated /search route owns the query/results surface. This global
  // overlay is reserved for explicit contextual callers; a retained query
  // alone must never recreate an overlay above Detail or another page.
  const shouldRender = () =>
    shouldRenderSearchOverlay(location.pathname, search.searchOpen());

  // Whether to show the in-overlay search input. Shown ONLY when the
  // overlay was opened via searchOpen() (mobile path). On desktop,
  // searchOpen() is false and the inline bar is the input — showing
  // a second input here would be redundant.
  const showOverlayInput = () => search.searchOpen();

  return (
    <Show when={shouldRender()}>
      <div class="search-overlay">
        <div class="search-overlay-content">
          {/* Contextual overlay input. The dedicated /search route owns the
              primary search surface; this input remains available only for
              programmatic overlay callers. */}
          <Show when={showOverlayInput()}>
            <div
              class="search-overlay-input-wrapper"
              style={OVERLAY_INPUT_WRAPPER_STYLE}
            >
              <span
                class="material-symbols-outlined"
                style={{
                  color: "var(--p)",
                  "font-size": "22px",
                  "flex-shrink": "0"
                }}
                aria-hidden="true"
              >
                search
              </span>
              <input
                type="search"
                class="search-overlay-input"
                style={OVERLAY_INPUT_STYLE}
                placeholder="Search movies, series, anime…"
                value={search.query()}
                onInput={(e) => search.setQuery(e.currentTarget.value)}
                // Autofocus when a contextual caller opens the overlay.
                autofocus
                autocomplete="off"
                spellcheck={false}
                aria-label="Search movies, series, and anime"
              />
              <button
                type="button"
                class="search-overlay-close focus-ring"
                style={OVERLAY_CLOSE_BTN_STYLE}
                onClick={() => search.closeSearch()}
                aria-label="Close search"
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "20px" }}
                  aria-hidden="true"
                >
                  close
                </span>
              </button>
            </div>
          </Show>

          <SearchResults
            loading={search.loading}
            error={search.error}
            query={search.query}
            results={search.results}
            isInVault={search.isInVault}
            onOpenTitle={(t) => {
              // Close the overlay when a result is opened so the
              // user lands on the details modal without the overlay
              // obscuring it. This mirrors the desktop behavior
              // where opening a title clears the search.
              search.closeSearch();
              handleOpenTitle(t);
            }}
            onAddToVault={addToVault}
            onRetry={search.retrySearch}
            animeResults={search.animeResults}
            animeLoading={search.animeLoading}
          />
        </div>
      </div>
    </Show>
  );
};

export default SearchOverlay;
