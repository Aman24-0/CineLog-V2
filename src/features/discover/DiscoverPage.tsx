// src/features/discover/DiscoverPage.tsx
//
// DiscoverPage — "Your Personal Movie Curator" (with merged Search)
//
// Search has been merged into Discover (the dedicated /search route is
// now a redirect). The page layout is:
//
//   ┌─────────────────────────────────────────────────┐
//   │ Search bar (top — primary intentional-discovery  │
//   │             surface, replaces the old eyebrow)   │
//   ├─────────────────────────────────────────────────┤
//   │ Genre Explorer (chips + continuous carousel)     │
//   ├─────────────────────────────────────────────────┤
//   │ Rest of Discover sections (Spotlight, Trending,  │
//   │ Theatres, Recommendations, Surprise Me, etc.)    │
//   └─────────────────────────────────────────────────┘
//
// When the user types ≥2 chars in the search bar, the Genre Explorer
// and Discover sections are temporarily replaced by the search
// results (Movies / Series groups). Clearing the query restores the
// default Discover layout.
//
// FINAL SECTION ORDER (per production spec, post-merge):
//   1. Search bar (always visible at top)
//   2. Genre Explorer (chips + continuous carousel with load-more)
//   3. Spotlight (existing hero)
//   4. Continue Your Universes
//   5. Insight Strip
//   6. Trending This Week
//   7. In Theatres Now
//   8. Because You Love ...
//   9. Surprise Me
//  10. Weekend Picks
//  11. Step Outside Your Taste
//  12. Hidden Gems
//  13. Top Rated Movies
//  14. Top Rated Series
//  15. New on OTT (provider chips + carousel)
//  16. New Seasons
//  17. Coming Soon
//  18. Guest Sign-in CTA
//
// Editorial cards (Tonight's Pick / Hidden Masterpiece) were removed per spec.
//
// REGION: every section reads from `getDiscoverRegion()` (the single
// source of truth in `core/config/discoverRegion`). Future Settings →
// Region switches propagate automatically without another Discover refactor.
//
// PERFORMANCE: below-the-fold sections are wrapped in <LazyMount> which
// uses IntersectionObserver to defer mounting (and any data fetches the
// children trigger) until the section is about to scroll into view. This
// keeps the initial paint fast even though the page has 17 sections.

