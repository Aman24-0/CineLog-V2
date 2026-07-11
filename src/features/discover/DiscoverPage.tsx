// src/features/discover/DiscoverPage.tsx
//
// DiscoverPage — "Your Personal Movie Curator"
//
// A premium personalized discovery experience.
//
// SECTIONS (in order):
//   0. Spotlight (existing hero — kept as-is)
//   1. Premium Insight Strip (upgraded with meaningful labels)
//   2. Continue Your Universes (missing entries from subscribed universes)
//   3. Trending This Week
//   4. In Theatres Now
//   5. Because You Like... (personalized by top genres + seed title)
//   6. Discover Something Different (genres the user rarely watches)
//   7. Weekend Picks (themed mini-collections)
//   8. Surprise Me (large shuffle card)
//   9. Hidden Gems
//  10. Top Rated Movies
//  11. Top Rated Series
//  12. Genre Explorer (expandable)
//  13. New Seasons
//  14. Coming Soon
//  15. Guest sign-in nudge
//
// Architecture:
//   - useDiscoverFeeds: fetches all TMDB feeds in parallel (cached)
//   - useDiscoverTaste: existing taste profile (for personalization)
//   - useSpotlight: existing hero recommendation
//   - useCuratedUniverses: existing subscribed universes
//   - Each section is independent — failures don't block others
//   - All TMDB calls use cachedFetch (no duplicate requests)

import { createSignal, createMemo, Show, For, ErrorBoundary, onMount, type Accessor } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import PageContainer from "~/shared/ui/PageContainer";
import { useDiscoverTaste } from "./hooks/useDiscoverTaste";
import { useSpotlight } from "./hooks/useSpotlight";
import { useDiscoverFeeds } from "./hooks/useDiscoverFeeds";
import { useDiscoverActions } from "./useDiscoverActions";
import { useCuratedUniverses } from "~/features/collections/hooks/useCuratedUniverses";
import Spotlight from "./components/Spotlight";
import DiscoverRail from "./components/DiscoverRail";
import GenreExplorer from "./components/GenreExplorer";
import DiscoverSkeleton from "./components/DiscoverSkeleton";
import { discoverMovies, genreIdFor, getTrending } from "~/core/tmdb/discover";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle, WatchlistItem, Collection } from "~/shared/types";

