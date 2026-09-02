// src/features/discover/DiscoverPage.tsx
//
// DiscoverPage — "Your Personal Movie Curator" (Personalized Discovery Engine)
//
// LAYOUT (restructured — 8 curated sections):
//   ┌─────────────────────────────────────────────────────────────┐
//   │ 1. SPOTLIGHT (daily rotating hero, personalized)            │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 2. GENRE EXPLORER (chips + continuous carousel)             │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 3. "Because you liked [Daily Seed Movie Title]"             │
//   │    • /movie/{seedId}/recommendations                        │
//   │    • Seed rotates daily via FNV-1a hash of {date}:{uid}     │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 4. "Trending in ▼ Genre" (genre dropdown)                   │
//   │    • /discover/movie?with_genres={genreId}                   │
//   │    • "Anime" option combines Trending + Seasonal anime      │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 5. "NEW ON OTT" + <OttDropdown />                           │
//   │    • Dropdown lists ONLY the user's selected providers      │
//   │    • /discover/movie?with_watch_providers={id}&watch_region │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 6. "Weekend Picks & Hidden Gems"                             │
//   │    • Hidden Movies + Hidden TV + Hidden Gems Anime          │
//   │    • /discover/movie?vote_average.gte=7&vote_count.gte=100  │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 7. "Popular Anime" (merged Popular + Top Rated Anime)       │
//   ├─────────────────────────────────────────────────────────────┤
//   │ 8. "Coming Soon" (merged Upcoming Movies + TV + Anime)      │
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
//   Every row is wrapped in its own <Suspense> + <ErrorBoundary>
//   so a slow or failed fetch in one row never blocks or breaks the
//   others. Each row renders its own skeleton while loading and a
//   DiscoverEmptyState on error.
//
// FALLBACK (cold start / guest):
//   If the user has no vault signal (guest or empty vault):
//     • Row 3 ("Because you liked") is hidden (no seed → no recommendations).
//     • Row 4 ("Trending") falls back to "Trending Movies" (topGenreId is null).
//     • Rows 5-8 work the same (they don't depend on personalization).
//
// SEARCH:
//   Search has been moved to the global AppHeader. The search bar is
//   no longer rendered in DiscoverPage. When the user searches from
//   the AppHeader, the search results are shown here via the
//   SearchContext. The search state (query, results, loading) is
//   shared between AppHeader and DiscoverPage through useGlobalSearch().

import {
  createSignal,
  createMemo,
  createEffect,
  Show,
  For,
  ErrorBoundary,
  Suspense,
  type JSX
} from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useAuth } from "~/shared/hooks/useAuth";
import { useOnlineStatus } from "~/shared/hooks/useOnlineStatus";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { OfflineState } from "~/shared/ui/states";
import { useDiscoverTaste } from "./hooks/useDiscoverTaste";
import { useSpotlight } from "./hooks/useSpotlight";
import { useDiscoverFeeds } from "./hooks/useDiscoverFeeds";
import { usePersonalizedDiscover } from "./hooks/usePersonalizedDiscover";
import { useDiscoverRow } from "./hooks/useDiscoverRow";
import { useDiscoverActions } from "./useDiscoverActions";
import Spotlight from "./components/Spotlight";
import DiscoverRail from "./components/DiscoverRail";
import GenreExplorer from "./components/GenreExplorer";
import OttDropdown, { chooseInitialProviderId } from "./components/OttDropdown";
import GenreDropdown from "./components/GenreDropdown";
import DiscoverSkeleton from "./components/DiscoverSkeleton";
import { DiscoverSectionError } from "./components/DiscoverSectionError";
import {
  discoverMovies,
  discoverMoviesWithProvider,
  discoverTvWithProvider,
  getRecommendations,
  genreIdFor
} from "~/core/tmdb/discover";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import { streamingProviders } from "~/core/preferences";
import { useFeatureFlags } from "~/lib/featureFlags";
import { useHomepageConfig } from "~/lib/homepageConfig";
import type { TMDBTitle } from "~/shared/types";
// Search is now an independent application-level feature.
// The SearchOverlay is rendered in AppShell (not here).
// DiscoverPage only shows the Discover sections.
// AniList anime carousels — Phase 3 integration. Renders ONLY when
// the anime_settings.enabled flag is on (admin-controlled). Each
// carousel is independent and uses cached AniList → TMDB mapping.
import { useAnimeCarousels } from "./hooks/useAnimeCarousels";
// Phase 16 Chunk 2 — AI Picks for You rail. Rendered as the ABSOLUTE
// LAST section on the Discover page (below "Coming Soon"). The rail
// self-hides when the AI feature is disabled or the user is a guest,
// so mounting it is always safe.
import AiRecommendationRail from "./components/AiRecommendationRail";
// Shared state components for consistent error / empty / refreshing UI.
import { ErrorState, RefreshingIndicator } from "~/shared/ui/states";
import { GlassEmptyState } from "~/shared/ui/glass";

