// src/features/dashboard/DashboardPage.tsx
import { createSignal, createMemo, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import { login } from "~/core/firebase/auth";
import PageContainer from "~/shared/ui/PageContainer";
import { isWatchable } from "~/shared/utils/progress";
import GreetingBlock from "./components/GreetingBlock";
import DashboardHero from "./components/DashboardHero";
import DashboardSection from "./components/DashboardSection";
import ContinueRail from "./components/ContinueRail";
import RecentlyAdded from "./components/RecentlyAdded";
import StatsStory from "./components/StatsStory";
import DashboardSkeleton from "./components/DashboardSkeleton";
import { getRecommendation } from "./recommendationEngine";

/**
 * Dashboard (Home) page — V2.2 Sprint 3 Cinematic Dashboard.
 *
 * NEW INFORMATION HIERARCHY:
 *  1. GreetingBlock — temporal greeting + personalization
 *  2. DashboardHero — context-aware: Continue Watching → Tonight's Pick → Empty
 *  3. ContinueRail — rich progress cards with quick resume (only if in-progress items)
 *  4. RecentlyAdded — poster rail with "added X ago" timestamps
 *  5. StatsStory — storytelling stats panel (This Year / In Progress / Top Genre / Avg IMDb)
 *
 * SIGNATURE INTERACTION: "Context-Aware Hero"
 *  - The hero answers "what should I watch today?" by adapting to the user's state:
 *    Continue (in-progress) → Tonight (planned) → History (completed) → Empty
 *  - This is the strongest signal: the user opens CineLog and immediately knows
 *    what to watch next.
 *
 * DESIGN LANGUAGE:
 *  - Inherits the Details page cinematic language:
 *    - Full-bleed backdrop with multi-layer gradients
 *    - Floating poster (desktop only)
 *    - Display title (Bebas Neue)
 *    - v2-pill quick-meta
 *    - btn-primary + btn-ghost actions
 *  - DashboardSection uses the same accent-bar label pattern as DetailSection
 *
 * MOBILE FIRST:
 *  - Hero poster hidden on mobile (thumb-zone optimization)
 *  - ContinueRail cards 280px (1 card visible on mobile, 2-3 on desktop)
 *  - RecentlyAdded cards 120px (3-4 on mobile, 5-6 on desktop)
 *  - StatsStory 2x2 grid on mobile, 1x4 on desktop
 *
 * PERFORMANCE:
 *  - Hero backdrop eager + fetchpriority=high (LCP)
 *  - All rail images lazy-loaded
 *  - Recommendation memoized (only recomputes on watchlist/seed change)
 *  - DashboardSkeleton mirrors real layout (no layout shift)
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setSelectedItem } = useModalState();
  const { watchlist, loading, isGuest } = useVault();

  const [heroSeed, setHeroSeed] = createSignal(0);
  const [excludeId, setExcludeId] = createSignal<string | null>(null);

  const recommendation = createMemo(() =>
    getRecommendation(watchlist(), excludeId(), heroSeed())
  );

  onMount(() => {
    setHeroSeed(Math.floor(Math.random() * 1_000_000));
  });

  const openMovie = (id: string) => {
    const item = watchlist().find((m) => m.id === id);
    if (item) setSelectedItem(item);
  };

  const handleShuffle = () => {
    if (watchlist().length === 0) return;
    const current = recommendation().item;
    if (current) setExcludeId(current.id);
    setHeroSeed((s) => s + Math.floor(Math.random() * 997) + 1);
  };

  const handleLogin = async () => {
    try {
      await login();
      showToast("Signed in successfully! 🎬", "success");
    } catch (error) {
      showToast("Sign in failed. Please try again.", "error");
    }
  };

  // Check if there are any watchable items (status === "Watching")
  // Controls ContinueRail visibility — uses the shared progress engine
  const hasInProgress = createMemo(() =>
    watchlist().some(isWatchable)
  );

  return (
    <PageContainer width="narrow">
      <div class="ambient-glow" aria-hidden="true" />

      <Show when={!loading()} fallback={<DashboardSkeleton />}>
        <div class="page-enter relative">
          {/* 1. Greeting — temporal + personal */}
          <GreetingBlock watchlist={watchlist()} />

          {/* 2. Hero — context-aware */}
          <DashboardHero
            recommendation={recommendation()}
            isGuest={isGuest()}
            onLogin={handleLogin}
            onShuffle={handleShuffle}
            onOpenMovie={openMovie}
          />

          {/* 3. Continue Watching rail — only if in-progress items */}
          <Show when={hasInProgress()}>
            <DashboardSection label="Continue Watching" icon="play_circle">
              <ContinueRail watchlist={watchlist()} onOpenMovie={openMovie} />
            </DashboardSection>
          </Show>

          {/* 4. Recently Added — richer browsing context */}
          <DashboardSection
            label="Recently Added"
            icon="schedule"
            actionLabel="View All"
            onAction={() => navigate("/watchlist")}
          >
            <RecentlyAdded
              watchlist={watchlist()}
              onOpenMovie={openMovie}
              onNavigate={() => navigate("/watchlist")}
            />
          </DashboardSection>

          {/* 5. Stats Story — only for signed-in users with non-empty vault */}
          <Show when={!isGuest() && watchlist().length > 0}>
            <DashboardSection label="Your Story" icon="insights">
              <StatsStory
                watchlist={watchlist()}
                onNavigate={(status: string) =>
                  navigate(`/watchlist?status=${status}`)
                }
              />
            </DashboardSection>
          </Show>
        </div>
      </Show>
    </PageContainer>
  );
}
