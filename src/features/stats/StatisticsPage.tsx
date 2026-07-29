// src/features/stats/StatisticsPage.tsx
//
// StatisticsPage — the redesigned Statistics dashboard.
//
// This page replaces the legacy text-heavy StatsPage with a modern,
// chart-driven dashboard. It reuses the in-memory watchlist (already
// loaded by useUserLibrary at the app root) and derives every chart
// via the pure calculators in `src/lib/supabase/repositories/stats.ts`.
//
// Layout:
//
//   ┌──────────────────────────────────────────┐
//   │  Back to profile        Statistics       │
//   │  Your cinematic personality, told in     │
//   │  charts — not spreadsheets.              │
//   ├──────────────────────────────────────────┤
//   │  [Titles] [Hours] [Avg Rating] [Completed]│  StatsOverview (4 cards)
//   ├──────────────────────────────────────────┤
//   │  Activity · Genres · Ratings · Decades · People · Trends │  StatsTabs
//   ├──────────────────────────────────────────┤
//   │                                          │
//   │       Active tab chart(s)                │  Tab content
//   │                                          │
//   ├──────────────────────────────────────────┤
//   │  Highest Rated (horizontal carousel)     │  Always visible
//   ├──────────────────────────────────────────┤
//   │  [Share]  [Export CSV]                   │  Action row
//   └──────────────────────────────────────────┘
//
// Loading / empty / guest states are handled inline so the page
// degrades gracefully when the user is signed out or has no titles.

import { Show, Suspense, createMemo, type Component } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import PageContainer from "~/shared/ui/PageContainer";
import { GlassButton, GlassEmptyState, GlassSkeleton } from "~/shared/ui/glass";
import { useStatsData } from "./hooks/useStatsData";
import StatsOverview from "./components/StatsOverview";
import StatsTabs, { usePersistentStatsTab, type StatsTab } from "./components/StatsTabs";
import ActivityChart from "./components/ActivityChart";
import GenreChart from "./components/GenreChart";
import RatingsHistogram from "./components/RatingsHistogram";
import DecadeChart from "./components/DecadeChart";
import PeopleList from "./components/PeopleList";
import TrendsChart from "./components/TrendsChart";
import MovieSeriesPie from "./components/MovieSeriesPie";
import HighestRatedCarousel from "./components/HighestRatedCarousel";
import StatsShareModal from "./components/StatsShareModal";
import { createSignal } from "solid-js";

