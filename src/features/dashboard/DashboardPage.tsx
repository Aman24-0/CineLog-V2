// src/features/dashboard/DashboardPage.tsx
import { createSignal, createMemo, onMount, onCleanup, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import { login } from "~/core/firebase/auth";
import type { User } from "~/shared/types";
import HeroSection from "./components/HeroSection";
import StatsGrid from "./components/StatsGrid";
import ContinueWatching from "./components/ContinueWatching";
import RecentlyAdded from "./components/RecentlyAdded";
import GuestBanner from "./components/GuestBanner";
import { getRecommendation } from "./recommendationEngine";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setSelectedItem } = useModalState();
  const { watchlist, loading, isGuest } = useVault();

  const [forcedPlannedId, setForcedPlannedId] = createSignal<string | null>(null);

  const recommendation = createMemo(() => getRecommendation(watchlist(), forcedPlannedId()));

  const openMovie = (id: string) => {
    const item = watchlist().find((m) => m.id === id);
    if (item) setSelectedItem(item);
  };

  const handleShuffle = () => {
    const planned = watchlist().filter(
      (m) => m.status === "Planned" || m.status === "Plan to Watch"
    );
    if (planned.length === 0) return;
    
    if (planned.length === 1) {
      setForcedPlannedId(planned[0].id);
      return;
    }
    
    let nextItem = planned[Math.floor(Math.random() * planned.length)];
    while (nextItem.id === forcedPlannedId()) {
      nextItem = planned[Math.floor(Math.random() * planned.length)];
    }
    setForcedPlannedId(nextItem.id);
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
    <div class="px-5 max-w-2xl lg:max-w-none lg:px-12 mx-auto relative z-10 animate-fade-in pb-8 space-y-8">
      <Show when={!loading()} fallback={<div class="flex justify-center py-20"><div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div></div>}>
        
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
            onNavigate={(status: string) => navigate(`/watchlist?status=${status}`)}
          />
        </Show>

        <ContinueWatching
          watchlist={watchlist()}
          onOpenMovie={openMovie}
        />

        <RecentlyAdded
          watchlist={watchlist()}
          onOpenMovie={openMovie}
          onNavigate={() => navigate("/watchlist")}
        />

      </Show>
    </div>
  );
}
