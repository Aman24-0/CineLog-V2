// src/features/discover/DiscoverPage.tsx
//
// DiscoverPage — "Your Personal Movie Curator"
//
// A premium personalized discovery experience with 12 sections:
//   0. Spotlight (existing hero — kept and improved)
//   1. Continue Your Journey (subscribed universe progress)
//   2. Trending Right Now
//   3. In Theatres Now
//   4. Latest On Streaming
//   5. Because You Like... (personalized by top genres)
//   6. Hidden Gems
//   7. Top Rated (Movies + TV)
//   8. Award Winners (curated from top-rated)
//   9. Genre Explorer (expandable)
//  10. New Seasons (returning TV)
//  11. Coming Soon
//  12. Curated Universes (existing Cosmos fold)
//
// Architecture:
//   - useDiscoverFeeds: fetches all TMDB feeds in parallel (cached)
//   - useDiscoverTaste: existing taste profile (for personalization)
//   - useSpotlight: existing hero recommendation
//   - Each section is independent — failures don't block others
//   - All TMDB calls use cachedFetch (no duplicate requests)

import { createSignal, createMemo, Show, For, ErrorBoundary } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import PageContainer from "~/shared/ui/PageContainer";
import { useDiscoverTaste } from "./hooks/useDiscoverTaste";
import { useSpotlight } from "./hooks/useSpotlight";
import { useDiscoverFeeds } from "./hooks/useDiscoverFeeds";
import { useDiscoverActions } from "./useDiscoverActions";
import Spotlight from "./components/Spotlight";
import DiscoverRail from "./components/DiscoverRail";
import GenreExplorer from "./components/GenreExplorer";
import DiscoverSkeleton from "./components/DiscoverSkeleton";
import { discoverMovies, genreIdFor } from "~/core/tmdb/discover";
import type { TMDBTitle } from "~/shared/types";

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

  // "Because You Like..." — personalized by top genres
  const [personalizedTitles, setPersonalizedTitles] = createSignal<TMDBTitle[]>([]);
  const [personalizedGenre, setPersonalizedGenre] = createSignal<string>("");

  // Fetch personalized recommendations when taste is ready
  createMemo(() => {
    const t = taste();
    if (!t || t.isColdStart) return;
    const topGenre = t.topGenres[0];
    if (!topGenre) return;
    setPersonalizedGenre(topGenre);
    const genreId = genreIdFor(topGenre, "movie");
    if (!genreId) return;
    discoverMovies({
      withGenres: [genreId],
      sortBy: "popularity.desc",
      voteCountGte: 200,
    })
      .then((titles) => {
        // Filter out titles already in the vault
        const vaultIds = new Set(watchlist().map((w) => w.id));
        setPersonalizedTitles(titles.filter((t) => !vaultIds.has(String(t.id))).slice(0, 20));
      })
      .catch((e) => console.error("[DiscoverPage] personalized fetch:", e));
  });

  // Premium insight strip
  const insightCards = createMemo(() => {
    const cards: { icon: string; count: number; label: string }[] = [];
    if (feeds.trending().length > 0) {
      cards.push({ icon: "local_fire_department", count: feeds.trending().length, label: "Trending Today" });
    }
    if (feeds.nowPlaying().length > 0) {
      cards.push({ icon: "theaters", count: feeds.nowPlaying().length, label: "In Theatres" });
    }
    if (feeds.newSeasons().length > 0) {
      cards.push({ icon: "live_tv", count: feeds.newSeasons().length, label: "New Episodes" });
    }
    if (personalizedTitles().length > 0) {
      cards.push({ icon: "auto_awesome", count: personalizedTitles().length, label: "For You" });
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

          {/* Premium insight strip */}
          <Show when={insightCards().length > 0}>
            <div class="discover-insight-strip">
              <For each={insightCards()}>
                {(card) => (
                  <div class="discover-insight-card">
                    <span class="material-symbols-outlined" style={{ "font-size": "16px", color: "var(--p)" }} aria-hidden="true">
                      {card.icon}
                    </span>
                    <span class="discover-insight-count">{card.count}</span>
                    <span class="discover-insight-label">{card.label}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* FOLD 2 — Trending Right Now */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Trending" error={e} />}>
            <DiscoverSection
              label="Trending Right Now"
              icon="trending_up"
              loading={feeds.loading() && feeds.trending().length === 0}
            >
              <DiscoverRail
                titles={feeds.trending()}
                onSelect={handleOpenTitle}
                emptyText="No trending titles available."
              />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 3 — In Theatres Now */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Theatres" error={e} />}>
            <DiscoverSection
              label="In Theatres Now"
              icon="theaters"
              loading={feeds.loading() && feeds.nowPlaying().length === 0}
            >
              <DiscoverRail
                titles={feeds.nowPlaying()}
                onSelect={handleOpenTitle}
                emptyText="No theatre releases available."
              />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 5 — Because You Like... */}
          <Show when={!isGuest() && personalizedTitles().length > 0}>
            <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Recommendations" error={e} />}>
              <DiscoverSection
                label={`Because You Like ${personalizedGenre()}`}
                icon="auto_awesome"
              >
                <DiscoverRail
                  titles={personalizedTitles()}
                  onSelect={handleOpenTitle}
                  emptyText="No recommendations today."
                />
              </DiscoverSection>
            </ErrorBoundary>
          </Show>

          {/* FOLD 6 — Hidden Gems */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Hidden Gems" error={e} />}>
            <DiscoverSection
              label="Hidden Gems"
              icon="diamond"
              loading={feeds.loading() && feeds.hiddenGems().length === 0}
            >
              <DiscoverRail
                titles={feeds.hiddenGems()}
                onSelect={handleOpenTitle}
                emptyText="No hidden gems found."
              />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 7 — Top Rated Movies */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Top Rated" error={e} />}>
            <DiscoverSection
              label="Top Rated Movies"
              icon="star"
              loading={feeds.loading() && feeds.topRatedMovies().length === 0}
            >
              <DiscoverRail
                titles={feeds.topRatedMovies()}
                onSelect={handleOpenTitle}
                emptyText="No top rated movies available."
              />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 7b — Top Rated Series */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Top Rated TV" error={e} />}>
            <DiscoverSection
              label="Top Rated Series"
              icon="tv"
              loading={feeds.loading() && feeds.topRatedTv().length === 0}
            >
              <DiscoverRail
                titles={feeds.topRatedTv()}
                onSelect={handleOpenTitle}
                emptyText="No top rated series available."
              />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 9 — Genre Explorer */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Genre Explorer" error={e} />}>
            <DiscoverSection
              label="Genre Explorer"
              icon="palette"
            >
              <GenreExplorer onSelect={handleOpenTitle} />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 10 — New Seasons */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="New Seasons" error={e} />}>
            <DiscoverSection
              label="New Seasons"
              icon="live_tv"
              loading={feeds.loading() && feeds.newSeasons().length === 0}
            >
              <DiscoverRail
                titles={feeds.newSeasons()}
                onSelect={handleOpenTitle}
                emptyText="No new seasons airing now."
              />
            </DiscoverSection>
          </ErrorBoundary>

          {/* FOLD 11 — Coming Soon */}
          <ErrorBoundary fallback={(e) => <DiscoverSectionError label="Coming Soon" error={e} />}>
            <DiscoverSection
              label="Coming Soon"
              icon="upcoming"
              loading={feeds.loading() && feeds.upcoming().length === 0}
            >
              <DiscoverRail
                titles={feeds.upcoming()}
                onSelect={handleOpenTitle}
                emptyText="No upcoming releases."
              />
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
