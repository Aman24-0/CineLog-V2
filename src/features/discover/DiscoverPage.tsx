// src/features/discover/DiscoverPage.tsx
//
// DiscoverPage — "Your Personal Movie Curator"
//
// FINAL SECTION ORDER (per production spec):
//   1. Spotlight (existing hero)
//   2. Continue Your Universes
//   3. Insight Strip
//   4. Trending This Week
//   5. In Theatres Now
//   6. Because You Love ...
//   7. Surprise Me
//   8. Weekend Picks
//   9. Step Outside Your Taste
//  10. Hidden Gems
//  11. Top Rated Movies
//  12. Top Rated Series
//  13. New on OTT (provider chips + carousel)
//  14. Genre Explorer
//  15. New Seasons
//  16. Coming Soon
//  17. Guest Sign-in CTA
//
// Editorial cards are inserted between sections to break up visual repetition.
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
import { useDiscoverTaste } from "./hooks/useDiscoverTaste";
import { useSpotlight } from "./hooks/useSpotlight";
import { useDiscoverFeeds } from "./hooks/useDiscoverFeeds";
import { useDiscoverActions } from "./useDiscoverActions";
import { useCuratedUniverses } from "~/features/collections/hooks/useCuratedUniverses";
import Spotlight from "./components/Spotlight";
import DiscoverRail from "./components/DiscoverRail";
import GenreExplorer from "./components/GenreExplorer";
import OttSection from "./components/OttSection";
import EditorialCard from "./components/EditorialCard";
import DiscoverSkeleton from "./components/DiscoverSkeleton";
import LazyMount from "./components/LazyMount";
import PremiumEmptyState from "./components/PremiumEmptyState";
import { discoverMovies, genreIdFor } from "~/core/tmdb/discover";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { getDiscoverRegion } from "~/core/config/discoverRegion";
import type { TMDBTitle } from "~/shared/types";