import { createSignal, createMemo, Show, For, ErrorBoundary } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useDiscoverTaste } from "./hooks/useDiscoverTaste";
import { useSpotlight } from "./hooks/useSpotlight";
import { useDiscoverFeeds } from "./hooks/useDiscoverFeeds";
import { useDiscoverActions } from "./useDiscoverActions";
import { useCuratedUniverses } from "~/features/collections/hooks/useCuratedUniverses";
import Spotlight from "./components/Spotlight";
import DiscoverRail from "./components/DiscoverRail";
import GenreExplorer from "./components/GenreExplorer";
import OttSection from "./components/OttSection";
import DiscoverSkeleton from "./components/DiscoverSkeleton";
import LazyMount from "./components/LazyMount";
import DiscoverEmptyState from "./components/DiscoverEmptyState";
import { DiscoverSection } from "./components/DiscoverSection";
import { DiscoverSectionError } from "./components/DiscoverSectionError";
import { discoverMovies, genreIdFor } from "~/core/tmdb/discover";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
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
  const { profile: taste } = useDiscoverTaste({ watchlist, isGuest });

  // Feature flags — fetched once on app load via /api/feature-flags.
  // Allows admins to toggle Surprise Me, Coming Soon, etc. without
  // redeploying. Unknown flags default to true (current behavior).
  const featureFlags = useFeatureFlags();

  // Homepage sections config — admin-controlled per-section visibility.
  // Defaults to all-enabled if the admin hasn't configured anything yet.
  const homepageConfig = useHomepageConfig();

  // Region — single source of truth, reactive. Reads the live signal
  // from `useDiscoverRegion()`, so when the user changes their country
  // in Account settings → Country dropdown, every region-aware section
  // on this page (useDiscoverFeeds, OttSection, Spotlight seed) picks
  // up the new value automatically without a page reload.
  const region = useDiscoverRegion();

  // === MERGED SEARCH ===
  // The dedicated /search page is gone — search now lives at the top
  // of Discover. We reuse the existing useSearch hook so the search
  // UX is identical to before (debounced 250ms, Movies/Series groups,
  // vault-aware result rows).
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

  // When the user has typed ≥2 chars (debounced), we replace the Genre
  // Explorer + Discover sections with the search results. This keeps
  // the page focused on the search task at hand.
  const showSearchResults = hasQuery;

  const [spotlightSeed, setSpotlightSeed] = createSignal(0);
  const [spotlightExclude, setSpotlightExclude] = createSignal<number | null>(null);
  const { pick: spotlightPick, loading: spotlightLoading } = useSpotlight({
    taste, vault: watchlist, excludeId: spotlightExclude, seed: spotlightSeed,
  });

  const feeds = useDiscoverFeeds(region);
  const { subscribedUniverses } = useCuratedUniverses();
  const { handleOpenTitle, addToVault, handleLogin } = useDiscoverActions({ watchlist, isGuest });

  // ── VAULT FILTER ──────────────────────────────────────────────────
  // The user's watchlist is the single source of "what I'm already
  // tracking". Every generic TMDB feed on this page (Trending, In
  // Theatres Now, Top Rated Movies/Series, Hidden Gems, New Seasons,
  // Coming Soon) is filtered against this set so the user never sees
  // a title they've already added — regardless of status (Completed,
  // Watching, Planned, Dropped). The personalised sections (Because
  // You Love, Step Outside, Weekend Picks, Surprise Me, Spotlight)
  // already filter against the vault inline — they don't need this.
  //
  // The set is keyed by "{media_type}/{tmdb_id}" so a movie with the
  // same numeric id as a TV series (extremely rare but possible) is
  // treated as two distinct titles.
  const vaultKeys = createMemo(() => {
    const list = watchlist();
    const set = new Set<string>();
    for (const w of list) {
      // WatchlistItem.id is already "{tmdb_id}" (string) — but it
      // doesn't carry media_type, so we reconstruct the composite key
      // from `media_type` + `id`. This matches the key shape used by
      // GenreExplorer's dedupe and the discover feed normalizers.
      set.add(`${w.media_type}/${w.id}`);
    }
    return set;
  });

  /** Filter a feed of TMDBTitle[] down to titles not in the user's vault. */
  const excludeVault = (titles: TMDBTitle[]): TMDBTitle[] => {
    const vault = vaultKeys();
    if (vault.size === 0) return titles;
    return titles.filter((t) => !vault.has(`${t.media_type}/${t.id}`));
  };

  // Reactive filtered feeds — recomputed whenever the vault or the
  // underlying feed changes. Each is a thin wrapper so the JSX below
  // stays readable (no inline `.filter()` chains at every call site).
  const trendingFeed = createMemo(() => excludeVault(feeds.trending()));
  const nowPlayingFeed = createMemo(() => excludeVault(feeds.nowPlaying()));
  const upcomingFeed = createMemo(() => excludeVault(feeds.upcoming()));
  const topRatedMoviesFeed = createMemo(() => excludeVault(feeds.topRatedMovies()));
  const topRatedTvFeed = createMemo(() => excludeVault(feeds.topRatedTv()));
  const newSeasonsFeed = createMemo(() => excludeVault(feeds.newSeasons()));
  const hiddenGemsFeed = createMemo(() => excludeVault(feeds.hiddenGems()));

  const handleReroll = () => {
    const current = spotlightPick();
    if (current) setSpotlightExclude(current.title.id);
    setSpotlightSeed((s) => s + Math.floor(Math.random() * 997) + 1);
  };

  // === Continue Your Universes ===
  const continueUniverses = createMemo(() => {
    const vaultIds = new Set(watchlist().map((w) => w.id));
    return subscribedUniverses()
      .map((uni) => {
        const entries = uni.entries ?? [];
        const missing = entries.filter((e) => !vaultIds.has(String(e.id)) && e.poster_path);
        return { universe: uni, missing, total: entries.length };
      })
      .filter((item) => item.missing.length > 0)
      .slice(0, 5);
  });

  // === Because You Like... ===
  const [personalizedTitles, setPersonalizedTitles] = createSignal<TMDBTitle[]>([]);
  const [personalizedLabel, setPersonalizedLabel] = createSignal<string>("");

  // MUST be declared before the createMemo below — createMemo runs its
  // computation synchronously during component setup, and the memo calls
  // fetchGenrePersonalization(t). If this const is declared after the
  // memo, JavaScript's temporal dead zone (TDZ) throws
  // "Cannot access 'M' before initialization" (M = minified name of
  // fetchGenrePersonalization). This only triggers when taste() returns
  // a non-cold-start profile during the initial synchronous run — i.e.
  // on client-side navigation when the vault is already loaded.
  const fetchGenrePersonalization = (t: NonNullable<ReturnType<typeof taste>>) => {
    const topGenre = t.topGenres[0];
    if (!topGenre) return;
    setPersonalizedLabel(`Because you love ${topGenre}`);
    const genreId = genreIdFor(topGenre, "movie");
    if (!genreId) return;
    discoverMovies({ withGenres: [genreId], sortBy: "popularity.desc", voteCountGte: 200 })
      .then((titles) => {
        // Reuse the shared vaultKeys memo (composite "{media_type}/{id}"
        // shape) instead of rebuilding a per-call set. Same semantics.
        const vault = vaultKeys();
        setPersonalizedTitles(
          vault.size === 0
            ? titles.slice(0, 20)
            : titles.filter((t) => !vault.has(`${t.media_type}/${t.id}`)).slice(0, 20)
        );
      })
      .catch((e) => console.error("[DiscoverPage] personalized fetch:", e));
  };

  createMemo(() => {
    const t = taste();
    if (!t || t.isColdStart) return;
    if (t.seedTitle) {
      const seed = t.seedTitle;
      setPersonalizedLabel(`Because you watched ${seed.title || seed.name || "this"}`);
      import("~/core/tmdb/discover")
        .then(({ getRecommendations }) => getRecommendations(seed.media_type, seed.id))
        .then((recs) => {
          const vault = vaultKeys();
          const filtered = vault.size === 0
            ? recs
            : recs.filter((r) => !vault.has(`${r.media_type}/${r.id}`));
          if (filtered.length > 0) setPersonalizedTitles(filtered.slice(0, 20));
          else fetchGenrePersonalization(t);
        })
        .catch(() => fetchGenrePersonalization(t));
      return;
    }
    fetchGenrePersonalization(t);
  });

  // === Discover Something Different ===
  const [differentTitles, setDifferentTitles] = createSignal<TMDBTitle[]>([]);
  const [differentLabel, setDifferentLabel] = createSignal<string>("");

  createMemo(() => {
    const t = taste();
    if (!t || t.isColdStart || t.topGenres.length === 0) return;
    const allGenres = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Animation", "Documentary", "Mystery", "Thriller", "Fantasy"];
    const userGenres = new Set(t.topGenres);
    const differentGenre = allGenres.find((g) => !userGenres.has(g));
    if (!differentGenre) return;
    const displayName = differentGenre === "Sci-Fi" ? "Science Fiction" : differentGenre;
    setDifferentLabel(`Step outside — try ${differentGenre}`);
    const genreId = genreIdFor(displayName, "movie");
    if (!genreId) return;
    discoverMovies({ withGenres: [genreId], sortBy: "vote_average.desc", voteCountGte: 500, voteAverageGte: 7 })
      .then((titles) => {
        const vault = vaultKeys();
        const filtered = vault.size === 0
          ? titles
          : titles.filter((t) => !vault.has(`${t.media_type}/${t.id}`));
        setDifferentTitles(filtered.slice(0, 15));
      })
      .catch((e) => console.error("[DiscoverPage] different fetch:", e));
  });

  // === Surprise Me ===
  const [surpriseTitle, setSurpriseTitle] = createSignal<TMDBTitle | null>(null);
  const [surpriseLoading, setSurpriseLoading] = createSignal(false);

  const rollSurprise = () => {
    setSurpriseLoading(true);
    // Use the vault-filtered feeds so "Surprise Me" never surfaces a
    // title the user already has in their watchlist. The vault filter
    // is applied at the feed level (see trendingFeed etc. above), so
    // by the time we sample here the pool is already clean.
    const pool = [...trendingFeed(), ...topRatedMoviesFeed(), ...hiddenGemsFeed()]
      .filter((t) => t.poster_path && t.backdrop_path);
    if (pool.length === 0) { setSurpriseLoading(false); return; }
    // Defensive: re-check against the vault in case feeds were stale
    // when the memos were computed (shouldn't happen, but cheap to do).
    const vault = vaultKeys();
    const available = pool.filter((t) => !vault.has(`${t.media_type}/${t.id}`));
    const source = available.length > 0 ? available : pool;
    setSurpriseTitle(source[Math.floor(Math.random() * source.length)]);
    setSurpriseLoading(false);
  };

  createMemo(() => {
    if (feeds.trending().length > 0 && !surpriseTitle()) rollSurprise();
  });

  // === Weekend Picks ===
  const [weekendPick, setWeekendPick] = createSignal(0);
  const weekendPicks = [
    { label: "Perfect for Tonight", icon: "movie", query: { sortBy: "popularity.desc", voteCountGte: 500 } },
    { label: "Under 2 Hours", icon: "schedule", query: { sortBy: "vote_average.desc", voteCountGte: 500, withRuntimeLte: 120 } },
    { label: "Mind-Bending", icon: "psychology", query: { withGenres: [genreIdFor("Mystery", "movie") ?? 9648], sortBy: "vote_average.desc", voteCountGte: 500 } },
    { label: "Feel Good", icon: "sentiment_very_satisfied", query: { withGenres: [genreIdFor("Comedy", "movie") ?? 35], sortBy: "popularity.desc", voteCountGte: 500 } },
    { label: "Oscar Winners", icon: "emoji_events", query: { sortBy: "vote_average.desc", voteCountGte: 5000, voteAverageGte: 8 } },
    { label: "Cult Classics", icon: "local_fire_department", query: { sortBy: "vote_average.desc", voteCountGte: 1000, voteAverageGte: 7.5 } },
  ];
  const [weekendTitles, setWeekendTitles] = createSignal<TMDBTitle[]>([]);
  const [weekendLoading, setWeekendLoading] = createSignal(false);

  const fetchWeekendPick = async (index: number) => {
    const pick = weekendPicks[index];
    if (!pick) return;
    setWeekendLoading(true);
    setWeekendPick(index);
    try {
      const titles = await discoverMovies(pick.query);
      const vault = vaultKeys();
      const filtered = vault.size === 0
        ? titles
        : titles.filter((t) => !vault.has(`${t.media_type}/${t.id}`));
      setWeekendTitles(filtered.slice(0, 15));
    } catch (e) {
      console.error("[DiscoverPage] weekend pick fetch:", e);
      setWeekendTitles([]);
    } finally {
      setWeekendLoading(false);
    }
  };

  createMemo(() => {
    if (feeds.trending().length > 0 && weekendTitles().length === 0 && !weekendLoading()) fetchWeekendPick(0);
  });

  // === Insight Strip ===
  const insightCards = createMemo(() => {
    const cards: { icon: string; text: string }[] = [];
    // Use vault-filtered feeds so the counts reflect what the user
    // actually sees on the page (titles they haven't added yet).
    if (trendingFeed().length > 0) cards.push({ icon: "local_fire_department", text: `${trendingFeed().length} Trending Today` });
    if (personalizedTitles().length > 0) cards.push({ icon: "auto_awesome", text: `${personalizedTitles().length} Picks For You` });
    if (nowPlayingFeed().length > 0) cards.push({ icon: "theaters", text: `${nowPlayingFeed().length} In Cinemas` });
    if (newSeasonsFeed().length > 0) cards.push({ icon: "live_tv", text: `${newSeasonsFeed().length} New Episodes` });
    if (continueUniverses().length > 0) {
      const totalMissing = continueUniverses().reduce((sum: number, u) => sum + u.missing.length, 0);
      cards.push({ icon: "collections_bookmark", text: `${totalMissing} To Explore` });
    }
    if (differentTitles().length > 0) {
      const genre = differentLabel().replace("Step outside — try ", "");
      cards.push({ icon: "explore", text: `Try ${genre}` });
    }
    return cards;
  });

  // Loading state — true only during the initial feeds fetch (first paint).
  // We deliberately do NOT gate on vaultLoading() here: blocking the entire
  // Discover page until the vault fetches (2–15 seconds for large vaults)
  // prevented all feeds from showing. Generic sections (Trending, Top Rated,
  // etc.) are visible immediately; personalized sections gate on their own data.
  const isLoading = createMemo(() => feeds.loading() && trendingFeed().length === 0 && nowPlayingFeed().length === 0);

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="ambient-glow" aria-hidden="true" />

      {/* === SEARCH BAR (top — merged from the old /search page) === */}
      {/* The dedicated /search route is gone. Search now lives at the top
          of Discover so intentional discovery and serendipitous browsing
          share a single primary surface. Uses the same .search-bar styles
          as the old SearchHeader (sticky glass bar), but with a modifier
          class (.discover-search-bar-form) that disables sticky to avoid
          clashing with the AppHeader. */}
      <form
        class="search-bar-form discover-search-bar-form"
        onSubmit={handleSearchSubmit}
        role="search"
      >
        <div class="search-bar">
          <span
            class="material-symbols-outlined search-bar-icon"
            aria-hidden="true"
          >
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
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "18px" }}
                aria-hidden="true"
              >
                close
              </span>
            </button>
          </Show>
        </div>
        {/* Visually-hidden submit button for WCAG 3.2.2 compliance.
            Keyboard users can submit the form by pressing Enter while
            focused on the search input, but WCAG requires an explicit
            submit button. This is visually hidden but available to
            screen readers and keyboard navigation. */}
        <button type="submit" class="sr-only" aria-label="Submit search">
          Search
        </button>
      </form>

      <Show when={!isLoading()} fallback={<DiscoverSkeleton />}>
        {/* === SEARCH RESULTS MODE === */}
        {/* When the user has typed ≥2 chars, replace the Genre Explorer
            and Discover sections with the search results. This keeps
            the page focused on the search task. Clearing the query
            restores the default Discover layout below. */}
        <Show when={showSearchResults()} fallback={
          <div class="page-enter relative discover-folds">
            {/* 1. GENRE EXPLORER (moved up to position 1 — was position 14) */}
            {/* Chips are always visible; clicking a chip expands a
                continuous carousel of movies + series interleaved,
                with a Load-more trigger for pagination. */}
            <Show when={homepageConfig.isEnabled("genre_explorer")}>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Genre Explorer" error={e} />}>
              <DiscoverSection label="Genre Explorer" icon="palette">
                <GenreExplorer onSelect={handleOpenTitle} vaultKeys={vaultKeys} />
              </DiscoverSection>
            </ErrorBoundary>
            </Show>

            {/* 2. SPOTLIGHT */}
            <Show when={homepageConfig.isEnabled("spotlight")}>
            <Spotlight pick={spotlightPick} loading={spotlightLoading()} isGuest={isGuest()}
              vault={watchlist()} onDetails={handleOpenTitle} onAddToVault={addToVault} onReroll={handleReroll} />
            </Show>

            {/* 3. CONTINUE YOUR UNIVERSES */}
            <Show when={!isGuest() && continueUniverses().length > 0 && homepageConfig.isEnabled("continue_universes")}>
              <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Continue Universes" error={e} />}>
                <section class="discover-fold" aria-label="Continue your universes">
                  <div class="discover-fold-label">
                    <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">collections_bookmark</span>
                    Continue Your Universes
                  </div>
                  <div class="search-rail" role="list">
                    <For each={continueUniverses()}>
                      {(item) => (
                        <div class="discover-continue-card" role="listitem">
                          <p class="discover-continue-name">{item.universe.name}</p>
                          <p class="discover-continue-count">{item.missing.length} missing of {item.total}</p>
                          <div class="discover-continue-posters">
                            <For each={item.missing.slice(0, 3)}>
                              {(entry) => (
                                <img src={tmdbImage(entry.poster_path, "w92")} class="discover-continue-poster" loading="lazy" decoding="async"
                                  alt={entry.title || entry.name || ""}
                                  onClick={() => handleOpenTitle({ id: Number(entry.id), title: entry.title, name: entry.name, media_type: entry.media_type, poster_path: entry.poster_path, backdrop_path: entry.backdrop_path, release_date: entry.release_date, first_air_date: entry.first_air_date } as TMDBTitle)}
                                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
                              )}
                            </For>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </ErrorBoundary>
            </Show>

            {/* 4. INSIGHT STRIP */}
            <Show when={insightCards().length > 0 && homepageConfig.isEnabled("insight_strip")}>
              <div class="discover-insight-strip">
                <For each={insightCards()}>
                  {(card) => (
                    <div class="discover-insight-card">
                    <span class="material-symbols-outlined" style={{ "font-size": "14px", color: "var(--p)" }} aria-hidden="true">{card.icon}</span>
                    <span class="discover-insight-label">{card.text}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* 4. TRENDING THIS WEEK */}
          <Show when={homepageConfig.isEnabled("trending")}>
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Trending" error={e} />}>
            <DiscoverSection label="Trending This Week" icon="trending_up" loading={feeds.loading() && trendingFeed().length === 0}>
              <DiscoverRail
                titles={trendingFeed()}
                onSelect={handleOpenTitle}
                emptyText="No trending titles available."
                emptyIcon="trending_up"
                onRetry={trendingFeed().length === 0 && !feeds.loading() ? feeds.retry : undefined}
              />
            </DiscoverSection>
          </ErrorBoundary>
          </Show>

          {/* 5. IN THEATRES NOW */}
          <Show when={homepageConfig.isEnabled("theatres")}>
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Theatres" error={e} />}>
            <DiscoverSection label="In Theatres Now" icon="theaters" loading={feeds.loading() && nowPlayingFeed().length === 0}>
              <DiscoverRail
                titles={nowPlayingFeed()}
                onSelect={handleOpenTitle}
                emptyText="No theatre releases available."
                emptyIcon="theaters"
                onRetry={nowPlayingFeed().length === 0 && !feeds.loading() ? feeds.retry : undefined}
              />
            </DiscoverSection>
          </ErrorBoundary>
          </Show>

          {/* 6. BECAUSE YOU LOVE ... */}
          <Show when={!isGuest() && personalizedTitles().length > 0 && homepageConfig.isEnabled("because_you_love")}>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Recommendations" error={e} />}>
              <DiscoverSection label={personalizedLabel()} icon="auto_awesome">
                <DiscoverRail titles={personalizedTitles()} onSelect={handleOpenTitle} emptyText="No recommendations today." emptyIcon="auto_awesome" />
              </DiscoverSection>
            </ErrorBoundary>
          </Show>

          {/* 7. SURPRISE ME — gated by the 'random_picker' feature flag + homepage config */}
          <Show when={featureFlags.isEnabled("random_picker") && homepageConfig.isEnabled("surprise_me")}>
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Surprise Me" error={e} />}>
            <section class="discover-fold" aria-label="Surprise me">
              <div class="discover-fold-label">
                <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">casino</span>
                Surprise Me
              </div>
              <Show when={surpriseTitle() && !surpriseLoading()} fallback={<div class="discover-surprise-skeleton skeleton-base" />}>
                <div class="discover-surprise-card">
                  <Show when={surpriseTitle()?.backdrop_path}>
                    <img src={tmdbImage(surpriseTitle()!.backdrop_path, "w780")} class="discover-surprise-backdrop" loading="lazy" decoding="async" alt="" aria-hidden="true" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  </Show>
                  <div class="discover-surprise-overlay" />
                  <div class="discover-surprise-content">
                    <p class="discover-surprise-title">{surpriseTitle()?.title || surpriseTitle()?.name || "Untitled"}</p>
                    <p class="discover-surprise-meta">
                      {(surpriseTitle()?.release_date || surpriseTitle()?.first_air_date || "").split("-")[0] || ""}
                      {surpriseTitle()?.vote_average ? ` · ★ ${surpriseTitle()!.vote_average!.toFixed(1)}` : ""}
                      {surpriseTitle()?.genres?.length ? ` · ${(surpriseTitle()!.genres ?? []).slice(0, 2).join(", ")}` : ""}
                    </p>
                    <div class="discover-surprise-actions">
                      <button class="btn-primary focus-ring" onClick={() => surpriseTitle() && handleOpenTitle(surpriseTitle()!)} aria-label="View details">Details</button>
                      <button class="btn-primary focus-ring" onClick={() => surpriseTitle() && addToVault(surpriseTitle()!)} aria-label="Add to watchlist">Add to Watchlist</button>
                      <button class="btn-ghost focus-ring" onClick={rollSurprise} aria-label="Shuffle for another pick">
                        <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">shuffle</span>
                        Shuffle
                      </button>
                    </div>
                  </div>
                </div>
              </Show>
            </section>
          </ErrorBoundary>
          </Show>

          {/* 8. WEEKEND PICKS (lazy-mounted — below the fold on most viewports) */}
          <Show when={homepageConfig.isEnabled("weekend_picks")}>
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Weekend Picks" error={e} />}>
              <section class="discover-fold" aria-label="Weekend picks">
                <div class="discover-fold-label">
                  <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">weekend</span>
                  Weekend Picks
                </div>
                <div class="quick-filter-bar" style={{ "margin-bottom": "var(--sp-3)" }}>
                  <For each={weekendPicks}>
                    {(pick, i) => (
                      <button type="button" class="quick-filter-tab focus-ring" data-active={weekendPick() === i()} onClick={() => fetchWeekendPick(i())} aria-label={pick.label}>
                        <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">{pick.icon}</span>
                        {pick.label}
                      </button>
                    )}
                  </For>
                </div>
                <Show when={!weekendLoading()} fallback={
                  <div class="search-rail">
                    <For each={Array.from({ length: 6 })}>{() => <div class="search-rail-card" style={{ cursor: "default" }}><div class="search-rail-poster skeleton-base" /></div>}</For>
                  </div>
                }>
                  <DiscoverRail
                    titles={weekendTitles()}
                    onSelect={handleOpenTitle}
                    emptyText="No titles for this category."
                    emptyIcon="weekend"
                    onRetry={() => fetchWeekendPick(weekendPick())}
                  />
                </Show>
              </section>
            </ErrorBoundary>
          </LazyMount>
          </Show>

          {/* 9. STEP OUTSIDE YOUR TASTE */}
          <Show when={!isGuest() && differentTitles().length > 0 && homepageConfig.isEnabled("step_outside")}>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Something Different" error={e} />}>
              <DiscoverSection label={differentLabel()} icon="explore">
                <DiscoverRail titles={differentTitles()} onSelect={handleOpenTitle} emptyText="Try adding more titles to your watchlist for personalized recommendations." emptyIcon="explore" />
              </DiscoverSection>
            </ErrorBoundary>
          </Show>

          {/* 10. HIDDEN GEMS */}
          <Show when={homepageConfig.isEnabled("hidden_gems")}>
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Hidden Gems" error={e} />}>
              <DiscoverSection label="Hidden Gems" icon="diamond" loading={feeds.loading() && hiddenGemsFeed().length === 0}>
                <DiscoverRail
                  titles={hiddenGemsFeed()}
                  onSelect={handleOpenTitle}
                  emptyText="No hidden gems found."
                  emptyIcon="diamond"
                  onRetry={hiddenGemsFeed().length === 0 && !feeds.loading() ? feeds.retry : undefined}
                />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>
          </Show>

          {/* 11. TOP RATED MOVIES */}
          <Show when={homepageConfig.isEnabled("top_rated_movies")}>
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Top Rated" error={e} />}>
              <DiscoverSection label="Top Rated Movies" icon="star" loading={feeds.loading() && topRatedMoviesFeed().length === 0}>
                <DiscoverRail
                  titles={topRatedMoviesFeed()}
                  onSelect={handleOpenTitle}
                  emptyText="No top rated movies available."
                  emptyIcon="star"
                  onRetry={topRatedMoviesFeed().length === 0 && !feeds.loading() ? feeds.retry : undefined}
                />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>
          </Show>

          {/* 12. TOP RATED SERIES */}
          <Show when={homepageConfig.isEnabled("top_rated_series")}>
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Top Rated TV" error={e} />}>
              <DiscoverSection label="Top Rated Series" icon="tv" loading={feeds.loading() && topRatedTvFeed().length === 0}>
                <DiscoverRail
                  titles={topRatedTvFeed()}
                  onSelect={handleOpenTitle}
                  emptyText="No top rated series available."
                  emptyIcon="tv"
                  onRetry={topRatedTvFeed().length === 0 && !feeds.loading() ? feeds.retry : undefined}
                />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>
          </Show>

          {/* 13. NEW ON OTT (lazy-mounted — heavy section with provider list fetch) */}
          <Show when={homepageConfig.isEnabled("new_on_ott")}>
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="New on OTT" error={e} />}>
              <section class="discover-fold" aria-label="New on OTT">
                <div class="discover-fold-label">
                  <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">live_tv</span>
                  New on OTT
                </div>
                <OttSection onSelect={handleOpenTitle} region={region()} vaultKeys={vaultKeys} />
              </section>
            </ErrorBoundary>
          </LazyMount>
          </Show>

          {/* 14. NEW SEASONS (was position 15 — Genre Explorer moved up to position 1) */}
          <Show when={homepageConfig.isEnabled("new_seasons")}>
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="New Seasons" error={e} />}>
              <DiscoverSection label="New Seasons" icon="live_tv" loading={feeds.loading() && newSeasonsFeed().length === 0}>
                <DiscoverRail
                  titles={newSeasonsFeed()}
                  onSelect={handleOpenTitle}
                  emptyText="No new seasons airing now."
                  emptyIcon="live_tv"
                  onRetry={newSeasonsFeed().length === 0 && !feeds.loading() ? feeds.retry : undefined}
                />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>
          </Show>

          {/* 15. COMING SOON — gated by the 'upcoming' feature flag + homepage config */}
          <Show when={featureFlags.isEnabled("upcoming") && homepageConfig.isEnabled("coming_soon")}>
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Coming Soon" error={e} />}>
              <DiscoverSection label="Coming Soon" icon="upcoming" loading={feeds.loading() && upcomingFeed().length === 0}>
                <DiscoverRail
                  titles={upcomingFeed()}
                  onSelect={handleOpenTitle}
                  emptyText="No upcoming releases."
                  emptyIcon="upcoming"
                  onRetry={upcomingFeed().length === 0 && !feeds.loading() ? feeds.retry : undefined}
                />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>
          </Show>

          {/* 16. GUEST SIGN-IN CTA */}
          <Show when={isGuest()}>
            <div class="discover-guest-nudge">
              <p class="type-body-soft" style={{ "text-align": "center", "max-width": "280px", margin: "0 auto var(--sp-3)" }}>
                Sign in to make Spotlight yours — every pick adapts to what you love.
              </p>
              <button class="btn-primary focus-ring" onClick={handleLogin} style={{ margin: "0 auto", display: "flex" }}>
                <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">login</span>
                Sign In to Begin
              </button>
            </div>
          </Show>
        </div>
      }>
        {/* === SEARCH RESULTS (shown when query ≥ 2 chars, debounced) === */}
        {/* Reuses the existing SearchResults component from the search
            feature — same Movies / Series grouping, same vault-aware
            result rows, same loading + empty + error states. */}
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
