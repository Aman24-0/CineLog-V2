// src/features/watchlist/useVault.ts
//
// Phase 7.1 — Vault READ Migration
// ----------------------------------
// Vault READS now come from Supabase (via vaultAdapter → VaultRepository).
// Vault WRITES still go to Firestore (via watchlistService).
//
// The Firestore onSnapshot for watchlist items has been replaced with a
// Supabase fetch. After each write (to Firestore), the local `watchlist`
// signal is optimistically updated so the UI reflects the change
// immediately — the Supabase data itself stays stale until Phase 7.2
// (write migration) adds dual-write.
//
// The Firestore onSnapshot for PRESETS remains unchanged (no Supabase
// PresetRepository exists yet).
import { createContext, useContext, createSignal, onMount, onCleanup, ParentComponent } from "solid-js";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "~/core/firebase";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import { useToast } from "~/shared/hooks/useToast";
import { fetchVaultFromSupabase } from "./vaultAdapter";
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

  let unsubPresets: (() => void) | null = null;
  let unsubAuth: (() => void) | null = null;

  /**
   * Refresh the vault from Supabase (Phase 7.1 read path).
   * Called on session change and can be called manually after writes.
   */
  const refreshVault = async (supabaseUid: string) => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchVaultFromSupabase(supabaseUid);

      // V2 PROGRESS MIGRATION (preserved from the Firestore version):
      // Clear legacy V1 watchProgress from non-Watching titles.
      const migrated = items.map((m) => {
        if (m.status !== "Watching" && m.watchProgress) {
          return {
            ...m,
            watchProgress: m.watchProgress.season || m.watchProgress.episode
              ? {
                  season: m.watchProgress.season,
                  episode: m.watchProgress.episode,
                  updatedAt: m.watchProgress.updatedAt,
                  currentTime: 0,
                  duration: 0,
                  server: null
                }
              : undefined
          };
        }
        return m;
      });

      setWatchlist(migrated);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error("[useVault] Supabase error fetching vault:", err);
      setWatchlist([]);
      setLoading(false);
      setError("Failed to load vault data. Please try again later.");
    }
  };

  onMount(() => {
    // Phase 6.2 — auth state from Supabase session.
    // Phase 7.1 — vault READS from Supabase (replaces Firestore onSnapshot).
    const subscription = onSessionChange(async (_event, session: Session | null) => {
      const supabaseUid = session?.user?.id ?? null;
      setIsGuest(!supabaseUid);
      setUid(supabaseUid);

      // Tear down any existing preset subscription
      if (unsubPresets) {
        unsubPresets();
        unsubPresets = null;
      }

      if (supabaseUid) {
        // READ from Supabase (Phase 7.1)
        await refreshVault(supabaseUid);

        // PRESETS still read from Firestore (no Supabase PresetRepository yet)
        unsubPresets = onSnapshot(
          collection(db, "users", supabaseUid, "presets"),
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
    unsubAuth = () => subscription.unsubscribe();
  });

  onCleanup(() => {
    if (unsubAuth) unsubAuth();
    if (unsubPresets) unsubPresets();
  });

  // ---- Optimistic update helper ----
  /**
   * Optimistically update a single item in the local watchlist signal.
   * Called after each Firestore write so the UI reflects the change
   * immediately (the Supabase read path won't see the Firestore write
   * until Phase 7.2 adds dual-write).
   */
  const optimisticUpdate = (itemId: string, patch: Partial<WatchlistItem>) => {
    setWatchlist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    );
  };

  // ---- Write operations (all still use Firestore via watchlistService) ----

  const updateStatus = async (itemId: string, status: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      await svcUpdateStatus(uid()!, itemId, status);
      optimisticUpdate(itemId, { status: status as WatchlistItem["status"] });
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
      optimisticUpdate(itemId, { rating });
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
      optimisticUpdate(itemId, { notes });
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
      optimisticUpdate(itemId, { watchDate });
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
      optimisticUpdate(itemId, { season, episode });
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
        optimisticUpdate(itemId, { status: "Watching" });
      }
      await svcUpdateWatchProgress(uid()!, itemId, progress);
      optimisticUpdate(itemId, { watchProgress: progress });
    } catch (err) {
      showToast("Failed to save progress.", "error");
      throw err;
    }
  };

  const deleteWatchlistItem = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      await svcDeleteWatchlistItem(uid()!, itemId);
      // Optimistic: remove from local signal
      setWatchlist((prev) => prev.filter((item) => item.id !== itemId));
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