export default function DiscoverPage() {
  const { watchlist, isGuest } = useUserLibrary();
  const { profile: taste } = useDiscoverTaste({ watchlist, isGuest });

  // Region — single source of truth. All sections consume this value.
  // Today: defaults to "IN". Tomorrow: overridden by Settings.
  const region = getDiscoverRegion;

  const [spotlightSeed, setSpotlightSeed] = createSignal(0);
  const [spotlightExclude, setSpotlightExclude] = createSignal<number | null>(null);
  const { pick: spotlightPick, loading: spotlightLoading } = useSpotlight({
    taste, vault: watchlist, excludeId: spotlightExclude, seed: spotlightSeed,
  });

  const feeds = useDiscoverFeeds(region());
  const { subscribedUniverses } = useCuratedUniverses();
  const { handleOpenTitle, addToVault, handleLogin } = useDiscoverActions({ watchlist, isGuest });

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
        const vaultIds = new Set(watchlist().map((w) => w.id));
        setPersonalizedTitles(titles.filter((t) => !vaultIds.has(String(t.id))).slice(0, 20));
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
          const vaultIds = new Set(watchlist().map((w) => w.id));
          const filtered = recs.filter((r) => !vaultIds.has(String(r.id))).slice(0, 20);
          if (filtered.length > 0) setPersonalizedTitles(filtered);
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
        const vaultIds = new Set(watchlist().map((w) => w.id));
        setDifferentTitles(titles.filter((t) => !vaultIds.has(String(t.id))).slice(0, 15));
      })
      .catch((e) => console.error("[DiscoverPage] different fetch:", e));
  });

  // === Surprise Me ===
  const [surpriseTitle, setSurpriseTitle] = createSignal<TMDBTitle | null>(null);
  const [surpriseLoading, setSurpriseLoading] = createSignal(false);

  const rollSurprise = () => {
    setSurpriseLoading(true);
    const pool = [...feeds.trending(), ...feeds.topRatedMovies(), ...feeds.hiddenGems()]
      .filter((t) => t.poster_path && t.backdrop_path);
    if (pool.length === 0) { setSurpriseLoading(false); return; }
    const vaultIds = new Set(watchlist().map((w) => w.id));
    const available = pool.filter((t) => !vaultIds.has(String(t.id)));
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
      const vaultIds = new Set(watchlist().map((w) => w.id));
      setWeekendTitles(titles.filter((t) => !vaultIds.has(String(t.id))).slice(0, 15));
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

  // === Editorial Cards ===
  // Generate dynamic editorial copy from movie metadata
  const editorial1 = createMemo(() => {
    const t = feeds.trending()[0];
    if (!t) return null;
    const year = (t.release_date || "").split("-")[0];
    return {
      title: t,
      label: "Tonight's Pick",
      icon: "popcorn",
      copy: `${t.title || t.name || "This title"} is trending right now${year ? ` (${year})` : ""}${t.vote_average ? ` with a ${t.vote_average.toFixed(1)} rating` : ""}. Perfect for tonight.`,
    };
  });

  const editorial2 = createMemo(() => {
    const t = feeds.hiddenGems()[0];
    if (!t) return null;
    return {
      title: t,
      label: "Hidden Masterpiece",
      icon: "diamond",
      copy: `A critically acclaimed gem with a ${t.vote_average?.toFixed(1) ?? "high"} rating that deserves more attention. ${t.title || t.name || ""} is a true hidden masterpiece.`,
    };
  });

  // === Insight Strip ===
  const insightCards = createMemo(() => {
    const cards: { icon: string; text: string }[] = [];
    if (feeds.trending().length > 0) cards.push({ icon: "local_fire_department", text: `${feeds.trending().length} Trending Today` });
    if (personalizedTitles().length > 0) cards.push({ icon: "auto_awesome", text: `${personalizedTitles().length} Picks For You` });
    if (feeds.nowPlaying().length > 0) cards.push({ icon: "theaters", text: `${feeds.nowPlaying().length} In Cinemas` });
    if (feeds.newSeasons().length > 0) cards.push({ icon: "live_tv", text: `${feeds.newSeasons().length} New Episodes` });
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

  const isLoading = createMemo(() => taste() === undefined);

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <div class="ambient-glow" aria-hidden="true" />

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
          {/* 1. SPOTLIGHT */}
          <Spotlight pick={spotlightPick} loading={spotlightLoading} isGuest={isGuest()}
            vault={watchlist()} onDetails={handleOpenTitle} onAddToVault={addToVault} onReroll={handleReroll} />

          {/* 2. CONTINUE YOUR UNIVERSES */}
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

          {/* 3. INSIGHT STRIP */}
          <Show when={insightCards().length > 0}>
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
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Trending" error={e} />}>
            <DiscoverSection label="Trending This Week" icon="trending_up" loading={feeds.loading() && feeds.trending().length === 0}>
              <DiscoverRail
                titles={feeds.trending()}
                onSelect={handleOpenTitle}
                emptyText="No trending titles available."
                emptyIcon="trending_up"
                onRetry={feeds.trending().length === 0 && !feeds.loading() ? feeds.retry : undefined}
              />
            </DiscoverSection>
          </ErrorBoundary>

          {/* EDITORIAL CARD 1 */}
          <Show when={editorial1()}>
            {(ed) => (
              <ErrorBoundary fallback={() => <div />}>
                <EditorialCard title={ed().title} label={ed().label} icon={ed().icon} copy={ed().copy} onDetails={handleOpenTitle} />
              </ErrorBoundary>
            )}
          </Show>

          {/* 5. IN THEATRES NOW */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Theatres" error={e} />}>
            <DiscoverSection label="In Theatres Now" icon="theaters" loading={feeds.loading() && feeds.nowPlaying().length === 0}>
              <DiscoverRail
                titles={feeds.nowPlaying()}
                onSelect={handleOpenTitle}
                emptyText="No theatre releases available."
                emptyIcon="theaters"
                onRetry={feeds.nowPlaying().length === 0 && !feeds.loading() ? feeds.retry : undefined}
              />
            </DiscoverSection>
          </ErrorBoundary>

          {/* 6. BECAUSE YOU LOVE ... */}
          <Show when={!isGuest() && personalizedTitles().length > 0}>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Recommendations" error={e} />}>
              <DiscoverSection label={personalizedLabel()} icon="auto_awesome">
                <DiscoverRail titles={personalizedTitles()} onSelect={handleOpenTitle} emptyText="No recommendations today." emptyIcon="auto_awesome" />
              </DiscoverSection>
            </ErrorBoundary>
          </Show>

          {/* 7. SURPRISE ME */}
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

          {/* 8. WEEKEND PICKS (lazy-mounted — below the fold on most viewports) */}
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

          {/* 9. STEP OUTSIDE YOUR TASTE */}
          <Show when={!isGuest() && differentTitles().length > 0}>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Something Different" error={e} />}>
              <DiscoverSection label={differentLabel()} icon="explore">
                <DiscoverRail titles={differentTitles()} onSelect={handleOpenTitle} emptyText="Try adding more titles to your watchlist for personalized recommendations." emptyIcon="explore" />
              </DiscoverSection>
            </ErrorBoundary>
          </Show>

          {/* EDITORIAL CARD 2 */}
          <Show when={editorial2()}>
            {(ed) => (
              <ErrorBoundary fallback={() => <div />}>
                <EditorialCard title={ed().title} label={ed().label} icon={ed().icon} copy={ed().copy} onDetails={handleOpenTitle} />
              </ErrorBoundary>
            )}
          </Show>

          {/* 10. HIDDEN GEMS */}
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Hidden Gems" error={e} />}>
              <DiscoverSection label="Hidden Gems" icon="diamond" loading={feeds.loading() && feeds.hiddenGems().length === 0}>
                <DiscoverRail
                  titles={feeds.hiddenGems()}
                  onSelect={handleOpenTitle}
                  emptyText="No hidden gems found."
                  emptyIcon="diamond"
                  onRetry={feeds.hiddenGems().length === 0 && !feeds.loading() ? feeds.retry : undefined}
                />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>

          {/* 11. TOP RATED MOVIES */}
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Top Rated" error={e} />}>
              <DiscoverSection label="Top Rated Movies" icon="star" loading={feeds.loading() && feeds.topRatedMovies().length === 0}>
                <DiscoverRail
                  titles={feeds.topRatedMovies()}
                  onSelect={handleOpenTitle}
                  emptyText="No top rated movies available."
                  emptyIcon="star"
                  onRetry={feeds.topRatedMovies().length === 0 && !feeds.loading() ? feeds.retry : undefined}
                />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>

          {/* 12. TOP RATED SERIES */}
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Top Rated TV" error={e} />}>
              <DiscoverSection label="Top Rated Series" icon="tv" loading={feeds.loading() && feeds.topRatedTv().length === 0}>
                <DiscoverRail
                  titles={feeds.topRatedTv()}
                  onSelect={handleOpenTitle}
                  emptyText="No top rated series available."
                  emptyIcon="tv"
                  onRetry={feeds.topRatedTv().length === 0 && !feeds.loading() ? feeds.retry : undefined}
                />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>

          {/* 13. NEW ON OTT (lazy-mounted — heavy section with provider list fetch) */}
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="New on OTT" error={e} />}>
              <section class="discover-fold" aria-label="New on OTT">
                <div class="discover-fold-label">
                  <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">live_tv</span>
                  New on OTT
                </div>
                <OttSection onSelect={handleOpenTitle} region={region()} />
              </section>
            </ErrorBoundary>
          </LazyMount>

          {/* 14. GENRE EXPLORER (lazy-mounted — fetches only on first tap) */}
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Genre Explorer" error={e} />}>
              <DiscoverSection label="Genre Explorer" icon="palette">
                <GenreExplorer onSelect={handleOpenTitle} />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>

          {/* 15. NEW SEASONS */}
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="New Seasons" error={e} />}>
              <DiscoverSection label="New Seasons" icon="live_tv" loading={feeds.loading() && feeds.newSeasons().length === 0}>
                <DiscoverRail
                  titles={feeds.newSeasons()}
                  onSelect={handleOpenTitle}
                  emptyText="No new seasons airing now."
                  emptyIcon="live_tv"
                  onRetry={feeds.newSeasons().length === 0 && !feeds.loading() ? feeds.retry : undefined}
                />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>

          {/* 16. COMING SOON */}
          <LazyMount>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Coming Soon" error={e} />}>
              <DiscoverSection label="Coming Soon" icon="upcoming" loading={feeds.loading() && feeds.upcoming().length === 0}>
                <DiscoverRail
                  titles={feeds.upcoming()}
                  onSelect={handleOpenTitle}
                  emptyText="No upcoming releases."
                  emptyIcon="upcoming"
                  onRetry={feeds.upcoming().length === 0 && !feeds.loading() ? feeds.retry : undefined}
                />
              </DiscoverSection>
            </ErrorBoundary>
          </LazyMount>

          {/* 17. GUEST SIGN-IN CTA */}
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

function DiscoverSection(props: { label: string; icon: string; loading?: boolean; children: import("solid-js").JSX.Element; }) {
  return (
    <section class="discover-fold" aria-label={props.label}>
      <div class="discover-fold-label">
        <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">{props.icon}</span>
        {props.label}
      </div>
      <Show when={!props.loading} fallback={
        <div class="search-rail">
          <For each={Array.from({ length: 6 })}>{() => <div class="search-rail-card" style={{ cursor: "default" }}><div class="search-rail-poster skeleton-base" /></div>}</For>
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
        <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--text-dim)" }} aria-hidden="true">error</span>
        {props.label}
      </div>
      <PremiumEmptyState
        icon="error"
        message={`Couldn't load ${props.label}.`}
        hint="Check your connection and try again."
      />
    </section>
  );
}
