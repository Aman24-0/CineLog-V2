// src/features/watchlist/useVault.ts
//
// Phase 7.2 — Complete Vault Migration
// --------------------------------------
// The Vault feature now uses Supabase as its SINGLE source of truth.
// All reads AND writes go through vaultAdapter → VaultRepository → Supabase.
//
// Firestore is no longer used for vault items. The watchlistService
// (Firestore) is NOT imported. There are no optimistic-update workarounds
// — after each write, the vault is re-fetched from Supabase so the UI
// always reflects the authoritative state.
//
// PRESETS remain on Firestore for now (there is no Supabase PresetRepository
// or presets table). This is the only remaining Firestore dependency in
// this file and is clearly delimited below. Presets are filter
// configurations, not vault items.
import { createContext, useContext, createSignal, onMount, onCleanup, ParentComponent } from "solid-js";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "~/core/firebase";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import { useToast } from "~/shared/hooks/useToast";
import {
  deleteVaultItemInSupabase,
  fetchVaultFromSupabase,
  toggleFavoriteInSupabase,
  togglePinnedInSupabase,
  updateNotesInSupabase,
  updateProgressInSupabase,
  updateRatingInSupabase,
  updateStatusInSupabase,
  updateWatchDateInSupabase
} from "./vaultAdapter";
import {
  updateSeasonEpisodeInSupabase,
  updateWatchProgressInSupabase
} from "./episodeProgressAdapter";
import {
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
   * Refresh the vault from Supabase (the single source of truth).
   * Called on session change and after every write.
   */
  const refreshVault = async (supabaseUid: string) => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchVaultFromSupabase(supabaseUid);
      setWatchlist(items);
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
    const subscription = onSessionChange(async (_event, session: Session | null) => {
      const supabaseUid = session?.user?.id ?? null;
      setIsGuest(!supabaseUid);
      setUid(supabaseUid);

      if (unsubPresets) {
        unsubPresets();
        unsubPresets = null;
      }

      if (supabaseUid) {
        // Vault items: READ from Supabase
        await refreshVault(supabaseUid);

        // PRESETS: still on Firestore (no Supabase PresetRepository).
        // This is the ONLY Firestore dependency remaining in useVault.
        // It will be migrated when a presets table is added to Supabase.
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

  // ---- Write operations (ALL via Supabase through vaultAdapter) ----
  // After each write, refreshVault is called to re-fetch the authoritative
  // state from Supabase. No optimistic updates — single source of truth.

  const updateStatus = async (itemId: string, status: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateStatusInSupabase(uid()!, itemId, item.media_type, status);
      await refreshVault(uid()!);
      showToast("Status updated!", "success");
    } catch (err) {
      showToast("Failed to update status.", "error");
      throw err;
    }
  };

  const updateRating = async (itemId: string, rating: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateRatingInSupabase(uid()!, itemId, item.media_type, rating);
      await refreshVault(uid()!);
      showToast("Rating updated!", "success");
    } catch (err) {
      showToast("Failed to update rating.", "error");
      throw err;
    }
  };

  const updateNotes = async (itemId: string, notes: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateNotesInSupabase(uid()!, itemId, item.media_type, notes);
      await refreshVault(uid()!);
      showToast("Notes saved!", "success");
    } catch (err) {
      showToast("Failed to save notes.", "error");
      throw err;
    }
  };

  const updateWatchDate = async (itemId: string, watchDate: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateWatchDateInSupabase(uid()!, itemId, item.media_type, watchDate);
      await refreshVault(uid()!);
      showToast("Watch date updated!", "success");
    } catch (err) {
      showToast("Failed to update watch date.", "error");
      throw err;
    }
  };

  const updateSeasonEpisode = async (itemId: string, season: number, episode: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      // Phase 7.3 — persists to the `episode_progress` table via
      // EpisodeProgressRepository. The vault row's UUID is resolved
      // from the TMDB identity inside the adapter.
      await updateSeasonEpisodeInSupabase(uid()!, itemId, item.media_type, season, episode);
      await refreshVault(uid()!);
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
        await updateStatusInSupabase(uid()!, itemId, item.media_type, "Watching");
      }
      // Phase 7.3 — persists the season/episode from the WatchProgress
      // object to the `episode_progress` table.
      if (item) {
        await updateWatchProgressInSupabase(uid()!, itemId, item.media_type, progress);
      }
      await refreshVault(uid()!);
    } catch (err) {
      showToast("Failed to save progress.", "error");
      throw err;
    }
  };

  const deleteWatchlistItem = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await deleteVaultItemInSupabase(uid()!, itemId, item.media_type);
      await refreshVault(uid()!);
      showToast("Item deleted.", "success");
    } catch (err) {
      showToast("Failed to delete item.", "error");
      throw err;
    }
  };

  const toggleFavorite = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      // is_favorite state is not on the WatchlistItem — fetch from the
      // repo to get the current value, then toggle.
      await toggleFavoriteInSupabase(uid()!, itemId, item.media_type, false);
      await refreshVault(uid()!);
    } catch (err) {
      showToast("Failed to toggle favorite.", "error");
      throw err;
    }
  };

  const togglePinned = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await togglePinnedInSupabase(uid()!, itemId, item.media_type, false);
      await refreshVault(uid()!);
    } catch (err) {
      showToast("Failed to toggle pin.", "error");
      throw err;
    }
  };

  const updateProgress = async (itemId: string, progressMinutes: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateProgressInSupabase(uid()!, itemId, item.media_type, progressMinutes);
      await refreshVault(uid()!);
    } catch (err) {
      showToast("Failed to update progress.", "error");
      throw err;
    }
  };

  // ---- Presets (still Firestore — no Supabase table yet) ----

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
    toggleFavorite,
    togglePinned,
    updateProgress,
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