const StatisticsPage: Component = () => {
  const { isSignedIn } = useAuth();
  const library = useUserLibrary();
  const { stats, loading, isEmpty, isGuest } = useStatsData();
  const [activeTab, setActiveTab] = usePersistentStatsTab("activity");
  const [shareOpen, setShareOpen] = createSignal(false);

  // Safe accessor for the watchlist — guards against `library` being
  // null (which would throw) or `watchlist` not being a function.
  // Falls back to [] so chart components receive a stable empty
  // array instead of an undefined value.
  const watchlist = createMemo(() => {
    try {
      if (!library || typeof library.watchlist !== "function") return [];
      const list = library.watchlist();
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  });

  // The active tab determines which chart(s) are rendered. We use a
  // Switch-like cascade of <Show> blocks because SolidJS doesn't have
  // a built-in <Switch> for non-boolean values.
  //
  // NOTE: MovieSeriesPie is intentionally NOT in the Activity tab —
  // it lives as a fixed widget below the tab content so the movies
  // vs series split is always visible regardless of the active tab.
  const tabContent = createMemo(() => {
    const tab = activeTab();
    const s = stats();
    if (!s) return null;
    switch (tab) {
      case "activity":
        return (
          <div class="stats-tab-stack">
            <ActivityChart monthly={() => s.monthly} watchlist={watchlist} />
          </div>
        );
      case "genres":
        return (
          <div class="stats-tab-stack">
            <GenreChart genres={() => s.genres} />
          </div>
        );
      case "ratings":
        return (
          <div class="stats-tab-stack">
            <RatingsHistogram ratings={() => s.ratings} />
          </div>
        );
      case "decades":
        return (
          <div class="stats-tab-stack">
            <DecadeChart decades={() => s.decades} />
          </div>
        );
      case "people":
        return (
          <div class="stats-tab-stack">
            <PeopleList directors={() => s.directors} actors={() => s.actors} />
          </div>
        );
      case "trends":
        return (
          <div class="stats-tab-stack">
            <TrendsChart monthly={() => s.monthly} pace={() => s.pace} />
          </div>
        );
      default:
        return null;
    }
  });

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <div class="sec-page sec-fade-in stats-page">
        {/* Header */}
        <div class="sec-header">
          <a href="/profile" class="sec-back focus-ring" aria-label="Back to profile">
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
              arrow_back
            </span>
            Profile
          </a>
          <p class="sec-eyebrow">Statistics</p>
          <h1 class="sec-title">Your cinematic personality</h1>
          <p class="sec-subtitle">
            Charts and insights from your watchlist — visualised, not just counted.
          </p>
        </div>

        <div class="sec-body">
          {/* ── Guest state ── */}
          <Show when={isGuest()}>
            <GlassEmptyState
              icon="lock"
              title="Sign in to see your stats"
              message="Your cinematic dashboard comes alive once you're signed in and your watchlist is loaded."
              variant="default"
              surface
              action={<a href="/profile" class="btn-primary focus-ring">Go to profile</a>}
            />
          </Show>

          {/* ── Loading state ── */}
          <Show when={!isGuest() && loading()}>
            <div class="stats-skeleton-grid">
              <GlassSkeleton class="h-28 rounded-lg" />
              <GlassSkeleton class="h-28 rounded-lg" />
              <GlassSkeleton class="h-28 rounded-lg" />
              <GlassSkeleton class="h-28 rounded-lg" />
            </div>
            <div class="stats-skeleton-chart" style={{ "margin-top": "var(--sp-4)" }}>
              <GlassSkeleton class="h-72 rounded-lg" />
            </div>
          </Show>

          {/* ── Empty state (signed in, zero titles) ── */}
          <Show when={!isGuest() && !loading() && isEmpty()}>
            <GlassEmptyState
              icon="insights"
              title="No statistics yet"
              message="Add titles to your watchlist and your cinematic story will appear here as charts."
              variant="default"
              surface
              action={<a href="/search" class="btn-primary focus-ring">Find titles to watch</a>}
            />
          </Show>

          {/* ── Full dashboard ── */}
          <Show when={!isGuest() && !loading() && stats()}>
            <div class="stats-dashboard">
              {/* Overview cards */}
              <StatsOverview overview={() => stats()!.overview} />

              {/* Tabs + content — gap-6 spacing above the tab bar gives
                  breathing room after the overview cards. The stats-tabs-gap
                  class is defined in stats.css. */}
              <div class="stats-tabs-gap" />
              <StatsTabs active={activeTab} onChange={setActiveTab} />
              <div class="stats-tab-content">
                <Suspense fallback={<GlassSkeleton class="h-72 rounded-lg" />}>
                  {tabContent()}
                </Suspense>
              </div>

              {/* Fixed widget — Movies vs Series donut. Always visible
                  regardless of the active tab so the user can reference
                  their content split from any tab. */}
              <MovieSeriesPie split={() => stats()!.split} />

              {/* Always-visible carousel */}
              <HighestRatedCarousel items={() => stats()!.highestRated} />

              {/* Action row */}
              <div class="stats-actions">
                <GlassButton
                  variant="secondary"
                  size="default"
                  icon="share"
                  onClick={() => setShareOpen(true)}
                >
                  Share Stats
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  size="default"
                  icon="download"
                  onClick={() => {
                    // Re-use the share modal's CSV export by opening it.
                    setShareOpen(true);
                  }}
                >
                  Export CSV
                </GlassButton>
              </div>
            </div>
          </Show>
        </div>
      </div>

      {/* Share / Export modal — only mounts when open. */}
      <Show when={stats()}>
        <StatsShareModal
          open={shareOpen()}
          onClose={() => setShareOpen(false)}
          stats={stats()!}
          watchlist={watchlist()}
        />
      </Show>
    </PageContainer>
  );
};

export default StatisticsPage;
