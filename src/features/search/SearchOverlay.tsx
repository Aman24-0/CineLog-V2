// src/features/search/SearchOverlay.tsx
//
// SearchOverlay — a standalone search results overlay that renders
// INDEPENDENTLY from DiscoverPage. It floats above the current page
// (whichever page the user is on) when the global search is active.
//
// KEY BEHAVIOUR:
//   • The dedicated /search route is the primary catalog-search surface.
//   • A programmatic caller may still open this overlay for contextual search;
//     in that case it renders its own input and shared SearchResults.
//   • A shared query can also render results on non-search routes for legacy
//     contextual callers, but the Discover header no longer owns an input.
//   • Renders SearchResults directly — no dependency on DiscoverPage.
//   • Clicking a result opens the details modal (same as Discover).
//   • Scrolling the overlay does NOT scroll the page behind it.

import { Show, type Component, type JSX } from "solid-js";
import { useGlobalSearch } from "~/shared/contexts/SearchContext";
import { useLocation } from "@solidjs/router";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useDiscoverActions } from "~/features/discover/useDiscoverActions";
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
 * SearchOverlay — renders search results when the global search is
 * active (open OR has a query). Rendered in AppShell (not
 * DiscoverPage), so it works from ANY page.
 */
const SearchOverlay: Component = () => {
  const search = useGlobalSearch();
  const location = useLocation();
  const { watchlist, isGuest } = useUserLibrary();
  const { handleOpenTitle, addToVault } = useDiscoverActions({
    watchlist,
    isGuest
  });

  // The overlay renders when EITHER the user has opened it (mobile
  // tap) OR they have a query (desktop inline bar typing). The
  // `searchOpen()` flag is the master switch — once true, the overlay
  // mounts and stays mounted until closeSearch() is called (which
  // also clears the query). On desktop, searchOpen() is rarely true
  // (the inline bar drives results via hasQuery directly), but we
  // still mount the overlay when hasQuery() is true so desktop users
  // see results without needing to "open" anything.
  const shouldRender = () =>
    location.pathname !== "/search" &&
    (search.searchOpen() || search.hasQuery());

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
