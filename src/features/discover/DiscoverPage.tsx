// src/features/discover/DiscoverPage.tsx
//
// DiscoverPage — "Your Personal Movie Curator" (Personalized Discovery Engine)
//
// LAYOUT (per the personalized-discovery spec):
//   ┌─────────────────────────────────────────────────────────────┐
//   │ 1. COMMAND CENTER (top bar)                                  │
//   │    • Search bar (merged from the old /search page)           │
//   │    • Genre Explorer (chips + continuous carousel)            │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 2. DAILY ROTATING SPOTLIGHT HERO                             │
//   │    • Daily hash seed picks a featured movie (updates /24h)   │
//   │    • Pure artwork + title + overview + rating + CTAs         │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 3. ROW 1 — "Because you liked [Daily Seed Movie Title]"      │
//   │    • /movie/{seedId}/recommendations                         │
//   │    • Seed rotates daily via FNV-1a hash of {date}:{uid}      │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 4. ROW 2 — "Trending in [User's Top Genre Name]"             │
//   │    • /discover/movie?with_genres={topGenreId}                │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 5. ROW 3 — "NEW ON OTT" + <OttDropdown />                    │
//   │    • Dropdown lists ONLY the user's selected providers       │
//   │    • /discover/movie?with_watch_providers={id}&watch_region  │
//   │    • Fallback: top providers for the user's country          │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 6. ROW 4 — "Weekend Picks & Hidden Gems"                     │
//   │    • /discover/movie?vote_average.gte=7&vote_count.gte=100   │
//   │                       &vote_count.lte=1500                   │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 7. ROW 5 — "Global Pulse"                                    │
//   │    • /trending/all/day                                       │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 8. ROW 6 — "Coming Soon"                                     │
//   │    • /movie/upcoming                                         │
//   │    • "See All" button → /profile/upcoming                    │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 9. GUEST SIGN-IN CTA (guests only)                           │
//   └─────────────────────────────────────────────────────────────┘
//
// PERSONALIZATION ENGINE (usePersonalizedDiscover):
//   • Reads the user's Supabase vault (completed movies rated >= 7.5
//     for the daily seed; all completed items for the top genre).
//   • Daily seed rotates automatically every 24h via a deterministic
//     FNV-1a hash of "{YYYY-MM-DD}:{uid}:{candidateCount}". The same
//     user on the same day always gets the same seed; a new day → a
//     new seed.
//   • Excluded IDs: every tmdb_id in the vault is filtered out of
//     every Discover row — EXCEPT TV shows with an unviewed active
//     season (the "New Season Out" exception), which stay visible and
//     get a "NEW SEASON OUT" badge on their card.
//
// VAULT EXCLUSION + NEW SEASON LOGIC:
//   For each TMDB title returned by a row's fetch:
//     1. If the title's "{media_type}/{id}" is in excludedKeys → filter
//        it out (the user already has it).
//     2. EXCEPTION: if the title is a TV show AND the user has it in
//        their vault AND TMDB reports more seasons than the user has
//        tracked (number_of_seasons > user's tracked season count),
//        KEEP it in the row and show a "NEW SEASON OUT" badge.
//   The New-Season-Out check uses the title's `number_of_seasons`
//   field (TMDB populates this on /discover and /trending responses
//   for TV). When that field is missing, we conservatively skip the
//   exception (filter the title out) — better to hide a stale entry
//   than to falsely badge a show with no new season.
//
// SUSPENSE + ERROR BOUNDARIES:
//   Every new row (Rows 1-6) is wrapped in its own <Suspense> +
//   <ErrorBoundary> so a slow or failed fetch in one row never blocks
//   or breaks the others. Each row renders its own skeleton while
//   loading and a DiscoverEmptyState on error.
//
// FALLBACK (cold start / guest):
//   If the user has no vault signal (guest or empty vault):
//     • Row 1 is hidden (no seed → no recommendations).
//     • Row 2 falls back to "Trending Movies" (topGenreId is null).
//     • Rows 3-6 work the same (they don't depend on personalization).
//
// SEARCH MERGE:
//   The dedicated /search route is gone — search lives at the top of
//   Discover. When the user types ≥2 chars (debounced), the Genre
//   Explorer + Discover sections are temporarily replaced by the
//   search results. Clearing the query restores the Discover layout.

