// src/features/dashboard/DashboardPage.tsx
//
// Phase 9.1 — Dashboard Architecture Polish
// ------------------------------------------
// Dashboard now has exactly ONE source of data: useDashboardData() →
// DashboardRepository → Supabase. No useVault(). No VaultRepository.
// No duplicate fetches. No Firestore.
//
// Architecture:
//   DashboardPage → useDashboardData → dashboardAdapter → DashboardRepository → Supabase
import { createSignal, createMemo, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import { getClient } from "~/lib/supabase/client";
import PageContainer from "~/shared/ui/PageContainer";
import { isWatchable } from "~/shared/utils/progress";
import GreetingBlock from "./components/GreetingBlock";
import DashboardHero from "./components/DashboardHero";
import DashboardSection from "./components/DashboardSection";
import ContinueRail from "./components/ContinueRail";
import RecentlyAdded from "./components/RecentlyAdded";
import StatsStory from "./components/StatsStory";
import DashboardSkeleton from "./components/DashboardSkeleton";
import { getDashboardRecommendation } from "./dashboardRecommendation";
import { useDashboardData } from "./useDashboardData";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { openTitle } = useModalState();

  // Phase 9.1 — SINGLE data source: useDashboardData (DashboardRepository).
  // No useVault(). No VaultRepository. No duplicate fetches.
  const { watchlist, loading, isGuest } = useDashboardData();

  const [heroSeed, setHeroSeed] = createSignal(0);
  const [excludeId, setExcludeId] = createSignal<string | null>(null);

  const recommendation = createMemo(() =>
    getDashboardRecommendation(watchlist(), excludeId(), heroSeed())
  );

  onMount(() => {
    setHeroSeed(Math.floor(Math.random() * 1_000_000));
  });

  const openMovie = (id: string) => {
    const item = watchlist().find((m) => m.id === id);
    if (item) openTitle(item, watchlist());
  };

  const handleShuffle = () => {
    if (watchlist().length === 0) return;
    const current = recommendation().item;
    if (current) setExcludeId(current.id);
    setHeroSeed((s) => s + Math.floor(Math.random() * 997) + 1);
  };

  const handleLogin = async () => {
    try {
      const supabase = getClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined
        }
      });
      if (error) throw error;
      showToast("Signed in successfully! 🎬", "success");
    } catch (error) {
      showToast("Sign in failed. Please try again.", "error");
    }
  };

  const hasInProgress = createMemo(() =>
    watchlist().some(isWatchable)
  );

  return (
    <PageContainer width="narrow">
      <div class="ambient-glow" aria-hidden="true" />

      <Show when={!loading()} fallback={<DashboardSkeleton />}>
        <div class="page-enter relative">
          <GreetingBlock watchlist={watchlist()} />

          <DashboardHero
            recommendation={recommendation()}
            isGuest={isGuest()}
            onLogin={handleLogin}
            onShuffle={handleShuffle}
            onOpenMovie={openMovie}
          />

          <Show when={hasInProgress()}>
            <DashboardSection label="Continue Watching" icon="play_circle">
              <ContinueRail watchlist={watchlist()} onOpenMovie={openMovie} />
            </DashboardSection>
          </Show>

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
