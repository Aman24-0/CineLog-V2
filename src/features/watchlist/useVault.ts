// src/features/watchlist/useVault.ts
import { createSignal, onMount, onCleanup } from "solid-js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { auth, db } from "~/core/firebase";
import { useToast } from "~/shared/hooks/useToast";
import {
  updateStatus as svcUpdateStatus,
  updateRating as svcUpdateRating,
  updateNotes as svcUpdateNotes,
  updateWatchDate as svcUpdateWatchDate,
  updateSeasonEpisode as svcUpdateSeasonEpisode,
  updateWatchProgress as svcUpdateWatchProgress,
  deleteWatchlistItem as svcDeleteWatchlistItem
} from "./watchlistService";
import type { WatchlistItem, WatchProgress } from "~/shared/types";

export function useVault() {
  const { showToast } = useToast();
  const [watchlist, setWatchlist] = createSignal<WatchlistItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [isGuest, setIsGuest] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [uid, setUid] = createSignal<string | null>(null);

  let unsubSnap: (() => void) | null = null;
  let unsubAuth: (() => void) | null = null;

  onMount(() => {
    unsubAuth = onAuthStateChanged(auth, (u) => {
      setIsGuest(!u);
      setUid(u?.uid || null);
      
      if (unsubSnap) {
        unsubSnap();
        unsubSnap = null;
      }
      
      if (u) {
        setLoading(true);
        setError(null);
        
        const q = query(
          collection(db, "users", u.uid, "watchlist"), 
          orderBy("addedAt", "desc")
        );
        
        unsubSnap = onSnapshot(
          q,
          (snap) => {
            setWatchlist(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WatchlistItem));
            setLoading(false);
            setError(null);
          },
          (err) => {
            console.error("Firestore error fetching vault:", err);
            setWatchlist([]);
            setLoading(false);
            setError("Failed to load vault data. Please try again later.");
          }
        );
      } else {
        setWatchlist([]);
        setLoading(false);
        setError(null);
      }
    });
  });

  onCleanup(() => {
    if (unsubAuth) unsubAuth();
    if (unsubSnap) unsubSnap();
  });

  const updateStatus = async (itemId: string, status: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      await svcUpdateStatus(uid()!, itemId, status);
      showToast("Status updated!", "success");
    } catch (err) {
      console.error("Update failed:", err);
      showToast("Failed to update status.", "error");
      throw err;
    }
  };

  const updateRating = async (itemId: string, rating: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      await svcUpdateRating(uid()!, itemId, rating);
      showToast("Rating updated!", "success");
    } catch (err) {
      console.error("Update failed:", err);
      showToast("Failed to update rating.", "error");
      throw err;
    }
  };

  const updateNotes = async (itemId: string, notes: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      await svcUpdateNotes(uid()!, itemId, notes);
      showToast("Notes saved!", "success");
    } catch (err) {
      console.error("Update failed:", err);
      showToast("Failed to save notes.", "error");
      throw err;
    }
  };

  const updateWatchDate = async (itemId: string, watchDate: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      await svcUpdateWatchDate(uid()!, itemId, watchDate);
      showToast("Watch date updated!", "success");
    } catch (err) {
      console.error("Update failed:", err);
      showToast("Failed to update watch date.", "error");
      throw err;
    }
  };

  const updateSeasonEpisode = async (itemId: string, season: number, episode: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      await svcUpdateSeasonEpisode(uid()!, itemId, season, episode);
      showToast("Episode progress updated!", "success");
    } catch (err) {
      console.error("Update failed:", err);
      showToast("Failed to update episode progress.", "error");
      throw err;
    }
  };

  const updateWatchProgress = async (itemId: string, progress: WatchProgress) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    const item = watchlist().find((m) => m.id === itemId);
    try {
      // Preserve V1 behavior: mark as 'Watching' if currently 'Planned'
      if (item && (item.status === "Planned" || item.status === "Plan to Watch")) {
        await svcUpdateStatus(uid()!, itemId, "Watching");
      }
      await svcUpdateWatchProgress(uid()!, itemId, progress);
      showToast("Progress saved!", "success");
    } catch (err) {
      console.error("Update failed:", err);
      showToast("Failed to save progress.", "error");
      throw err;
    }
  };

  const deleteWatchlistItem = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      await svcDeleteWatchlistItem(uid()!, itemId);
      showToast("Item deleted.", "success");
    } catch (err) {
      console.error("Delete failed:", err);
      showToast("Failed to delete item.", "error");
      throw err;
    }
  };

  return {
    watchlist,
    loading,
    isGuest,
    error,
    uid,
    updateStatus,
    updateRating,
    updateNotes,
    updateWatchDate,
    updateSeasonEpisode,
    updateWatchProgress,
    deleteWatchlistItem
  };
}