import { createSignal, createMemo, createEffect, Show, For, ErrorBoundary, Suspense, type JSX } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useAuth } from "~/shared/hooks/useAuth";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useDiscoverTaste } from "./hooks/useDiscoverTaste";
import { useSpotlight } from "./hooks/useSpotlight";
import { useDiscoverFeeds } from "./hooks/useDiscoverFeeds";
import { usePersonalizedDiscover, formatTopGenreLabel } from "./hooks/usePersonalizedDiscover";
import { useDiscoverRow } from "./hooks/useDiscoverRow";
import { useDiscoverActions } from "./useDiscoverActions";
import Spotlight from "./components/Spotlight";
import DiscoverRail from "./components/DiscoverRail";
import GenreExplorer from "./components/GenreExplorer";
import OttDropdown from "./components/OttDropdown";
import DiscoverSkeleton from "./components/DiscoverSkeleton";
import DiscoverEmptyState from "./components/DiscoverEmptyState";
import { DiscoverSectionError } from "./components/DiscoverSectionError";
import {
  discoverMovies,
  discoverMoviesWithProvider,
  discoverTvWithProvider,
  getRecommendations,
  getTrending,
  getUpcoming,
} from "~/core/tmdb/discover";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import { streamingProviders } from "~/core/preferences";
import { useFeatureFlags } from "~/lib/featureFlags";
import { useHomepageConfig } from "~/lib/homepageConfig";
import type { TMDBTitle } from "~/shared/types";
// Merged search — the dedicated /search page is gone. Search now lives
// at the top of Discover. We reuse the existing useSearch hook +
// SearchResults component so the search UX is identical to before.
import { useSearch } from "~/features/search/useSearch";
import SearchResults from "~/features/search/SearchResults";

