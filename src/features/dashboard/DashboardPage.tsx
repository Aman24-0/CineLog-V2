// src/features/dashboard/DashboardPage.tsx
import { createSignal, createMemo, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import { login } from "~/core/firebase/auth";
import HeroSection from "./components/HeroSection";
import StatsGrid from "./components/StatsGrid";
import ContinueWatching from "./components/ContinueWatching";
import RecentlyAdded from "./components/RecentlyAdded";
import GuestBanner from "./components/GuestBanner";
import DashboardSkeleton from "./components/DashboardSkeleton";
import { getRecommendation } from "./recommendationEngine";

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

  return (
    <div
      class="px-5 max-w-2xl lg:max-w-none lg:px-12 mx-auto relative z-10 animate-fade-in"
      style={{ "padding-top": "var(--sp-6)", "padding-bottom": "var(--sp-10)" }}
    >
      <div class="ambient-glow" aria-hidden="true" />

      <Show when={!loading()} fallback={<DashboardSkeleton />}>
        <div class="space-y-6 relative">
          <HeroSection
            item={recommendation().item}
            badge={recommendation().badge}
            isResume={recommendation().isResume}
            canShuffle={recommendation().canShuffle}
            isGuest={isGuest()}
            onLogin={handleLogin}
            onShuffle={handleShuffle}
            onOpenMovie={openMovie}
          />

          <Show when={isGuest()}>
            <GuestBanner onLogin={handleLogin} />
          </Show>

          <Show when={!isGuest() && watchlist().length > 0}>
            <StatsGrid
              watchlist={watchlist()}
              onNavigate={(status: string) =>
                navigate(`/watchlist?status=${status}`)
              }
            />
          </Show>

          <ContinueWatching watchlist={watchlist()} onOpenMovie={openMovie} />

          <RecentlyAdded
            watchlist={watchlist()}
            onOpenMovie={openMovie}
            onNavigate={() => navigate("/watchlist")}
          />
        </div>
      </Show>
    </div>
  );
}
