// src/features/watchlist/useVault.ts
import { createContext, useContext, createSignal, onMount, onCleanup, ParentComponent } from "solid-js";
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
  deleteWatchlistItem as svcDeleteWatchlistItem,
  savePreset as svcSavePreset,
  deletePreset as svcDeletePreset,
  renamePreset as svcRenamePreset
} from "./watchlistService";
import type { WatchlistItem, WatchProgress, FilterPreset, VaultFilters } from "~/shared/types";

const useVaultLogic = () => {
  const { showToast } = useToast();
  const [watchlist, setWatchlist] = createSignal<WatchlistItem[]>([]);
  const [presets, setPresets] = createSignal<FilterPreset[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [isGuest, setIsGuest] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [uid, setUid] = createSignal<string | null>(null);

  let unsubSnap: (() => void) | null = null;
  let unsubPresets: (() => void) | null = null;
  let unsubAuth: (() => void) | null = null;

  onMount(() => {
    unsubAuth = onAuthStateChanged(auth, (u) => {
      setIsGuest(!u);
      setUid(u?.uid || null);
      
      if (unsubSnap) {
        unsubSnap();
        unsubSnap = null;
      }
      if (unsubPresets) {
        unsubPresets();
        unsubPresets = null;
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

        unsubPresets = onSnapshot(
          collection(db, "users", u.uid, "presets"),
          (snap) => {
            setPresets(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FilterPreset));
          },
          (err) => console.error("Error fetching presets:", err)
        );
      } else {
        setWatchlist([]);
        setPresets([]);
        setLoading(false);
        setError(null);
      }
    });
  });

  onCleanup(() => {
    if (unsubAuth) unsubAuth();
    if (unsubSnap) unsubSnap();
    if (unsubPresets) unsubPresets();
  });

  const updateStatus = async (itemId: string, status: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      await svcUpdateStatus(uid()!, itemId, status);
      showToast("Status updated!", "success");
    } catch (err) {
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
      showToast("Failed to update episode progress.", "error");
      throw err;
    }
  };

  const updateWatchProgress = async (itemId: string, progress: WatchProgress) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    const item = watchlist().find((m) => m.id === itemId);
    try {
      if (item && (item.status === "Planned" || item.status === "Plan to Watch")) {
        await svcUpdateStatus(uid()!, itemId, "Watching");
      }
      await svcUpdateWatchProgress(uid()!, itemId, progress);
    } catch (err) {
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
      showToast("Failed to delete item.", "error");
      throw err;
    }
  };

  const savePreset = async (name: string, filters: VaultFilters) => {
    if (!uid()) return;
    try {
      await svcSavePreset(uid()!, name, filters);
      showToast("Preset saved!", "success");
    } catch (err) {
      showToast("Failed to save preset.", "error");
    }
  };

  const deletePreset = async (presetId: string) => {
    if (!uid()) return;
    try {
      await svcDeletePreset(uid()!, presetId);
      showToast("Preset deleted.", "success");
    } catch (err) {
      showToast("Failed to delete preset.", "error");
    }
  };

  const renamePreset = async (presetId: string, name: string) => {
    if (!uid()) return;
    try {
      await svcRenamePreset(uid()!, presetId, name);
      showToast("Preset renamed.", "success");
    } catch (err) {
      showToast("Failed to rename preset.", "error");
    }
  };

  return {
    watchlist,
    presets,
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
    deleteWatchlistItem,
    savePreset,
    deletePreset,
    renamePreset
  };
};

const VaultContext = createContext<ReturnType<typeof useVaultLogic>>();

export const VaultProvider: ParentComponent = (props) => {
  const vault = useVaultLogic();
  return (
    <VaultContext.Provider value={vault}>
      {props.children}
    </VaultContext.Provider>
  );
};

export function useVault() {
  return useContext(VaultContext)!;
}