export default function DiscoverPage() {
  const { watchlist, isGuest } = useUserLibrary();
  const { user, authReady } = useAuth();
  const { profile: taste } = useDiscoverTaste({ watchlist, isGuest });

  // Read URL search params so deep links like `/discover?genre=Sci-Fi`
  // can drive the GenreExplorer's initial state. Used by the Statistics
  // page's Top Genres chart — clicking a bar navigates here with the
  // genre name as the `genre` query param.
  const [searchParams] = useSearchParams();
  const initialGenre = createMemo(() => {
    const g = searchParams.genre;
    return typeof g === "string" ? g : undefined;
  });

  // Feature flags + homepage config (admin-controlled per-section visibility).
  const featureFlags = useFeatureFlags();
  const homepageConfig = useHomepageConfig();

  // Region — single source of truth, reactive. Reads the live signal
  // from `useDiscoverRegion()`, so when the user changes their country
  // in Account settings → Country dropdown, every region-aware section
  // picks up the new value automatically without a page reload.
  const region = useDiscoverRegion();

  // === MERGED SEARCH ===
  const {
    query,
    setQuery,
    results,
    loading: searchLoading,
    error: searchError,
    commitSearch,
    isInVault,
    hasQuery,
  } = useSearch({ vault: watchlist });

  const handleSearchSubmit = (e: Event) => {
    e.preventDefault();
    commitSearch(query());
  };

  const showSearchResults = hasQuery;

  // === PERSONALIZATION ENGINE ===
  // Derives: daily seed title, top genre, excluded IDs set, tracked TV
  // seasons (for the New-Season-Out exception). All reactive to the
  // vault AND the current date.
  const personalized = usePersonalizedDiscover(watchlist, isGuest);

  // === SPOTLIGHT (daily rotating hero, personalized) =================
  // The Spotlight hook now owns:
  //   • Daily rotation — caches today's pick per user in localStorage.
  //   • 30-day no-repeat — every shown/shuffled title is recorded and
  //     excluded for 30 days.
  //   • Taste-based selection — uses the strategy chain (because-you-
  //     watched → hidden-gems → genre-deep-dive → acclaimed-fallback
  //     → trending) with the user's TasteProfile.
  //   • Shuffle — adds the current pick to the seen list + fetches a
  //     new one. The new pick becomes today's cached pick.
  // The hook's `pick` signal is reactive, so the SpotlightRenderedIds
  // memo below picks up shuffles automatically and prevents the rest
  // of Discover from repeating the Spotlight title.
  const userId = createMemo(() => user()?.uid ?? null);
  const {
    pick: spotlightPick,
    loading: spotlightLoading,
    error: spotlightError,
    shuffle: shuffleSpotlight,
    retry: retrySpotlight,
  } = useSpotlight({ taste, vault: watchlist, userId, authReady });

  const feeds = useDiscoverFeeds(region);
  const { handleOpenTitle, addToVault, handleLogin } = useDiscoverActions({ watchlist, isGuest });

  // ── VAULT EXCLUSION + NEW SEASON LOGIC ────────────────────────────
  // `excludedKeys` is the set of "{media_type}/{tmdb_id}" keys for
  // every title in the user's vault. `trackedTvSeasons` maps TV
  // tmdb_id → the highest season number the user has tracked.
  //
  // The `filterFeed` helper applies THREE rules:
  //   1. GLOBAL DEDUP: skip any title whose id is in `priorRenderedIds`
  //      (already shown by an earlier row). This prevents the same
  //      title from appearing in multiple Discover rows.
  //   2. VAULT EXCLUSION: skip titles in the vault (using excludedKeys).
  //   3. NEW SEASON EXCEPTION: keep TV titles where TMDB reports more
  //      seasons than the user has tracked (number_of_seasons > tracked).
  //      These get added to `newSeasonBadgeIds` so the rail renders a
  //      "NEW SEASON OUT" badge on them.
  //
  // Returns `{ titles, badgeIds, renderedIds }` where `renderedIds` is
  // the UNION of `priorRenderedIds` and the ids of the kept titles —
  // the next row passes this as its `priorRenderedIds` so the dedup
  // chain accumulates down the page.
  const excludedKeys = personalized.excludedKeys;
  const trackedTvSeasons = personalized.trackedTvSeasons;

  /**
   * Filter a feed of TMDBTitle[] down to titles not already rendered
   * by an earlier row AND not in the user's vault (with the New-Season
   * exception for TV). Returns the filtered titles, the badge ids, and
   * the updated renderedIds set for the next row.
   */
  const filterFeed = (
    titles: TMDBTitle[],
    priorRenderedIds: Set<number> = new Set(),
  ): { titles: TMDBTitle[]; badgeIds: Set<string>; renderedIds: Set<number> } => {
    const vault = excludedKeys();
    const tracked = trackedTvSeasons();
    const badgeIds = new Set<string>();
    // Copy the prior set so we don't mutate the caller's reference.
    const renderedIds = new Set(priorRenderedIds);
    const filtered: TMDBTitle[] = [];
    for (const t of titles) {
      // GLOBAL DEDUP — skip if an earlier row already rendered this id.
      if (renderedIds.has(t.id)) continue;
      const key = `${t.media_type}/${t.id}`;
      if (!vault.has(key)) {
        // Not in vault — keep + record the id for subsequent rows.
        filtered.push(t);
        renderedIds.add(t.id);
        continue;
      }
      // In vault — apply the New-Season-Out exception for TV.
      if (t.media_type === "tv") {
        const trackedCount = tracked.get(String(t.id)) ?? 0;
        const tmdbSeasons = t.number_of_seasons ?? 0;
        // Keep + badge ONLY if TMDB reports strictly more seasons than
        // the user has tracked AND we have a non-zero TMDB season count
        // (defensive — don't badge when TMDB data is missing).
        if (tmdbSeasons > 0 && tmdbSeasons > trackedCount) {
          filtered.push(t);
          renderedIds.add(t.id);
          badgeIds.add(String(t.id));
        }
        // Otherwise: in vault, no new season → filter out.
      }
      // Movies in the vault are always filtered out (no new-season
      // concept for movies).
    }
    return { titles: filtered, badgeIds, renderedIds };
  };

  // ── GLOBAL DEDUP CHAIN ────────────────────────────────────────────
  // Each row's filtered memo depends on the PREVIOUS row's renderedIds,
  // so the rows chain in render order (Row 1 → Row 2 → ... → Row 6).
  // This guarantees a title shown by Row 1 is never repeated by Row 2-6.
  // The Spotlight pick is also added to the chain so no row repeats it.
  const spotlightRenderedIds = createMemo<Set<number>>(() => {
    const ids = new Set<number>();
    const pick = spotlightPick();
    if (pick) ids.add(pick.title.id);
    return ids;
  });

  // ── ROW 1: "Because you liked [Daily Seed Movie Title]" ──────────
  // Fetches /movie/{seedId}/recommendations. The seed rotates daily
  // via the personalization hook. Skipped entirely on cold start
  // (no seed → no recommendations to fetch).
  // A small memo that returns today's date string — used in the row
  // keys so each row's fetch re-triggers when the day changes. This
  // guarantees a fresh fetch even if the TMDB apiCache key collides
  // across days (it shouldn't, but this is belt-and-suspenders).
  const personalizedDayKey = createMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const row1Key = createMemo(() => {
    const seed = personalized.seedTitle();
    if (!seed) return null;
    return { seedId: String(seed.id), day: personalizedDayKey() };
  });
  const row1 = useDiscoverRow(row1Key, async (key) => {
    const recs = await getRecommendations("movie", key.seedId);
    return recs;
  });
  // Dedup chain: Row 1 starts from the Spotlight's rendered ids so
  // the Spotlight pick isn't repeated in Row 1.
  const row1Filtered = createMemo(() => filterFeed(row1.titles(), spotlightRenderedIds()));
  const row1Label = createMemo(() => personalized.seedLabel());

  // ── ROW 2: "Trending in [User's Top Genre Name]" ─────────────────
  // Fetches /discover/movie?with_genres={topGenreId}&sort_by=popularity.desc.
  // Falls back to a generic "Trending Movies" label + popular feed
  // when there's no top genre (cold start).
  const row2Key = createMemo(() => {
    const genreId = personalized.topGenreId();
    return { genreId, day: personalizedDayKey() }; // genreId may be null
  });
  const row2 = useDiscoverRow(row2Key, async (key) => {
    if (key.genreId == null) {
      // Cold-start fallback — popular movies.
      return discoverMovies({ sortBy: "popularity.desc", voteCountGte: 200 });
    }
    return discoverMovies({
      withGenres: [key.genreId],
      sortBy: "popularity.desc",
      voteCountGte: 100,
    });
  });
  // Dedup chain: Row 2 continues from Row 1's rendered ids.
  const row2Filtered = createMemo(() => filterFeed(row2.titles(), row1Filtered().renderedIds));
  const row2Label = createMemo(() => {
    const name = personalized.topGenreName();
    if (name) return formatTopGenreLabel(name);
    return "Trending Movies";
  });

  // ── ROW 3: "NEW ON OTT" + dropdown ───────────────────────────────
  // The dropdown lives in the section header. It lists ONLY the user's
  // selected providers (streamingProviders preference). When the user
  // picks a provider, we fetch /discover/movie?with_watch_providers={id}
  // &watch_region={region}. We also fetch TV results for the same
  // provider and merge them so providers with TV-only content still
  // show titles.
  //
  // Initial selection: if the user has providers selected, default to
  // the first one. Otherwise default to null (the dropdown will show
  // the top region providers as fallback, and the user can pick one).
  const [ottSelected, setOttSelected] = createSignal<string | null>(null);
  // Auto-pick the first user-selected provider on mount / when the
  // preference changes from empty → non-empty AND nothing is selected.
  // Uses createEffect (not createMemo) because it has a side effect
  // (setOttSelected) — memos must be pure.
  createEffect(() => {
    const userPicks = streamingProviders();
    if (ottSelected() === null && userPicks.length > 0) {
      setOttSelected(userPicks[0]);
    }
  });
  const row3Key = createMemo(() => {
    const providerId = ottSelected();
    if (providerId === null) return null;
    return { providerId, region: region(), day: personalizedDayKey() };
  });
  const row3 = useDiscoverRow(row3Key, async (key) => {
    // Fetch movie + TV in parallel and merge so providers with TV-only
    // content still show titles. Mirrors the existing OttSection logic.
    const pid = parseInt(key.providerId, 10);
    if (!Number.isFinite(pid)) return [];
    const [movieRes, tvRes] = await Promise.allSettled([
      discoverMoviesWithProvider(pid, key.region, { sortBy: "popularity.desc" }),
      discoverTvWithProvider(pid, key.region, { sortBy: "popularity.desc" }),
    ]);
    const movies = movieRes.status === "fulfilled" ? movieRes.value : [];
    const tv = tvRes.status === "fulfilled" ? tvRes.value : [];
    // Merge + dedupe by TMDB id.
    const seen = new Set<number>();
    const merged: TMDBTitle[] = [];
    for (const t of movies) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
    for (const t of tv) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
    return merged;
  });
  // Dedup chain: Row 3 continues from Row 2's rendered ids.
  const row3Filtered = createMemo(() => filterFeed(row3.titles(), row2Filtered().renderedIds));

  // ── ROW 4: "Weekend Picks & Hidden Gems" ─────────────────────────
  // /discover/movie?vote_average.gte=7.0&vote_count.gte=100&vote_count.lte=1500
  // &sort_by=popularity.desc&primary_release_date.lte=2023-12-31
  //
  // The primary_release_date.lte=2023 filter strictly excludes current-
  // year blockbusters so the row surfaces actual hidden gems (acclaimed
  // older films with moderate vote counts) instead of the same 2026
  // movies that appear in every other row.
  const row4Key = createMemo(() => ({ day: personalizedDayKey() }));
  const row4 = useDiscoverRow(row4Key, async () => {
    return discoverMovies({
      voteAverageGte: 7.0,
      voteCountGte: 100,
      voteCountLte: 1500,
      sortBy: "popularity.desc",
      // Exclude current-year blockbusters — hidden gems only.
      // Use a fixed 2023-12-31 cutoff (not "current year - 1") so the
      // cache key is stable across days and the apiCache layer can
      // serve repeated visits instantly.
      primaryReleaseDateLte: "2023-12-31",
    });
  });
  // Dedup chain: Row 4 continues from Row 3's rendered ids.
  const row4Filtered = createMemo(() => filterFeed(row4.titles(), row3Filtered().renderedIds));

  // ── ROW 5: "Global Pulse" (/trending/all/day) ────────────────────
  const row5Key = createMemo(() => ({ day: personalizedDayKey() }));
  const row5 = useDiscoverRow(row5Key, async () => {
    return getTrending("all", "day");
  });
  // Dedup chain: Row 5 continues from Row 4's rendered ids.
  const row5Filtered = createMemo(() => filterFeed(row5.titles(), row4Filtered().renderedIds));

  // ── ROW 6: "Coming Soon" (/movie/upcoming) ───────────────────────
  // Reuses the existing feeds.upcoming() signal (already region-aware
  // and cached) rather than re-fetching. The "See All" button routes
  // to /profile/upcoming.
  const navigate = useNavigate();
  // Dedup chain: Row 6 continues from Row 5's rendered ids.
  const upcomingFeed = createMemo(() => filterFeed(feeds.upcoming(), row5Filtered().renderedIds));

  // Loading state — true only during the initial feeds fetch (first paint).
  const isLoading = createMemo(
    () => feeds.loading() && feeds.upcoming().length === 0 && row5.titles().length === 0,
  );

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="ambient-glow" aria-hidden="true" />

      {/* === 1. COMMAND CENTER — SEARCH BAR (top) === */}
      <form
        class="search-bar-form discover-search-bar-form"
        onSubmit={handleSearchSubmit}
        role="search"
      >
        <div class="search-bar">
          <span class="material-symbols-outlined search-bar-icon" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            class="search-bar-input"
            placeholder="Search movies, series, people…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            aria-label="Search movies, series, and people"
            autocomplete="off"
            spellcheck={false}
          />
          <Show when={query()}>
            <button
              type="button"
              class="search-bar-clear focus-ring"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                close
              </span>
            </button>
          </Show>
        </div>
        <button type="submit" class="sr-only">Search</button>
      </form>

      <Show when={!isLoading()} fallback={<DiscoverSkeleton />}>
        {/* === SEARCH RESULTS MODE === */}
        <Show when={showSearchResults()} fallback={
          <div class="page-enter relative discover-folds">

            {/* 1. GENRE EXPLORER (Command Center part 2) */}
            <Show when={homepageConfig.isEnabled("genre_explorer")}>
              <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Genre Explorer" error={e} />}>
                <DiscoverSectionWrapper label="Genre Explorer" icon="palette">
                  <GenreExplorer
                    onSelect={handleOpenTitle}
                    vaultKeys={excludedKeys}
                    initialGenre={initialGenre()}
                  />
                </DiscoverSectionWrapper>
              </ErrorBoundary>
            </Show>

            {/* 2. DAILY ROTATING SPOTLIGHT HERO */}
            <Show when={homepageConfig.isEnabled("spotlight")}>
              <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Spotlight" error={e} />}>
                <Spotlight
                  pick={spotlightPick}
                  loading={spotlightLoading()}
                  error={spotlightError}
                  isGuest={isGuest()}
                  vault={watchlist()}
                  onDetails={handleOpenTitle}
                  onAddToVault={addToVault}
                  onShuffle={() => void shuffleSpotlight()}
                  onRetry={() => void retrySpotlight()}
                />
              </ErrorBoundary>
            </Show>

            {/* 3. ROW 1 — "Because you liked [Daily Seed Movie Title]" */}
            {/* Hidden on cold start (no seed → no recommendations). */}
            <Show when={personalized.seedTitle() !== null && homepageConfig.isEnabled("because_you_love")}>
              <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Recommendations" error={e} />}>
                <Suspense fallback={<RowSkeleton />}>
                  <DiscoverSectionWrapper
                    label={row1Label()}
                    icon="auto_awesome"
                    loading={row1.loading() && row1Filtered().titles.length === 0}
                  >
                    <DiscoverRail
                      titles={row1Filtered().titles}
                      onSelect={handleOpenTitle}
                      newSeasonBadgeIds={row1Filtered().badgeIds}
                      emptyText="No recommendations today."
                      emptyIcon="auto_awesome"
                      onRetry={row1.loading() ? undefined : row1.retry}
                    />
                  </DiscoverSectionWrapper>
                </Suspense>
              </ErrorBoundary>
            </Show>

            {/* 4. ROW 2 — "Trending in [User's Top Genre Name]" */}
            <Show when={homepageConfig.isEnabled("trending")}>
              <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Trending in Genre" error={e} />}>
                <Suspense fallback={<RowSkeleton />}>
                  <DiscoverSectionWrapper
                    label={row2Label()}
                    icon="trending_up"
                    loading={row2.loading() && row2Filtered().titles.length === 0}
                  >
                    <DiscoverRail
                      titles={row2Filtered().titles}
                      onSelect={handleOpenTitle}
                      newSeasonBadgeIds={row2Filtered().badgeIds}
                      emptyText="No titles in this genre right now."
                      emptyIcon="trending_up"
                      onRetry={row2.loading() ? undefined : row2.retry}
                    />
                  </DiscoverSectionWrapper>
                </Suspense>
              </ErrorBoundary>
            </Show>

            {/* 5. ROW 3 — "NEW ON OTT" + OttDropdown */}
            <Show when={homepageConfig.isEnabled("new_on_ott")}>
              <ErrorBoundary fallback={(e) => <DiscoverSectionError label="New on OTT" error={e} />}>
                <Suspense fallback={<RowSkeleton />}>
                  <section class="discover-fold" aria-label="New on OTT">
                    <div class="discover-fold-header">
                      <div class="discover-fold-label">
                        <span class="material-symbols-outlined" aria-hidden="true">live_tv</span>
                        New on OTT
                      </div>
                      <OttDropdown
                        region={region()}
                        selected={ottSelected}
                        onSelect={setOttSelected}
                      />
                    </div>
                    <Show
                      when={!row3.loading() || row3Filtered().titles.length > 0}
                      fallback={<RowSkeletonRail />}
                    >
                      <DiscoverRail
                        titles={row3Filtered().titles}
                        onSelect={handleOpenTitle}
                        newSeasonBadgeIds={row3Filtered().badgeIds}
                        emptyText="Nothing streaming on this provider right now."
                        emptyHint="Try another provider from the dropdown above."
                        emptyIcon="live_tv"
                        onRetry={row3.loading() ? undefined : row3.retry}
                      />
                    </Show>
                  </section>
                </Suspense>
              </ErrorBoundary>
            </Show>

            {/* 6. ROW 4 — "Weekend Picks & Hidden Gems" */}
            <Show when={homepageConfig.isEnabled("weekend_picks")}>
              <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Weekend Picks" error={e} />}>
                <Suspense fallback={<RowSkeleton />}>
                  <DiscoverSectionWrapper
                    label="Weekend Picks & Hidden Gems"
                    icon="diamond"
                    loading={row4.loading() && row4Filtered().titles.length === 0}
                  >
                    <DiscoverRail
                      titles={row4Filtered().titles}
                      onSelect={handleOpenTitle}
                      newSeasonBadgeIds={row4Filtered().badgeIds}
                      emptyText="No hidden gems found right now."
                      emptyIcon="diamond"
                      onRetry={row4.loading() ? undefined : row4.retry}
                    />
                  </DiscoverSectionWrapper>
                </Suspense>
              </ErrorBoundary>
            </Show>

            {/* 7. ROW 5 — "Global Pulse" (/trending/all/day) */}
            <Show when={homepageConfig.isEnabled("trending")}>
              <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Global Pulse" error={e} />}>
                <Suspense fallback={<RowSkeleton />}>
                  <DiscoverSectionWrapper
                    label="Global Pulse"
                    icon="public"
                    loading={row5.loading() && row5Filtered().titles.length === 0}
                  >
                    <DiscoverRail
                      titles={row5Filtered().titles}
                      onSelect={handleOpenTitle}
                      newSeasonBadgeIds={row5Filtered().badgeIds}
                      emptyText="No trending titles today."
                      emptyIcon="public"
                      onRetry={row5.loading() ? undefined : row5.retry}
                    />
                  </DiscoverSectionWrapper>
                </Suspense>
              </ErrorBoundary>
            </Show>

            {/* 8. ROW 6 — "Coming Soon" (/movie/upcoming) */}
            <Show when={featureFlags.isEnabled("upcoming") && homepageConfig.isEnabled("coming_soon")}>
              <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Coming Soon" error={e} />}>
                <Suspense fallback={<RowSkeleton />}>
                  <DiscoverSectionWrapper
                    label="Coming Soon"
                    icon="upcoming"
                    loading={feeds.loading() && upcomingFeed().titles.length === 0}
                    actionLabel="See All"
                    onAction={() => navigate("/profile/upcoming")}
                  >
                    <DiscoverRail
                      titles={upcomingFeed().titles}
                      onSelect={handleOpenTitle}
                      newSeasonBadgeIds={upcomingFeed().badgeIds}
                      emptyText="No upcoming releases."
                      emptyIcon="upcoming"
                      onRetry={feeds.loading() ? undefined : feeds.retry}
                    />
                  </DiscoverSectionWrapper>
                </Suspense>
              </ErrorBoundary>
            </Show>

            {/* 9. GUEST SIGN-IN CTA */}
            <Show when={isGuest()}>
              <div class="discover-guest-nudge">
                <p class="type-body-soft" style={{ "text-align": "center", "max-width": "280px", margin: "0 auto var(--sp-3)" }}>
                  Sign in to make Spotlight yours — every pick adapts to what you love.
                </p>
                <button class="btn-primary focus-ring" onClick={handleLogin} style={{ margin: "0 auto", display: "flex" }}>
                  <span class="material-symbols-outlined" aria-hidden="true">login</span>
                  Sign In to Begin
                </button>
              </div>
            </Show>
          </div>
        }>
          {/* === SEARCH RESULTS (shown when query ≥ 2 chars, debounced) === */}
          <div class="page-enter relative discover-folds">
            <SearchResults
              loading={searchLoading}
              error={searchError}
              query={query}
              results={results}
              isInVault={isInVault}
              onOpenTitle={handleOpenTitle}
              onAddToVault={addToVault}
            />
          </div>
        </Show>
      </Show>
    </PageContainer>
  );
}

