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
  updateTagInSupabase,
  clearTagFromAllItemsInSupabase,
  updateWatchDateInSupabase
} from "./vaultAdapter";
import {
  updateSeasonEpisodeInSupabase,
  updateWatchProgressInSupabase
} from "./episodeProgressAdapter";
import { useVaultPresets } from "./useVaultPresets";
import type {
  WatchlistItem,
  WatchProgress,
  VaultFilters
} from "~/shared/types";

export interface VaultStore extends UserLibrary {
  readonly presets: () => import("~/shared/types").FilterPreset[];
  readonly uid: () => string | null;
  readonly updateStatus: (itemId: string, status: string) => Promise<void>;
  readonly updateRating: (itemId: string, rating: number) => Promise<void>;
  readonly updateNotes: (itemId: string, notes: string) => Promise<void>;
  readonly updateWatchDate: (
    itemId: string,
    watchDate: string
  ) => Promise<void>;
  readonly updateSeasonEpisode: (
    itemId: string,
    season: number,
    episode: number
  ) => Promise<void>;
  readonly updateWatchProgress: (
    itemId: string,
    progress: WatchProgress
  ) => Promise<void>;
  readonly deleteWatchlistItem: (itemId: string) => Promise<void>;
  readonly toggleFavorite: (itemId: string) => Promise<void>;
  readonly togglePinned: (itemId: string) => Promise<void>;
  readonly updateProgress: (
    itemId: string,
    progressMinutes: number
  ) => Promise<void>;
  readonly updateTag: (
    itemId: string,
    tag: string | null
  ) => Promise<void>;
  readonly clearTagFromAllItems: (tagName: string) => Promise<number>;
  readonly savePreset: (name: string, filters: VaultFilters) => Promise<void>;
  readonly deletePreset: (presetId: string) => Promise<void>;
  readonly renamePreset: (presetId: string, name: string) => Promise<void>;
  readonly refreshPresets: (userId: string) => Promise<void>;
}