export default function DiscoverPage() {
  const { watchlist, isGuest } = useUserLibrary();
  const { user, authReady } = useAuth();
  const { isOffline } = useOnlineStatus();
  const { profile: taste } = useDiscoverTaste({ watchlist, isGuest });

  // Read URL search params so deep links like `/discover?genre=Sci-Fi`
  // can drive the GenreExplorer's initial state.
  const [searchParams] = useSearchParams();
  const initialGenre = createMemo(() => {
    const g = searchParams.genre;
    return typeof g === "string" ? g : undefined;
  });

  // Feature flags + homepage config (admin-controlled per-section visibility).
  const featureFlags = useFeatureFlags();
  const homepageConfig = useHomepageConfig();
  // Anime carousels (Phase 3) — gated internally by anime_settings.enabled.
  const animeCarousels = useAnimeCarousels();

  // Region — single source of truth, reactive.
  const region = useDiscoverRegion();

  // === PERSONALIZATION ENGINE ===
  const personalized = usePersonalizedDiscover(watchlist, isGuest);

  // === SPOTLIGHT (daily rotating hero, personalized) =================
  const userId = createMemo(() => user()?.uid ?? null);
  const {
    pick: spotlightPick,
    loading: spotlightLoading,
    error: spotlightError,
    shuffle: shuffleSpotlight,
    retry: retrySpotlight
  } = useSpotlight({ taste, vault: watchlist, userId, authReady });

  const feeds = useDiscoverFeeds(region);
  const { handleOpenTitle, addToVault, handleLogin } = useDiscoverActions({
    watchlist,
    isGuest
  });

  // ── VAULT EXCLUSION + NEW SEASON LOGIC ────────────────────────────
  const excludedKeys = personalized.excludedKeys;
  const trackedTvSeasons = personalized.trackedTvSeasons;

  /**
   * Filter a feed of TMDBTitle[] down to titles not already rendered
   * by an earlier row AND not in the user's vault (with the New-Season
   * exception for TV).
   */
  const filterFeed = (
    titles: TMDBTitle[],
    priorRenderedIds: Set<number> = new Set()
  ): {
    titles: TMDBTitle[];
    badgeIds: Set<string>;
    renderedIds: Set<number>;
  } => {
    const vault = excludedKeys();
    const tracked = trackedTvSeasons();
    const badgeIds = new Set<string>();
    const renderedIds = new Set(priorRenderedIds);
    const filtered: TMDBTitle[] = [];
    for (const t of titles) {
      if (renderedIds.has(t.id)) continue;
      const key = `${t.media_type}/${t.id}`;
      if (!vault.has(key)) {
        filtered.push(t);
        renderedIds.add(t.id);
        continue;
      }
      if (t.media_type === "tv") {
        const trackedCount = tracked.get(String(t.id)) ?? 0;
        const tmdbSeasons = t.number_of_seasons ?? 0;
        if (tmdbSeasons > 0 && tmdbSeasons > trackedCount) {
          filtered.push(t);
          renderedIds.add(t.id);
          badgeIds.add(String(t.id));
        }
      }
    }
    return { titles: filtered, badgeIds, renderedIds };
  };

  // ── GLOBAL DEDUP CHAIN ────────────────────────────────────────────
  const spotlightRenderedIds = createMemo<Set<number>>(() => {
    const ids = new Set<number>();
    const pick = spotlightPick();
    if (pick) ids.add(pick.title.id);
    return ids;
  });

  // ── ROW 3: "Because you liked [Daily Seed Movie Title]" ──────────
  const personalizedDayKey = createMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const row1Key = createMemo(() => {
    const seed = personalized.seedTitle();
    if (!seed) return null;
    return { seedId: String(seed.id), day: personalizedDayKey() };
  });
  // eslint-disable-next-line solid/reactivity
  const row1 = useDiscoverRow(row1Key, async (key) => {
    const recs = await getRecommendations("movie", key.seedId);
    return recs;
  });
  const row1Filtered = createMemo(() =>
    filterFeed(row1.titles(), spotlightRenderedIds())
  );
  const row1Label = createMemo(() => personalized.seedLabel());

  // ── ROW 4: "Trending in ▼ Genre" ────────────────────────────────
  // The genre dropdown replaces the fixed "Trending in [Top Genre]".
  // The user's top genre is the default selection, but they can change
  // it via the dropdown. When "Anime" is selected, we combine
  // Trending Anime + This Season Anime into one unified carousel.
  const [trendingGenre, setTrendingGenre] = createSignal(
    personalized.topGenreName() || "Drama"
  );
  // Sync with the user's top genre when personalization resolves
  createEffect(() => {
    const topGenre = personalized.topGenreName();
    if (topGenre && !trendingGenre()) {
      setTrendingGenre(topGenre);
    }
  });

  // When "Anime" is selected, combine Trending + Seasonal anime data
  const isAnimeGenre = createMemo(() => trendingGenre() === "Anime");

  const row2Key = createMemo(() => {
    if (isAnimeGenre()) {
      // Anime genre uses a different key — no TMDB genre ID needed
      return { genre: "Anime", day: personalizedDayKey() };
    }
    const genreId = genreIdFor(trendingGenre(), "movie");
    return { genreId, day: personalizedDayKey() };
  });
  // eslint-disable-next-line solid/reactivity
  const row2 = useDiscoverRow(row2Key, async (key) => {
    // Anime genre — data comes from animeCarousels, not TMDB discover
    if (key.genre === "Anime") return [];
    if (key.genreId == null) {
      return discoverMovies({ sortBy: "popularity.desc", voteCountGte: 200 });
    }
    return discoverMovies({
      withGenres: [key.genreId],
      sortBy: "popularity.desc",
      voteCountGte: 100
    });
  });

  // For the Anime genre, combine Trending + Seasonal anime into one
  // unified carousel
  const animeTrendingCombined = createMemo(() => {
    if (!isAnimeGenre()) return [];
    const trending = animeCarousels.trending();
    const seasonal = animeCarousels.seasonal();
    // Merge + deduplicate by id
    const seen = new Set<number>();
    const merged: TMDBTitle[] = [];
    for (const t of trending) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
    for (const t of seasonal) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
    return merged;
  });

  // The actual titles for the Trending row — either TMDB or anime
  const row2Titles = createMemo(() =>
    isAnimeGenre() ? animeTrendingCombined() : row2.titles()
  );
  const row2Filtered = createMemo(() =>
    filterFeed(row2Titles(), row1Filtered().renderedIds)
  );
  // ── ROW 5: "NEW ON OTT" + dropdown ───────────────────────────────
  const [ottSelected, setOttSelected] = createSignal<string | null>(null);
  createEffect(() => {
    const userPicks = streamingProviders();
    const current = ottSelected();
    if (current !== null) return;
    const preferred = userPicks[0];
    if (preferred) setOttSelected(preferred);
  });
  const handleOttProvidersLoaded = (
    providers: Array<{ id: string; name: string; logoPath: string | null }>
  ) => {
    const current = ottSelected();
    if (current && providers.some((provider) => provider.id === current))
      return;
    const next = chooseInitialProviderId(providers, streamingProviders());
    setOttSelected(next);
  };
  const row3Key = createMemo(() => {
    const providerId = ottSelected();
    if (providerId === null) return null;
    return { providerId, region: region(), day: personalizedDayKey() };
  });
  // eslint-disable-next-line solid/reactivity
  const row3 = useDiscoverRow(row3Key, async (key) => {
    const pid = parseInt(key.providerId, 10);
    if (!Number.isFinite(pid)) return [];
    const [movieRes, tvRes] = await Promise.allSettled([
      discoverMoviesWithProvider(pid, key.region, {
        sortBy: "popularity.desc"
      }),
      discoverTvWithProvider(pid, key.region, { sortBy: "popularity.desc" })
    ]);
    const movies = movieRes.status === "fulfilled" ? movieRes.value : [];
    const tv = tvRes.status === "fulfilled" ? tvRes.value : [];
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
  const row3Filtered = createMemo(() =>
    filterFeed(row3.titles(), row2Filtered().renderedIds)
  );

  // ── SHUFFLE UTILITY ───────────────────────────────────────────────
  // Fisher-Yates shuffle for interleaving TMDB + Anime titles so the
  // user can't tell where each item came from. Shuffles only after
  // both datasets have finished loading — no bias toward either source.
  const shuffle = <T,>(arr: T[]): T[] => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  // ── MERGE UTILITY ─────────────────────────────────────────────────
  // Merge + deduplicate two TMDBTitle arrays by id, then shuffle.
  const mergeAndShuffle = (a: TMDBTitle[], b: TMDBTitle[]): TMDBTitle[] => {
    const seen = new Set<number>();
    const merged: TMDBTitle[] = [];
    for (const t of a) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
    for (const t of b) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
    return shuffle(merged);
  };

  // ── ROW 6: "Weekend Picks & Hidden Gems" ─────────────────────────
  // Merged: Hidden Movies + Hidden TV + Hidden Gems Anime
  // Shuffled so TMDB + Anime titles are interleaved naturally.
  const row4Key = createMemo(() => ({ day: personalizedDayKey() }));
  // eslint-disable-next-line solid/reactivity
  const row4 = useDiscoverRow(row4Key, async () => {
    return discoverMovies({
      voteAverageGte: 7.0,
      voteCountGte: 100,
      voteCountLte: 1500,
      sortBy: "popularity.desc",
      primaryReleaseDateLte: "2023-12-31"
    });
  });
  const weekendPicksCombined = createMemo(() => {
    const tmdbTitles = row4.titles();
    const animeTitles = animeCarousels.hiddenGems();
    if (animeTitles.length === 0) return tmdbTitles;
    return mergeAndShuffle(tmdbTitles, animeTitles);
  });
  const row4Filtered = createMemo(() =>
    filterFeed(weekendPicksCombined(), row3Filtered().renderedIds)
  );

  // ── ROW 7: "Popular Anime" (merged Popular + Top Rated Anime) ────
  // No NEW SEASON badges — Popular Anime only shows poster, title,
  // year, rating, and type. Nothing else.
  const popularAnimeCombined = createMemo(() => {
    const popular = animeCarousels.popular();
    const topRated = animeCarousels.topRated();
    const seen = new Set<number>();
    const merged: TMDBTitle[] = [];
    for (const t of popular) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
    for (const t of topRated) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
    return merged;
  });
  // Popular Anime: filter out vault titles but do NOT pass newSeasonBadgeIds
  const row5Filtered = createMemo(() => {
    const vault = excludedKeys();
    const renderedIds = new Set(row4Filtered().renderedIds);
    const filtered: TMDBTitle[] = [];
    for (const t of popularAnimeCombined()) {
      if (renderedIds.has(t.id)) continue;
      const key = `${t.media_type}/${t.id}`;
      if (!vault.has(key)) {
        filtered.push(t);
        renderedIds.add(t.id);
      }
    }
    return { titles: filtered, badgeIds: new Set<string>(), renderedIds };
  });

  // ── ROW 7.5: "Running in Theatres" (now-playing movies, region-specific)
  // 2026-09-03 — movies currently in theatres for the user's selected
  // country. Uses feeds.nowPlaying() which calls TMDB's
  // /movie/now_playing?region={r}. Filtered through the global dedup
  // chain so titles already shown in earlier rows don't reappear.
  // The section is HIDDEN when there are no results (e.g. TMDB returns
  // empty for a small region, or the fetch failed silently).
  const nowPlayingFeed = createMemo(() =>
    filterFeed(feeds.nowPlaying(), row5Filtered().renderedIds)
  );

  // ── ROW 8: "Coming Soon" (merged Upcoming Movies + TV + Anime) ───
  // Shuffled so TMDB + Anime titles are interleaved naturally.
  const navigate = useNavigate();
  const upcomingCombined = createMemo(() => {
    const tmdbUpcoming = feeds.upcoming();
    const animeUpcoming = animeCarousels.upcoming();
    if (animeUpcoming.length === 0) return tmdbUpcoming;
    return mergeAndShuffle(tmdbUpcoming, animeUpcoming);
  });
  const upcomingFeed = createMemo(() =>
    filterFeed(upcomingCombined(), row5Filtered().renderedIds)
  );

  // Loading state — true only during the initial feeds fetch
  const isLoading = createMemo(
    () =>
      feeds.loading() &&
      feeds.upcoming().length === 0 &&
      row4.titles().length === 0
  );

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <Show when={isOffline()}>
        <OfflineState variant="banner" hasCachedData />
      </Show>
      <div class="ambient-glow" aria-hidden="true" />

      <Show when={!isLoading()} fallback={<DiscoverSkeleton />}>
        <div class="page-enter discover-folds relative">
          {/* Refreshing indicator — shown when feeds are refreshing
                  (not initial load) so the user knows content is updating
                  without the full skeleton replacing the page. */}
          <Show when={feeds.loading() && !isLoading()}>
            <RefreshingIndicator message="Updating feeds…" placement="top" />
          </Show>
          {/* 1. SPOTLIGHT — daily rotating hero */}
          <Show when={homepageConfig.isEnabled("spotlight")}>
            <ErrorBoundary
              fallback={(e) => (
                <DiscoverSectionError label="Spotlight" error={e} />
              )}
            >
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

          {/* 2. GENRE EXPLORER */}
          <Show when={homepageConfig.isEnabled("genre_explorer")}>
            <ErrorBoundary
              fallback={(e) => (
                <DiscoverSectionError label="Genre Explorer" error={e} />
              )}
            >
              <DiscoverSectionWrapper label="Genre Explorer" icon="palette">
                <GenreExplorer
                  onSelect={handleOpenTitle}
                  vaultKeys={excludedKeys}
                  initialGenre={initialGenre()}
                />
              </DiscoverSectionWrapper>
            </ErrorBoundary>
          </Show>

          {/* 3. "Because you liked [Daily Seed Movie Title]" */}
          <Show
            when={
              personalized.seedTitle() !== null &&
              homepageConfig.isEnabled("because_you_love")
            }
          >
            <ErrorBoundary
              fallback={(e) => (
                <DiscoverSectionError label="Recommendations" error={e} />
              )}
            >
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

          {/* 4. "Trending in ▼ Genre" — with genre dropdown */}
          <Show when={homepageConfig.isEnabled("trending")}>
            <ErrorBoundary
              fallback={(e) => (
                <DiscoverSectionError label="Trending in Genre" error={e} />
              )}
            >
              <Suspense fallback={<RowSkeleton />}>
                <section class="discover-fold" aria-label="Trending">
                  <div class="discover-fold-header">
                    <div class="discover-fold-label">
                      <span
                        class="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        trending_up
                      </span>
                      Trending in
                    </div>
                    <GenreDropdown
                      selected={trendingGenre}
                      onSelect={setTrendingGenre}
                    />
                  </div>
                  <Show
                    when={
                      !row2.loading() ||
                      row2Filtered().titles.length > 0 ||
                      isAnimeGenre()
                    }
                    fallback={<RowSkeletonRail />}
                  >
                    <DiscoverRail
                      titles={row2Filtered().titles}
                      onSelect={handleOpenTitle}
                      newSeasonBadgeIds={row2Filtered().badgeIds}
                      emptyText="No titles in this genre right now."
                      emptyIcon="trending_up"
                      onRetry={row2.loading() ? undefined : row2.retry}
                    />
                  </Show>
                </section>
              </Suspense>
            </ErrorBoundary>
          </Show>

          {/* 5. "NEW ON OTT" + OttDropdown */}
          <Show when={homepageConfig.isEnabled("new_on_ott")}>
            <ErrorBoundary
              fallback={(e) => (
                <DiscoverSectionError label="New on OTT" error={e} />
              )}
            >
              <Suspense fallback={<RowSkeleton />}>
                <section class="discover-fold" aria-label="New on OTT">
                  <div class="discover-fold-header">
                    <div class="discover-fold-label">
                      <span
                        class="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        live_tv
                      </span>
                      New on OTT
                    </div>
                    <OttDropdown
                      region={region()}
                      selected={ottSelected}
                      onSelect={setOttSelected}
                      onProvidersLoaded={handleOttProvidersLoaded}
                    />
                  </div>
                  <Show
                    when={
                      ottSelected() !== null &&
                      (!row3.loading() || row3Filtered().titles.length > 0)
                    }
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

          {/* 6. "Weekend Picks & Hidden Gems" (merged with Hidden Gems Anime) */}
          <Show when={homepageConfig.isEnabled("weekend_picks")}>
            <ErrorBoundary
              fallback={(e) => (
                <DiscoverSectionError label="Weekend Picks" error={e} />
              )}
            >
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

          {/* 7. "Popular Anime" (merged Popular + Top Rated Anime) */}
          <Show when={popularAnimeCombined().length > 0}>
            <ErrorBoundary
              fallback={(e) => (
                <DiscoverSectionError label="Popular Anime" error={e} />
              )}
            >
              <DiscoverSectionWrapper
                label="Popular Anime"
                icon="trending_up"
                loading={false}
              >
                <DiscoverRail
                  titles={row5Filtered().titles}
                  onSelect={handleOpenTitle}
                  newSeasonBadgeIds={row5Filtered().badgeIds}
                  emptyText="No popular anime available."
                  emptyIcon="trending_up"
                />
              </DiscoverSectionWrapper>
            </ErrorBoundary>
          </Show>

          {/* 7.5. "Running in Theatres" (now-playing movies, region-specific) */}
          <Show when={nowPlayingFeed().titles.length > 0}>
            <ErrorBoundary
              fallback={(e) => (
                <DiscoverSectionError label="Running in Theatres" error={e} />
              )}
            >
              <Suspense fallback={<RowSkeleton />}>
                <DiscoverSectionWrapper
                  label="Running in Theatres"
                  icon="theaters"
                  loading={
                    feeds.loading() && nowPlayingFeed().titles.length === 0
                  }
                  actionLabel="See All"
                  onAction={() => navigate("/profile/theatres")}
                >
                  <DiscoverRail
                    titles={nowPlayingFeed().titles}
                    onSelect={handleOpenTitle}
                    newSeasonBadgeIds={nowPlayingFeed().badgeIds}
                    emptyText="No movies currently in theatres."
                    emptyIcon="theaters"
                    onRetry={feeds.loading() ? undefined : feeds.retry}
                  />
                </DiscoverSectionWrapper>
              </Suspense>
            </ErrorBoundary>
          </Show>

          {/* 8. "Coming Soon" (merged Upcoming Movies + TV + Anime) */}
          <Show
            when={
              featureFlags.isEnabled("upcoming") &&
              homepageConfig.isEnabled("coming_soon")
            }
          >
            <ErrorBoundary
              fallback={(e) => (
                <DiscoverSectionError label="Coming Soon" error={e} />
              )}
            >
              <Suspense fallback={<RowSkeleton />}>
                <DiscoverSectionWrapper
                  label="Coming Soon"
                  icon="upcoming"
                  loading={
                    feeds.loading() && upcomingFeed().titles.length === 0
                  }
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

          {/* 9. AI PICKS FOR YOU (Phase 16 Chunk 2 — Groq-powered).
                  Rendered as the ABSOLUTE LAST discover section, below
                  "Coming Soon". The component self-hides when:
                    - The AI feature is disabled (via /api/ai/status).
                    - The user is a guest (no vault → no recs).
                    - The user has fewer than 3 rated vault items.
                  It has its own ErrorBoundary so a failure here never
                  breaks the rest of the Discover page. */}
          <ErrorBoundary
            fallback={() => (
              // Silent fallback — the AI rail is non-critical, so we
              // don't show an error card; we just hide it.
              <></>
            )}
          >
            <Suspense fallback={<></>}>
              <AiRecommendationRail
                onSelect={handleOpenTitle}
                isGuest={isGuest()}
              />
            </Suspense>
          </ErrorBoundary>

          {/* Anime outage state — when AniList is down. Uses shared ErrorState
                  for a consistent error experience with retry support. */}
          <Show when={animeCarousels.outage() && !animeCarousels.loading()}>
            <section
              class="discover-fold"
              aria-label="Anime — Temporarily Unavailable"
            >
              <div class="discover-fold-header">
                <div class="discover-fold-label">
                  <span class="material-symbols-outlined" aria-hidden="true">
                    anime
                  </span>
                  Anime
                </div>
              </div>
              <ErrorState
                icon="cloud_off"
                title="Anime data is temporarily unavailable"
                message="AniList is experiencing issues. Anime carousels will return when service is restored."
                variant="section"
                onRetry={animeCarousels.retry}
              />
            </section>
          </Show>

          {/* 9. GUEST SIGN-IN CTA — uses GlassEmptyState for a polished,
                  cinematic empty state that matches the app's design language. */}
          <Show when={authReady() && isGuest()}>
            <div class="discover-guest-nudge">
              <GlassEmptyState
                icon="movie_filter"
                title="Make Spotlight yours"
                message="Sign in and every pick adapts to what you love."
                variant="compact"
                action={
                  <button
                    type="button"
                    class="btn-primary focus-ring"
                    onClick={handleLogin}
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">
                      login
                    </span>
                    Sign In to Begin
                  </button>
                }
              />
            </div>
          </Show>
        </div>
      </Show>
    </PageContainer>
  );
}

// ─── Local helper components (kept in this file to avoid file sprawl) ───

const SKELETON_CARD_STYLE: JSX.CSSProperties = { cursor: "default" };
const SKELETON_LABEL_STYLE: JSX.CSSProperties = { opacity: 0.4 };

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
          <span class="material-symbols-outlined" aria-hidden="true">
            {props.icon}
          </span>
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
            <span class="material-symbols-outlined" aria-hidden="true">
              chevron_right
            </span>
          </button>
        </Show>
      </div>
      <Show
        when={!props.loading}
        fallback={
          <div class="search-rail">
            <For each={Array.from({ length: 6 })}>
              {() => (
                <div class="search-rail-card" style={SKELETON_CARD_STYLE}>
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
          <div class="search-rail-card" style={SKELETON_CARD_STYLE}>
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
        <div class="discover-fold-label" style={SKELETON_LABEL_STYLE}>
          <span class="material-symbols-outlined" aria-hidden="true">
            movie
          </span>
          Loading…
        </div>
      </div>
      <RowSkeletonRail />
    </section>
  );
}
