// src/features/dashboard/DashboardPage.tsx
import { createSignal, createMemo, onMount, onCleanup, Show } from "solid-js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { useNavigate } from "@solidjs/router";
import { auth, db } from "~/core/firebase";
import { login } from "~/core/firebase/auth";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import type { WatchlistItem, User } from "~/shared/types";
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

  const [user, setUser] = createSignal<User | null>(null);
  const [watchlist, setWatchlist] = createSignal<WatchlistItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [forcedPlannedId, setForcedPlannedId] = createSignal<string | null>(null);

  let unsubSnap: (() => void) | null = null;

  onMount(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u as User | null);
      setLoading(false);
      
      if (unsubSnap) unsubSnap();
      
      if (u) {
        const q = query(collection(db, "users", u.uid, "watchlist"), orderBy("addedAt", "desc"));
        unsubSnap = onSnapshot(q, (snap) => {
          setWatchlist(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WatchlistItem));
        });
      } else {
        setWatchlist([]);
      }
    });

    onCleanup(() => {
      unsubAuth();
      if (unsubSnap) unsubSnap();
    });
  });

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
    // Avoid showing the same title twice in a row
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
          isGuest={!user()}
          onLogin={handleLogin}
          onShuffle={handleShuffle}
          onOpenMovie={openMovie}
        />

        <Show when={!user()}>
          <GuestBanner onLogin={handleLogin} />
        </Show>

        <Show when={user() && watchlist().length > 0}>
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