const useVaultLogic = (): VaultStore => {
  const library = useUserLibrary();
  const {
    watchlist,
    loading,
    isGuest,
    error,
    refresh,
    updateItem,
    removeItem
  } = library;
  const { showToast } = useToast();
  const uid = () => getCurrentUid();
  const presetsMgr = useVaultPresets();

  // Helper: find a vault item by id (returns undefined if not found).
  const findItem = (itemId: string) => {
    return watchlist().find((m) => m.id === itemId);
  };

  /**
   * Optimistic write helper: update local state immediately, then persist
   * to Supabase asynchronously. If the write fails, revert the local state.
   *
   * This replaces the previous `runWrite` which called `await refresh()`
   * after every mutation — a full Supabase + TMDB round-trip that took
   * 200-1500ms. The optimistic approach updates the UI in ~5ms and
   * persists in the background.
   *
   * For mutations that change a WatchlistItem field (status, rating, notes,
   * etc.), pass a `localUpdate` object so the local signal is updated
   * immediately. ALL localUpdate objects MUST include `updatedAt` so the
   * sort-by-"updated" order stays consistent with the server (which sets
   * updated_at = now() via trigger on every write).
   *
   * For mutations where the primary field is not in WatchlistItem
   * (is_favorite, is_pinned, progress_minutes), `localUpdate` should
   * still be provided with at least `{ updatedAt }` so the "updated"
   * sort order remains correct. The primary field won't change visually
   * (it's not in the client model), but the sort position will update.
   */
  const runWriteOptimistic = async (
    itemId: string,
    op: (
      uid: string,
      itemId: string,
      mediaType: "movie" | "tv"
    ) => Promise<unknown>,
    successMsg: string,
    errorMsg: string,
    localUpdate?: Partial<WatchlistItem>
  ) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");

    // Apply optimistic local update BEFORE the network write
    if (localUpdate) {
      updateItem(itemId, localUpdate);
    }

    // Show success toast immediately for responsive feedback
    if (successMsg) showToast(successMsg, "success");

    // Persist to Supabase in the background
    try {
      const item = findItem(itemId) ?? watchlist().find((m) => m.id === itemId);
      if (!item) throw new Error("Item not found in vault");
      await op(uid()!, itemId, item.media_type);
    } catch (err) {
      // Revert optimistic update on failure
      if (localUpdate) {
        // Refresh to get the server's true state
        void refresh();
      }
      showToast(errorMsg, "error");
      throw err;
    }
  };

  // ---- Vault write operations (optimistic) ----
  const updateStatus = (itemId: string, status: string) =>
    runWriteOptimistic(
      itemId,
      (u, id, mt) => updateStatusInSupabase(u, id, mt, status),
      "Status updated!",
      "Failed to update status.",
      {
        status: status as WatchlistItem["status"],
        updatedAt: new Date().toISOString()
      }
    );
  const updateRating = (itemId: string, rating: number) =>
    runWriteOptimistic(
      itemId,
      (u, id, mt) => updateRatingInSupabase(u, id, mt, rating),
      "Rating updated!",
      "Failed to update rating.",
      { rating, updatedAt: new Date().toISOString() }
    );
  const updateNotes = (itemId: string, notes: string) =>
    runWriteOptimistic(
      itemId,
      (u, id, mt) => updateNotesInSupabase(u, id, mt, notes),
      "Notes saved!",
      "Failed to save notes.",
      { notes, updatedAt: new Date().toISOString() }
    );
  const updateWatchDate = (itemId: string, watchDate: string) =>
    runWriteOptimistic(
      itemId,
      (u, id, mt) => updateWatchDateInSupabase(u, id, mt, watchDate),
      "Watch date updated!",
      "Failed to update watch date.",
      { watchDate, updatedAt: new Date().toISOString() }
    );
  const updateSeasonEpisode = (
    itemId: string,
    season: number,
    episode: number
  ) =>
    runWriteOptimistic(
      itemId,
      (u, id, mt) => updateSeasonEpisodeInSupabase(u, id, mt, season, episode),
      "Episode progress updated!",
      "Failed to update episode progress.",
      {
        season,
        episode,
        watchProgress: { currentTime: 0, duration: 0, season, episode },
        updatedAt: new Date().toISOString()
      }
    );
  const deleteWatchlistItem = (itemId: string): Promise<void> => {
    // Delete uses removeItem (removes from local array) instead of updateItem
    if (!uid()) {
      showToast("Please sign in to make changes.", "error");
      return Promise.resolve();
    }

    // Capture media_type BEFORE removing from local array
    const item = findItem(itemId);
    const mediaType = item?.media_type ?? "movie"; // fallback; deleteVaultItemInSupabase resolves via getVaultByTmdbId

    // Optimistic removal — remove from local array immediately
    removeItem(itemId);
    showToast("Item deleted.", "success");

    // Persist to Supabase in the background
    return deleteVaultItemInSupabase(uid()!, itemId, mediaType).catch(() => {
      // On failure, refresh to restore the item
      void refresh();
      showToast("Failed to delete item.", "error");
    });
  };
  const toggleFavorite = (itemId: string) => {
    // Read the current isFavorite state from the in-memory WatchlistItem.
    // The vault read adapters (vaultReadAdapter.ts + userLibraryAdapter.ts)
    // hydrate this field from the `is_favorite` column on the vault table,
    // defaulting to false when the column is null (handles pre-migration rows).
    //
    // Previously this cast `findItem(itemId)` to `WatchlistItem & { isFavorite?: boolean }`
    // because the field didn't exist on the type — so the cast always read
    // `undefined` → `false`, meaning toggleFavorite ALWAYS set is_favorite=true
    // and the user could never un-favorite an item. Now that the field is on
    // the type and is properly hydrated, the cast is unnecessary and the
    // toggle correctly flips the current value.
    const currentIsFavorite = findItem(itemId)?.isFavorite ?? false;
    const newIsFavorite = !currentIsFavorite;
    return runWriteOptimistic(
      itemId,
      (u, id, mt) => toggleFavoriteInSupabase(u, id, mt, currentIsFavorite),
      "",
      "Failed to toggle favorite.",
      // Optimistic update: flip the local isFavorite flag immediately so
      // the star/heart icon updates without waiting for the round-trip.
      { isFavorite: newIsFavorite, updatedAt: new Date().toISOString() }
    );
  };
  const togglePinned = (itemId: string) => {
    // Same pattern as toggleFavorite — read current isPinned from the
    // hydrated WatchlistItem (no more cast-to-optional-field hack).
    const currentIsPinned = findItem(itemId)?.isPinned ?? false;
    const newIsPinned = !currentIsPinned;
    return runWriteOptimistic(
      itemId,
      (u, id, mt) => togglePinnedInSupabase(u, id, mt, currentIsPinned),
      "",
      "Failed to toggle pin.",
      // Optimistic update: flip the local isPinned flag immediately.
      { isPinned: newIsPinned, updatedAt: new Date().toISOString() }
    );
  };
  const updateProgress = (itemId: string, progressMinutes: number) =>
    // progress_minutes is NOT in WatchlistItem, but updatedAt should reflect the write
    runWriteOptimistic(
      itemId,
      (u, id, mt) => updateProgressInSupabase(u, id, mt, progressMinutes),
      "",
      "Failed to update progress.",
      { updatedAt: new Date().toISOString() }
    );

  // ---- Tag CRUD (Phase 6.2 Task 1a) ----
  // updateTag sets a single tag string on one vault item. Pass null/"" to
  // clear. The tag is persisted to the `tag` TEXT column on the vault
  // table (added in 20260808_add_vault_tag.sql) and mirrored optimistically
  // on the local WatchlistItem so the UI updates immediately.
  const updateTag = (itemId: string, tag: string | null) => {
    const trimmed = tag && tag.trim() ? tag.trim() : null;
    return runWriteOptimistic(
      itemId,
      (u, id, mt) => updateTagInSupabase(u, id, mt, trimmed),
      trimmed ? "Tag added!" : "Tag removed!",
      "Failed to update tag.",
      { tag: trimmed ?? undefined, updatedAt: new Date().toISOString() }
    );
  };

  /**
   * clearTagFromAllItems — bulk-clears a tag value from every vault item
   * that currently has it set. Used by the "Manage Tags" UI in the filter
   * panel when a user deletes a tag from their vocabulary.
   *
   * Optimistically clears the tag on every local item that has it, then
   * issues a single SQL UPDATE to the vault table. On failure, refreshes
   * from the server to restore the true state.
   *
   * Returns the count of items that had the tag cleared (from the server).
   */
  const clearTagFromAllItems = async (tagName: string): Promise<number> => {
    if (!uid()) {
      showToast("Please sign in to make changes.", "error");
      return 0;
    }
    // Optimistic local update — clear the tag on every matching item.
    // We read the current watchlist once, then call updateItem for each
    // match. updateItem merges the partial update into the stored item.
    const matching = watchlist().filter((m) => m.tag === tagName);
    if (matching.length === 0) {
      showToast(`No items tagged "${tagName}".`, "info");
      return 0;
    }
    const nowIso = new Date().toISOString();
    for (const item of matching) {
      updateItem(item.id, { tag: undefined, updatedAt: nowIso });
    }
    try {
      const count = await clearTagFromAllItemsInSupabase(uid()!, tagName);
      showToast(
        count > 0
          ? `Removed "${tagName}" from ${count} item${count === 1 ? "" : "s"}.`
          : `Tag "${tagName}" removed.`,
        "success"
      );
      return count;
    } catch (err) {
      void refresh();
      showToast(`Failed to remove tag "${tagName}".`, "error");
      throw err;
    }
  };

  // ---- Watch progress (special: auto-upgrades Planned → Watching) ----
  const updateWatchProgress = async (
    itemId: string,
    progress: WatchProgress
  ) => {
    if (!uid()) return showToast("Please sign in to make changes.", "error");
    const item = watchlist().find((m) => m.id === itemId);

    // Optimistic local update
    const statusUpgrade =
      item && (item.status === "Planned" || item.status === "Plan to Watch");
    updateItem(itemId, {
      season: progress.season,
      episode: progress.episode,
      watchProgress: progress,
      ...(statusUpgrade
        ? { status: "Watching" as WatchlistItem["status"] }
        : {}),
      updatedAt: new Date().toISOString()
    });

    // Persist to Supabase in the background
    try {
      if (statusUpgrade) {
        await updateStatusInSupabase(
          uid()!,
          itemId,
          item.media_type,
          "Watching"
        );
      }
      if (item) {
        await updateWatchProgressInSupabase(
          uid()!,
          itemId,
          item.media_type,
          progress
        );
      }
    } catch (err) {
      // Revert on failure
      void refresh();
      showToast("Failed to save progress.", "error");
      throw err;
    }
  };

  return {
    watchlist,
    loading,
    isGuest,
    error,
    updateItem,
    removeItem,
    presets: presetsMgr.presets,
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
    updateTag,
    clearTagFromAllItems,
    savePreset: presetsMgr.savePreset,
    deletePreset: presetsMgr.deletePreset,
    renamePreset: presetsMgr.renamePreset,
    refreshPresets: presetsMgr.refreshPresets,
    refresh
  };
};

const VaultContext = createContext<VaultStore>();

export const VaultProvider: ParentComponent = (props) => {
  const vault = useVaultLogic();
  return (
    <VaultContext.Provider value={vault}>
      {props.children}
    </VaultContext.Provider>
  );
};

/** @deprecated Use useUserLibrary() directly for read-only access. */
export function useVault(): VaultStore {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within a VaultProvider");
  return ctx;
}