export default function DiscoverPage() {
  const { watchlist, isGuest } = useUserLibrary();
  const { profile: taste } = useDiscoverTaste({ watchlist, isGuest });

  // Spotlight (existing hero)
  const [spotlightSeed, setSpotlightSeed] = createSignal(0);
  const [spotlightExclude, setSpotlightExclude] = createSignal<number | null>(null);
  const { pick: spotlightPick, loading: spotlightLoading } = useSpotlight({
    taste,
    vault: watchlist,
    excludeId: spotlightExclude,
    seed: spotlightSeed,
  });

  // All TMDB feeds in parallel
  const feeds = useDiscoverFeeds("IN");

  // Subscribed universes (for "Continue Your Universes")
  const { subscribedUniverses } = useCuratedUniverses();

  const { handleOpenTitle, addToVault, handleLogin } = useDiscoverActions({
    watchlist,
    isGuest,
  });

  // Re-roll the Spotlight
  const handleReroll = () => {
    const current = spotlightPick();
    if (current) setSpotlightExclude(current.title.id);
    setSpotlightSeed((s) => s + Math.floor(Math.random() * 997) + 1);
  };

  // === SECTION: Continue Your Universes ===
  // Find subscribed universes where the user is missing entries.
  const continueUniverses = createMemo(() => {
    const vault = watchlist();
    const vaultIds = new Set(vault.map((w) => w.id));
    return subscribedUniverses()
      .map((uni) => {
        const entries = uni.entries ?? [];
        const missing = entries.filter(
          (e) => !vaultIds.has(String(e.id)) && e.poster_path
        );
        return { universe: uni, missing, total: entries.length };
      })
      .filter((item) => item.missing.length > 0)
      .slice(0, 5);
  });

  // === SECTION: Because You Like... ===
  // Personalized by top genres + seed title recommendations
  const [personalizedTitles, setPersonalizedTitles] = createSignal<TMDBTitle[]>([]);
  const [personalizedLabel, setPersonalizedLabel] = createSignal<string>("");

  createMemo(() => {
    const t = taste();
    if (!t || t.isColdStart) return;

    // Try seed title first ("Because you watched X")
    if (t.seedTitle) {
      const seed = t.seedTitle;
      const label = `Because you watched ${seed.title || seed.name || "this"}`;
      setPersonalizedLabel(label);
      // Use TMDB recommendations from the seed title
      import("~/core/tmdb/discover")
        .then(({ getRecommendations }) =>
          getRecommendations(seed.media_type, seed.id)
        )
        .then((recs) => {
          const vaultIds = new Set(watchlist().map((w) => w.id));
          const filtered = recs.filter((r) => !vaultIds.has(String(r.id))).slice(0, 20);
          if (filtered.length > 0) {
            setPersonalizedTitles(filtered);
          } else {
            // Fallback to genre-based
            fetchGenrePersonalization(t);
          }
        })
        .catch(() => fetchGenrePersonalization(t));
      return;
    }

    // Fallback: genre-based ("Because you love Thriller")
    fetchGenrePersonalization(t);
  });

  const fetchGenrePersonalization = (t: NonNullable<ReturnType<typeof taste>>) => {
    const topGenre = t.topGenres[0];
    if (!topGenre) return;
    setPersonalizedLabel(`Because you love ${topGenre}`);
    const genreId = genreIdFor(topGenre, "movie");
    if (!genreId) return;
    discoverMovies({ withGenres: [genreId], sortBy: "popularity.desc", voteCountGte: 200 })
      .then((titles) => {
        const vaultIds = new Set(watchlist().map((w) => w.id));
        setPersonalizedTitles(titles.filter((t) => !vaultIds.has(String(t.id))).slice(0, 20));
      })
      .catch((e) => console.error("[DiscoverPage] personalized fetch:", e));
  };

  // === SECTION: Discover Something Different ===
  // Find genres the user rarely watches and recommend highly-rated titles
  const [differentTitles, setDifferentTitles] = createSignal<TMDBTitle[]>([]);
  const [differentLabel, setDifferentLabel] = createSignal<string>("");

  createMemo(() => {
    const t = taste();
    if (!t || t.isColdStart) return;
    if (t.topGenres.length === 0) return;

    // Find a genre NOT in the user's top 3
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
        const vaultIds = new Set(watchlist().map((w) => w.id));
        setDifferentTitles(titles.filter((t) => !vaultIds.has(String(t.id))).slice(0, 15));
      })
      .catch((e) => console.error("[DiscoverPage] different fetch:", e));
  });

  // === SECTION: Surprise Me ===
  // A large shuffle card with a random title from top-rated or trending
  const [surpriseTitle, setSurpriseTitle] = createSignal<TMDBTitle | null>(null);
  const [surpriseLoading, setSurpriseLoading] = createSignal(false);

  const rollSurprise = () => {
    setSurpriseLoading(true);
    // Pick from trending + top rated + hidden gems pool
    const pool = [
      ...feeds.trending(),
      ...feeds.topRatedMovies(),
      ...feeds.hiddenGems(),
    ].filter((t) => t.poster_path && t.backdrop_path);

    if (pool.length === 0) {
      setSurpriseLoading(false);
      return;
    }

    // Filter out vault titles
    const vaultIds = new Set(watchlist().map((w) => w.id));
    const available = pool.filter((t) => !vaultIds.has(String(t.id)));
    const source = available.length > 0 ? available : pool;
    const random = source[Math.floor(Math.random() * source.length)];
    setSurpriseTitle(random);
    setSurpriseLoading(false);
  };

  // Roll once when feeds load
  createMemo(() => {
    if (feeds.trending().length > 0 && !surpriseTitle()) {
      rollSurprise();
    }
  });

  // === SECTION: Weekend Picks ===
  // Themed mini-collections with curated labels
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
      const vaultIds = new Set(watchlist().map((w) => w.id));
      setWeekendTitles(titles.filter((t) => !vaultIds.has(String(t.id))).slice(0, 15));
    } catch (e) {
      console.error("[DiscoverPage] weekend pick fetch:", e);
      setWeekendTitles([]);
    } finally {
      setWeekendLoading(false);
    }
  };

  // Fetch the first weekend pick when feeds load
  createMemo(() => {
    if (feeds.trending().length > 0 && weekendTitles().length === 0 && !weekendLoading()) {
      fetchWeekendPick(0);
    }
  });

  // === Premium insight strip (upgraded with meaningful labels) ===
  const insightCards = createMemo(() => {
    const cards: { icon: string; text: string }[] = [];
    if (feeds.trending().length > 0) {
      cards.push({ icon: "local_fire_department", text: `${feeds.trending().length} trending now` });
    }
    if (feeds.nowPlaying().length > 0) {
      cards.push({ icon: "theaters", text: `${feeds.nowPlaying().length} in theatres` });
    }
    if (feeds.newSeasons().length > 0) {
      cards.push({ icon: "live_tv", text: `${feeds.newSeasons().length} new episodes` });
    }
    if (personalizedTitles().length > 0) {
      cards.push({ icon: "auto_awesome", text: `${personalizedTitles().length} picks for you` });
    }
    if (continueUniverses().length > 0) {
      const totalMissing = continueUniverses().reduce((sum, u) => sum + u.missing.length, 0);
      cards.push({ icon: "collections_bookmark", text: `${totalMissing} to explore` });
    }
    if (differentTitles().length > 0) {
      cards.push({ icon: "explore", text: `Try ${differentLabel().replace("Step outside — try ", "")}` });
    }
    return cards;
  });

  const isLoading = createMemo(() => taste() === undefined);

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <div class="ambient-glow" aria-hidden="true" />

      {/* Page eyebrow */}
      <div class="discover-eyebrow-block">
        <p class="discover-eyebrow">Discover</p>
        <h1 class="discover-page-title">What's next?</h1>
        <p class="discover-page-subtitle">
          {isGuest()
            ? "Sign in to make this yours — Spotlight adapts to your taste."
            : taste()?.isColdStart
              ? "Add a few titles to your watchlist and Spotlight will learn your taste."
              : "Hand-picked from your taste graph. Save what catches your eye."}
        </p>
      </div>

      <Show when={!isLoading()} fallback={<DiscoverSkeleton />}>
        <div class="page-enter relative discover-folds">
          {/* FOLD 0 — Spotlight (existing hero, kept as-is) */}
          <Spotlight
            pick={spotlightPick}
            loading={spotlightLoading}
            isGuest={isGuest()}
            vault={watchlist()}
            onDetails={handleOpenTitle}
            onAddToVault={addToVault}
            onReroll={handleReroll}
          />

          {/* Premium insight strip (upgraded with meaningful labels) */}
          <Show when={insightCards().length > 0}>
            <div class="discover-insight-strip">
              <For each={insightCards()}>
                {(card) => (
                  <div class="discover-insight-card">
                    <span class="material-symbols-outlined" style={{ "font-size": "14px", color: "var(--p)" }} aria-hidden="true">
                      {card.icon}
                    </span>
                    <span class="discover-insight-label">{card.text}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* FOLD 1 — Continue Your Universes */}
          <Show when={!isGuest() && continueUniverses().length > 0}>
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
                              <img
                                src={tmdbImage(entry.poster_path, "w92")}
                                class="discover-continue-poster"
                                loading="lazy"
                                decoding="async"
                                alt={entry.title || entry.name || ""}
                                onClick={() => handleOpenTitle({
                                  id: Number(entry.id),
                                  title: entry.title,
                                  name: entry.name,
                                  media_type: entry.media_type,
                                  poster_path: entry.poster_path,
                                  backdrop_path: entry.backdrop_path,
                                  release_date: entry.release_date,
                                  first_air_date: entry.first_air_date,
                                } as TMDBTitle)}
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
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

          {/* FOLD 2 — Trending This Week */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Trending" error={e} />}>
            <DiscoverSection label="Trending This Week" icon="trending_up" loading={feeds.loading() && feeds.trending().length === 0}>
              <DiscoverRail titles={feeds.trending()} onSelect={handleOpenTitle} emptyText="No trending titles available." />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 3 — In Theatres Now */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Theatres" error={e} />}>
            <DiscoverSection label="In Theatres Now" icon="theaters" loading={feeds.loading() && feeds.nowPlaying().length === 0}>
              <DiscoverRail titles={feeds.nowPlaying()} onSelect={handleOpenTitle} emptyText="No theatre releases available." />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 4 — Because You Like... */}
          <Show when={!isGuest() && personalizedTitles().length > 0}>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Recommendations" error={e} />}>
              <DiscoverSection label={personalizedLabel()} icon="auto_awesome">
                <DiscoverRail titles={personalizedTitles()} onSelect={handleOpenTitle} emptyText="No recommendations today." />
              </DiscoverSection>
            </ErrorBoundary>
          </Show>

          {/* FOLD 5 — Surprise Me (large shuffle card) */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Surprise Me" error={e} />}>
            <section class="discover-fold" aria-label="Surprise me">
              <div class="discover-fold-label">
                <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">casino</span>
                Surprise Me
              </div>
              <Show when={surpriseTitle() && !surpriseLoading()} fallback={
                <div class="discover-surprise-skeleton skeleton-base" />
              }>
                <div class="discover-surprise-card">
                  <Show when={surpriseTitle()?.backdrop_path}>
                    <img
                      src={tmdbImage(surpriseTitle()!.backdrop_path, "w780")}
                      class="discover-surprise-backdrop"
                      loading="lazy"
                      decoding="async"
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
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
                      <button class="btn-primary focus-ring" onClick={() => surpriseTitle() && handleOpenTitle(surpriseTitle()!)} aria-label="View details">
                        Details
                      </button>
                      <button class="btn-primary focus-ring" onClick={() => surpriseTitle() && addToVault(surpriseTitle()!)} aria-label="Add to watchlist">
                        Add to Watchlist
                      </button>
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

          {/* FOLD 6 — Weekend Picks (themed mini-collections) */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Weekend Picks" error={e} />}>
            <section class="discover-fold" aria-label="Weekend picks">
              <div class="discover-fold-label">
                <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">weekend</span>
                Weekend Picks
              </div>
              <div class="quick-filter-bar" style={{ "margin-bottom": "var(--sp-3)" }}>
                <For each={weekendPicks}>
                  {(pick, i) => (
                    <button
                      type="button"
                      class="quick-filter-tab focus-ring"
                      data-active={weekendPick() === i()}
                      onClick={() => fetchWeekendPick(i())}
                      aria-label={pick.label}
                    >
                      <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">{pick.icon}</span>
                      {pick.label}
                    </button>
                  )}
                </For>
              </div>
              <Show when={!weekendLoading()} fallback={
                <div class="search-rail">
                  <For each={Array.from({ length: 6 })}>
                    {() => <div class="search-rail-card" style={{ cursor: "default" }}><div class="search-rail-poster skeleton-base" /></div>}
                  </For>
                </div>
              }>
                <DiscoverRail titles={weekendTitles()} onSelect={handleOpenTitle} emptyText="No titles for this category." />
              </Show>
            </section>
          </ErrorBoundary>

          {/* FOLD 7 — Discover Something Different */}
          <Show when={!isGuest() && differentTitles().length > 0}>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Something Different" error={e} />}>
              <DiscoverSection label={differentLabel()} icon="explore">
                <DiscoverRail titles={differentTitles()} onSelect={handleOpenTitle} emptyText="Try adding more titles to your watchlist for personalized recommendations." />
              </DiscoverSection>
            </ErrorBoundary>
          </Show>

          {/* FOLD 8 — Hidden Gems */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Hidden Gems" error={e} />}>
            <DiscoverSection label="Hidden Gems" icon="diamond" loading={feeds.loading() && feeds.hiddenGems().length === 0}>
              <DiscoverRail titles={feeds.hiddenGems()} onSelect={handleOpenTitle} emptyText="No hidden gems found." />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 9 — Top Rated Movies */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Top Rated" error={e} />}>
            <DiscoverSection label="Top Rated Movies" icon="star" loading={feeds.loading() && feeds.topRatedMovies().length === 0}>
              <DiscoverRail titles={feeds.topRatedMovies()} onSelect={handleOpenTitle} emptyText="No top rated movies available." />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 10 — Top Rated Series */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Top Rated TV" error={e} />}>
            <DiscoverSection label="Top Rated Series" icon="tv" loading={feeds.loading() && feeds.topRatedTv().length === 0}>
              <DiscoverRail titles={feeds.topRatedTv()} onSelect={handleOpenTitle} emptyText="No top rated series available." />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 11 — Genre Explorer */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Genre Explorer" error={e} />}>
            <DiscoverSection label="Genre Explorer" icon="palette">
              <GenreExplorer onSelect={handleOpenTitle} />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 12 — New Seasons */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="New Seasons" error={e} />}>
            <DiscoverSection label="New Seasons" icon="live_tv" loading={feeds.loading() && feeds.newSeasons().length === 0}>
              <DiscoverRail titles={feeds.newSeasons()} onSelect={handleOpenTitle} emptyText="No new seasons airing now." />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 13 — Coming Soon */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Coming Soon" error={e} />}>
            <DiscoverSection label="Coming Soon" icon="upcoming" loading={feeds.loading() && feeds.upcoming().length === 0}>
              <DiscoverRail titles={feeds.upcoming()} onSelect={handleOpenTitle} emptyText="No upcoming releases." />
            </DiscoverSection>
          </ErrorBoundary>

          {/* Guest sign-in nudge */}
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
      </Show>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function DiscoverSection(props: {
  label: string;
  icon: string;
  loading?: boolean;
  children: import("solid-js").JSX.Element;
}) {
  return (
    <section class="discover-fold" aria-label={props.label}>
      <div class="discover-fold-label">
        <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">
          {props.icon}
        </span>
        {props.label}
      </div>
      <Show when={!props.loading} fallback={
        <div class="search-rail">
          <For each={Array.from({ length: 6 })}>
            {() => (
              <div class="search-rail-card" style={{ cursor: "default" }}>
                <div class="search-rail-poster skeleton-base" />
              </div>
            )}
          </For>
        </div>
      }>
        {props.children}
      </Show>
    </section>
  );
}

function DiscoverSectionError(props: { label: string; error: Error }) {
  console.error(`[DiscoverPage] ${props.label} section error:`, props.error);
  return (
    <section class="discover-fold">
      <div class="discover-fold-label">
        <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--text-dim)" }} aria-hidden="true">
          error
        </span>
        {props.label}
      </div>
      <p class="type-body-soft" style={{ "text-align": "center", padding: "var(--sp-4)" }}>
        Couldn't load this section.
      </p>
    </section>
  );
}