// ─── Local helper components (kept in this file to avoid file sprawl) ───

/**
 * DiscoverSectionWrapper — thin wrapper around the standard Discover
 * section layout (label + icon header + children). Mirrors the
 * `DiscoverSection` component from components/DiscoverSection.tsx but
 * is defined locally so this file stays self-contained for the
 * personalized layout.
 *
 * Accepts the same `label`, `icon`, `loading`, `actionLabel`, `onAction`
 * props as DiscoverSection. Renders a 6-card skeleton rail while loading.
 */
function DiscoverSectionWrapper(props: {
  label: string;
  icon: string;
  loading?: boolean;
  children: JSX.Element;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section class="discover-fold" aria-label={props.label}>
      <div class="discover-fold-header">
        <div class="discover-fold-label">
          <span class="material-symbols-outlined" aria-hidden="true">{props.icon}</span>
          {props.label}
        </div>
        <Show when={props.actionLabel && props.onAction}>
          <button
            type="button"
            class="discover-fold-action focus-ring"
            onClick={() => props.onAction?.()}
            aria-label={props.actionLabel}
          >
            <span>{props.actionLabel}</span>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </Show>
      </div>
      <Show
        when={!props.loading}
        fallback={
          <div class="search-rail">
            <For each={Array.from({ length: 6 })}>
              {() => (
                <div class="search-rail-card" style={{ cursor: "default" }}>
                  <div class="search-rail-poster skeleton-base" />
                </div>
              )}
            </For>
          </div>
        }
      >
        {props.children}
      </Show>
    </section>
  );
}

/** A single-row skeleton rail shown while a Discover row is loading. */
function RowSkeletonRail() {
  return (
    <div class="search-rail">
      <For each={Array.from({ length: 6 })}>
        {() => (
          <div class="search-rail-card" style={{ cursor: "default" }}>
            <div class="search-rail-poster skeleton-base" />
          </div>
        )}
      </For>
    </div>
  );
}

/** A full-section skeleton (header placeholder + rail) for Suspense fallback. */
function RowSkeleton() {
  return (
    <section class="discover-fold">
      <div class="discover-fold-header">
        <div class="discover-fold-label" style={{ opacity: 0.4 }}>
          <span class="material-symbols-outlined" aria-hidden="true">movie</span>
          Loading…
        </div>
      </div>
      <RowSkeletonRail />
    </section>
  );
}
