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
//   Presets: useVault → useVaultPresets → presetAdapter → PresetRepository → Supabase
import { createContext, useContext, ParentComponent } from "solid-js";
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
  updateWatchDateInSupabase,
} from "./vaultAdapter";
import {
  updateSeasonEpisodeInSupabase,
  updateWatchProgressInSupabase,
} from "./episodeProgressAdapter";
import { useVaultPresets } from "./useVaultPresets";
import type { WatchProgress, VaultFilters } from "~/shared/types";

export interface VaultStore extends UserLibrary {
  readonly presets: () => import("~/shared/types").FilterPreset[];
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
  readonly refreshPresets: (userId: string) => Promise<void>;
}

const useVaultLogic = (): VaultStore => {
  const library = useUserLibrary();
  const { watchlist, loading, isGuest, error, refresh } = library;
  const { showToast } = useToast();
  const uid = () => getCurrentUid();
  const presetsMgr = useVaultPresets();

  // Helper: find a vault item by id (throws if not found).
  const findItem = (itemId: string) => {
    const item = watchlist().find((m) => m.id === itemId);
    if (!item) throw new Error("Item not found in vault");
    return item;
  };

  // Helper: run a Supabase write, refresh the library, show a success toast
  // (only if successMsg is non-empty — toggleFavorite/togglePinned are silent
  // on success in the original implementation).
  const runWrite = async (
    itemId: string,
    op: (uid: string, itemId: string, mediaType: "movie" | "tv") => Promise<unknown>,
    successMsg: string,
    errorMsg: string,
  ) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    try {
      const item = findItem(itemId);
      await op(uid()!, itemId, item.media_type);
      await refresh();
      if (successMsg) showToast(successMsg, "success");
    } catch (err) {
      showToast(errorMsg, "error");
      throw err;
    }
  };

  // ---- Vault write operations (via Supabase) ----
  const updateStatus = (itemId: string, status: string) =>
    runWrite(itemId, (u, id, mt) => updateStatusInSupabase(u, id, mt, status), "Status updated!", "Failed to update status.");
  const updateRating = (itemId: string, rating: number) =>
    runWrite(itemId, (u, id, mt) => updateRatingInSupabase(u, id, mt, rating), "Rating updated!", "Failed to update rating.");
  const updateNotes = (itemId: string, notes: string) =>
    runWrite(itemId, (u, id, mt) => updateNotesInSupabase(u, id, mt, notes), "Notes saved!", "Failed to save notes.");
  const updateWatchDate = (itemId: string, watchDate: string) =>
    runWrite(itemId, (u, id, mt) => updateWatchDateInSupabase(u, id, mt, watchDate), "Watch date updated!", "Failed to update watch date.");
  const updateSeasonEpisode = (itemId: string, season: number, episode: number) =>
    runWrite(itemId, (u, id, mt) => updateSeasonEpisodeInSupabase(u, id, mt, season, episode), "Episode progress updated!", "Failed to update episode progress.");
  const deleteWatchlistItem = (itemId: string) =>
    runWrite(itemId, (u, id, mt) => deleteVaultItemInSupabase(u, id, mt), "Item deleted.", "Failed to delete item.");
  const toggleFavorite = (itemId: string) =>
    runWrite(itemId, (u, id, mt) => toggleFavoriteInSupabase(u, id, mt, false), "", "Failed to toggle favorite.");
  const togglePinned = (itemId: string) =>
    runWrite(itemId, (u, id, mt) => togglePinnedInSupabase(u, id, mt, false), "", "Failed to toggle pin.");
  const updateProgress = (itemId: string, progressMinutes: number) =>
    runWrite(itemId, (u, id, mt) => updateProgressInSupabase(u, id, mt, progressMinutes), "", "Failed to update progress.");

  // ---- Watch progress (special: auto-upgrades Planned → Watching) ----
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
    } catch (err) {
      showToast("Failed to save progress.", "error");
      throw err;
    }
  };

  return {
    watchlist, loading, isGuest, error,
    presets: presetsMgr.presets, uid,
    updateStatus, updateRating, updateNotes, updateWatchDate,
    updateSeasonEpisode, updateWatchProgress, deleteWatchlistItem,
    toggleFavorite, togglePinned, updateProgress,
    savePreset: presetsMgr.savePreset,
    deletePreset: presetsMgr.deletePreset,
    renamePreset: presetsMgr.renamePreset,
    refreshPresets: presetsMgr.refreshPresets,
    refresh,
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
