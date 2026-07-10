// src/features/search/SearchPage.tsx
import { Show, createSignal, onMount } from "solid-js";
import { useVault } from "~/features/watchlist/useVault";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { getClient } from "~/lib/supabase/client";
import { createVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";
import { useSearch } from "./useSearch";
import SearchHeader from "./SearchHeader";
import SearchGrid from "./SearchGrid";
import SearchResults from "./SearchResults";
import SearchFilters from "./SearchFilters";

/**
 * SearchPage — CineLog's intentional discovery-by-query experience.
 *
 * DESIGN PHILOSOPHY:
 *   Search is the INTENTIONAL path; Discover is the SERENDIPITOUS path.
 *   Discover says "here's something you might love"; Search says "find
 *   me this specific thing". They must feel different.
 *
 * COLD START (no query):
 *   - Search bar (autofocus)
 *   - Recent searches rail (last 8, from localStorage)
 *   - Trending this week rail (TMDB trending, vault-aware)
 *   - Browse by genre grid (8 genre pills → genre browse)
 *
 * ACTIVE QUERY (≥2 chars, debounced 250ms):
 *   - Results grouped into Movies / Series
 *   - Each result is a horizontal row with poster + title + year + type
 *
 * GENRE BROWSE MODE:
 *   - Flat paginated list of titles in the selected genre
 *   - Infinite scroll via loadMoreGenre
 *
 * This component is orchestration-only — all rendering lives in
 * SearchHeader, SearchGrid, SearchResults, SearchFilters, and the
 * SearchEmptyState / SearchLoading helpers.
 */
export default function SearchPage() {
  const { watchlist, isGuest } = useVault();
  const { showToast } = useToast();
  const { openTitle } = useModalState();

  const {
    query,
    setQuery,
    results,
    loading,
    error,
    recentSearches,
    trending,
    trendingLoading,
    commitSearch,
    removeRecent,
    clearRecent,
    isInVault,
    hasQuery,
    genreBrowse,
    browseGenre,
    loadMoreGenre,
    clearGenre,
    isGenreBrowse,
  } = useSearch({ vault: watchlist });

  const [searchInputEl, setSearchInputEl] = createSignal<HTMLInputElement | null>(null);

  onMount(() => {
    setTimeout(() => searchInputEl()?.focus(), 100);
  });

  const handleOpenTitle = (title: TMDBTitle) => {
    const baseItem: WatchlistItem = {
      id: String(title.id),
      title: title.title,
      name: title.name,
      media_type: title.media_type,
      poster_path: title.poster_path,
      backdrop_path: title.backdrop_path,
      status: "Planned",
      release_date: title.release_date,
      first_air_date: title.first_air_date,
      genresList: title.genres,
    };
    openTitle(baseItem, watchlist());
  };

  const handleAddToVault = async (title: TMDBTitle) => {
    const uid = getCurrentUid();
    if (!uid) {
      showToast("Sign in to save titles to your vault.", "error");
      return;
    }
    if (isGuest()) {
      try {
        const supabase = getClient();
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo:
              typeof window !== "undefined" ? window.location.origin : undefined,
          },
        });
        if (error) throw error;
        showToast("Signed in — try saving again.", "success");
      } catch {
        showToast("Sign in failed. Please try again.", "error");
      }
      return;
    }
    try {
      const item: WatchlistItem = {
        id: String(title.id),
        title: title.title,
        name: title.name,
        media_type: title.media_type,
        poster_path: title.poster_path ?? undefined,
        backdrop_path: title.backdrop_path ?? undefined,
        status: "Planned",
        release_date: title.release_date,
        first_air_date: title.first_air_date,
        genresList: title.genres,
        director: title.director,
      };
      await createVaultItemInSupabase(uid, item);
      const name = title.title || title.name || "Title";
      showToast(`Added "${name}" to your vault`, "success", 1800);
    } catch (err) {
      console.error("Failed to add to vault:", err);
      showToast("Failed to save. Try again.", "error");
    }
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    commitSearch(query());
  };

  const handleRecentClick = (q: string) => {
    setQuery(q);
    commitSearch(q);
  };

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />

      <SearchHeader
        query={query}
        isGuest={isGuest}
        inputRef={setSearchInputEl}
        onQueryChange={setQuery}
        onSubmit={handleSubmit}
        onClear={() => {
          setQuery("");
          searchInputEl()?.focus();
        }}
      />

      {/* Genre browse mode OR text-search results OR cold-start state */}
      <Show when={isGenreBrowse()} fallback={
        <Show when={hasQuery()} fallback={
          <SearchGrid
            recentSearches={recentSearches}
            trending={trending}
            trendingLoading={trendingLoading}
            isInVault={isInVault}
            onRecentClick={handleRecentClick}
            onRemoveRecent={removeRecent}
            onClearRecent={clearRecent}
            onOpenTitle={handleOpenTitle}
            onBrowseGenre={browseGenre}
          />
        }>
          <SearchResults
            loading={loading}
            error={error}
            query={query}
            results={results}
            isInVault={isInVault}
            onOpenTitle={handleOpenTitle}
            onAddToVault={handleAddToVault}
          />
        </Show>
      }>
        <SearchFilters
          genreBrowse={genreBrowse}
          isInVault={isInVault}
          onClearGenre={clearGenre}
          onLoadMore={loadMoreGenre}
          onOpenTitle={handleOpenTitle}
          onAddToVault={handleAddToVault}
        />
      </Show>
    </PageContainer>
  );
}
