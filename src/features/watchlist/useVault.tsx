// src/features/watchlist/useVault.ts
//
// Phase 12.2 — Complete Presets Migration & Firebase Removal
// ----------------------------------------------------------
// useVault() is now a COMPATIBILITY WRAPPER around useUserLibrary().
// The READ path (watchlist, loading, isGuest, error) delegates entirely
// to the shared UserLibraryProvider. WRITE methods call vaultAdapter +
// episodeProgressAdapter. PRESETS now use Supabase via presetAdapter.
//
// ZERO Firestore dependencies. ZERO Firebase imports.
//
// Architecture:
//   App → UserLibraryProvider → useUserLibrary() → useVault() (compat) → consumers
//   Presets: useVault → presetAdapter → PresetRepository → Supabase
import { createContext, useContext, createSignal, onMount, onCleanup, ParentComponent } from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import { useToast } from "~/shared/hooks/useToast";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import type { UserLibrary } from "~/shared/hooks/useUserLibrary";
import {
  deleteVaultItemInSupabase,
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
  fetchPresetsFromSupabase,
  createPresetInSupabase,
  renamePresetInSupabase,
  deletePresetFromSupabase
} from "./presetAdapter";
import type { WatchProgress, FilterPreset, VaultFilters } from "~/shared/types";

export interface VaultStore extends UserLibrary {
  readonly presets: () => FilterPreset[];
  readonly uid: () => string | null;
  readonly updateStatus: (itemId: string, status: string) => Promise<void>;
  readonly updateRating: (itemId: string, rating: number) => Promise<void>;
  readonly updateNotes: (itemId: string, notes: string) => Promise<void>;
  readonly updateWatchDate: (itemId: string, watchDate: string) => Promise<void>;
  readonly updateSeasonEpisode: (itemId: string, season: number, episode: number) => Promise<void>;
  readonly updateWatchProgress: (itemId: string, progress: WatchProgress) => Promise<void>;
  readonly deleteWatchlistItem: (itemId: string) => Promise<void>;
  readonly toggleFavorite: (itemId: string) => Promise<void>;
  readonly togglePinned: (itemId: string) => Promise<void>;
  readonly updateProgress: (itemId: string, progressMinutes: number) => Promise<void>;
  readonly savePreset: (name: string, filters: VaultFilters) => Promise<void>;
  readonly deletePreset: (presetId: string) => Promise<void>;
  readonly renamePreset: (presetId: string, name: string) => Promise<void>;
}

