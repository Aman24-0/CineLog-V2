// src/features/dashboard/DashboardPage.tsx
import { createSignal, createMemo, createEffect, onMount, onCleanup, Show } from "solid-js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { useNavigate } from "@solidjs/router";
import { auth, db } from "~/core/firebase";
import { login, completeRedirectLogin } from "~/core/firebase/auth";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import type { WatchlistItem, User } from "~/shared/types";
import HeroSection from "./components/HeroSection";
import StatsGrid from "./components/StatsGrid";
import ContinueWatching from "./components/ContinueWatching";
import RecentlyAdded from "./components/RecentlyAdded";
import GuestBanner from "./components/GuestBanner";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setDetailsId } = useModalState();

  const [user, setUser] = createSignal<User | null>(null);
  const [watchlist, setWatchlist] = createSignal<WatchlistItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [randomItem, setRandomItem] = createSignal<WatchlistItem | null>(null);

  let unsubSnap: (() => void) | null = null;

  onMount(() => {
    // Complete the redirect login flow if returning from Google
    completeRedirectLogin().catch((error) => {
  console.error(error);
  alert(
    "CODE: " + error.code +
    "\n\nMESSAGE: " + error.message +
    "\n\nFULL:\n" +
    JSON.stringify(error, null, 2)
  );
});

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

  const plannedList = createMemo(() =>
    watchlist().filter((m) => m.status === "Planned" || m.status === "Plan to Watch")
  );

  const pickRandom = () => {
    if (!user()) {
      showToast("Sign in to shuffle your vault! 🔒");
      handleLogin();
      return;
    }
    const p = plannedList();
    if (p.length > 0) {
      setRandomItem(p[Math.floor(Math.random() * p.length)]);
    } else {
      showToast("Planned list is empty! Add some titles first.");
    }
  };

  createEffect(() => {
    const p = plannedList();
    if (p.length > 0 && !randomItem()) {
      setRandomItem(p[Math.floor(Math.random() * p.length)]);
    }
  });

  const featuredItem = createMemo(() => {
    if (randomItem()) return randomItem();
    if (watchlist().length > 0) return watchlist()[0];
    return null;
  });

  const openMovie = (id: string) => {
    setDetailsId(id);
  };

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      showToast("Sign in failed. Please try again.", "error");
    }
  };

  return (
    <div class="px-5 max-w-2xl lg:max-w-none lg:px-12 mx-auto relative z-10 animate-fade-in pb-8 space-y-8">
      <Show when={!loading()} fallback={<div class="flex justify-center py-20"><div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div></div>}>
        
        <HeroSection
          item={featuredItem()}
          isGuest={!user()}
          isRandomPlanned={plannedList().some((m) => m.id === featuredItem()?.id)}
          onLogin={handleLogin}
          onShuffle={pickRandom}
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