const useVaultLogic = (): VaultStore => {
  const library = useUserLibrary();
  const { watchlist, loading, isGuest, error, refresh } = library;

  const { showToast } = useToast();
  const [presets, setPresets] = createSignal<FilterPreset[]>([]);

  let unsubAuth: (() => void) | null = null;

  /** Refresh presets from Supabase (single source of truth). */
  const refreshPresets = async (userId: string) => {
    try {
      const items = await fetchPresetsFromSupabase(userId);
      setPresets(items);
    } catch (err) {
      console.error("[useVault] Error fetching presets:", err);
    }
  };

  onMount(() => {
    const subscription = onSessionChange(async (_event, session: Session | null) => {
      const supabaseUid = session?.user?.id ?? null;
      if (supabaseUid) {
        await refreshPresets(supabaseUid);
      } else {
        setPresets([]);
      }
    });
    unsubAuth = () => subscription.unsubscribe();
  });

  onCleanup(() => {
    if (unsubAuth) unsubAuth();
  });

  const uid = () => getCurrentUid();

  // ---- Vault write operations (via Supabase) ----
  const updateStatus = async (itemId: string, status: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateStatusInSupabase(uid()!, itemId, item.media_type, status);
      await refresh();
      showToast("Status updated!", "success");
    } catch (err) { showToast("Failed to update status.", "error"); throw err; }
  };

  const updateRating = async (itemId: string, rating: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateRatingInSupabase(uid()!, itemId, item.media_type, rating);
      await refresh();
      showToast("Rating updated!", "success");
    } catch (err) { showToast("Failed to update rating.", "error"); throw err; }
  };

  const updateNotes = async (itemId: string, notes: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateNotesInSupabase(uid()!, itemId, item.media_type, notes);
      await refresh();
      showToast("Notes saved!", "success");
    } catch (err) { showToast("Failed to save notes.", "error"); throw err; }
  };

  const updateWatchDate = async (itemId: string, watchDate: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateWatchDateInSupabase(uid()!, itemId, item.media_type, watchDate);
      await refresh();
      showToast("Watch date updated!", "success");
    } catch (err) { showToast("Failed to update watch date.", "error"); throw err; }
  };

  const updateSeasonEpisode = async (itemId: string, season: number, episode: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateSeasonEpisodeInSupabase(uid()!, itemId, item.media_type, season, episode);
      await refresh();
      showToast("Episode progress updated!", "success");
    } catch (err) { showToast("Failed to update episode progress.", "error"); throw err; }
  };

  const updateWatchProgress = async (itemId: string, progress: WatchProgress) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    const item = watchlist().find((m) => m.id === itemId);
    try {
      if (item && (item.status === "Planned" || item.status === "Plan to Watch")) {
        await updateStatusInSupabase(uid()!, itemId, item.media_type, "Watching");
      }
      if (item) {
        await updateWatchProgressInSupabase(uid()!, itemId, item.media_type, progress);
      }
      await refresh();
    } catch (err) { showToast("Failed to save progress.", "error"); throw err; }
  };

  const deleteWatchlistItem = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await deleteVaultItemInSupabase(uid()!, itemId, item.media_type);
      await refresh();
      showToast("Item deleted.", "success");
    } catch (err) { showToast("Failed to delete item.", "error"); throw err; }
  };

  const toggleFavorite = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await toggleFavoriteInSupabase(uid()!, itemId, item.media_type, false);
      await refresh();
    } catch (err) { showToast("Failed to toggle favorite.", "error"); throw err; }
  };

  const togglePinned = async (itemId: string) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await togglePinnedInSupabase(uid()!, itemId, item.media_type, false);
      await refresh();
    } catch (err) { showToast("Failed to toggle pin.", "error"); throw err; }
  };

  const updateProgress = async (itemId: string, progressMinutes: number) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await updateProgressInSupabase(uid()!, itemId, item.media_type, progressMinutes);
      await refresh();
    } catch (err) { showToast("Failed to update progress.", "error"); throw err; }
  };

  // ---- Presets (via Supabase through presetAdapter) ----
  const savePreset = async (name: string, filters: VaultFilters) => {
    if (!uid()) return;
    try {
      await createPresetInSupabase(uid()!, name, filters);
      await refreshPresets(uid()!);
      showToast("Preset saved!", "success");
    } catch { showToast("Failed to save preset.", "error"); }
  };

  const deletePreset = async (presetId: string) => {
    if (!uid()) return;
    try {
      await deletePresetFromSupabase(presetId);
      await refreshPresets(uid()!);
      showToast("Preset deleted.", "success");
    } catch { showToast("Failed to delete preset.", "error"); }
  };

  const renamePreset = async (presetId: string, name: string) => {
    if (!uid()) return;
    try {
      await renamePresetInSupabase(presetId, name);
      await refreshPresets(uid()!);
      showToast("Preset renamed.", "success");
    } catch { showToast("Failed to rename preset.", "error"); }
  };

  return {
    watchlist, loading, isGuest, error,
    presets, uid,
    updateStatus, updateRating, updateNotes, updateWatchDate,
    updateSeasonEpisode, updateWatchProgress, deleteWatchlistItem,
    toggleFavorite, togglePinned, updateProgress,
    savePreset, deletePreset, renamePreset,
    refresh
  };
};

const VaultContext = createContext<VaultStore>();

export const VaultProvider: ParentComponent = (props) => {
  const vault = useVaultLogic();
  return <VaultContext.Provider value={vault}>{props.children}</VaultContext.Provider>;
};

/** @deprecated Use useUserLibrary() directly for read-only access. */
export function useVault(): VaultStore {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within a VaultProvider");
  return ctx;
}
