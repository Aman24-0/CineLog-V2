// src/features/details/DetailsModal/useDetailsActions.ts
import { createSignal, createMemo } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { pickTrailer } from "~/core/tmdb/tmdb";
import {
  createVaultItemInSupabase,
  deleteVaultItemInSupabase,
  updateNotesInSupabase,
  updateRatingInSupabase,
  updateRewatchInSupabase,
  updateStatusInSupabase,
  updateWatchDateInSupabase,
} from "~/features/watchlist/vaultAdapter";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";
import type { DetailsFormState } from "./types";
import { useDetailsProgress } from "./useDetailsProgress";

/**
 * useDetailsActions — owns all user-action handlers for the Details modal.
 *
 * Each handler persists changes to Supabase via the vault/episode-progress
 * adapters, then upgrades the modal's SelectedItem state in place so the
 * UI re-renders without a remount. Toast feedback is fired for every
 * user-visible outcome.
 *
 * Progress-related handlers (status cycle, mark completed, episode change,
 * select item) are delegated to `useDetailsProgress` to keep this file
 * focused on form/save logic.
 */
export interface UseDetailsActionsArgs {
  baseItem: Accessor<WatchlistItem | null>;
  vaultItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  watchlist: Accessor<WatchlistItem[]>;
  form: Accessor<DetailsFormState>;
  resetTo: (v: WatchlistItem | null) => void;
  setSelectedItem: Setter<{ baseItem: WatchlistItem; vaultItem: WatchlistItem | null } | null>;
  /** Called after a successful remove to close the modal. */
  onRemoved: () => void;
}

export interface UseDetailsActionsResult {
  hasTrailer: Accessor<boolean>;
  trailerKey: Accessor<string | null>;
  isAdding: Accessor<boolean>;
  isSaving: Accessor<boolean>;
  isRemoving: Accessor<boolean>;
  handleAddToVault: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleCancel: () => void;
  handleStatusCycle: () => Promise<void>;
  /** Set status directly to a specific value (Planned / Watching / Completed / Dropped). */
  handleSetStatus: (status: WatchlistItem["status"]) => Promise<void>;
  handleEpisodeChange: (season: number, episode: number) => Promise<void>;
  handleMarkCompleted: () => Promise<void>;
  handleSelectItem: (item: WatchlistItem) => void;
  handleRemoveFromVault: () => Promise<void>;
}

export function useDetailsActions(args: UseDetailsActionsArgs): UseDetailsActionsResult {
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = createSignal(false);
  const [isAdding, setIsAdding] = createSignal(false);
  const [isRemoving, setIsRemoving] = createSignal(false);

  const hasTrailer = createMemo(() => pickTrailer(args.details()) !== null);
  const trailerKey = createMemo(() => pickTrailer(args.details())?.key ?? null);

  const handleAddToVault = async () => {
    const uid = getCurrentUid();
    const b = args.baseItem();
    if (!uid) {
      showToast("Sign in to save titles to your vault.", "error");
      return;
    }
    if (!b) return;
    setIsAdding(true);
    try {
      const newItem = await createVaultItemInSupabase(uid, b);
      args.setSelectedItem({ baseItem: newItem, vaultItem: newItem });
      const name = b.title || b.name || "Title";
      showToast(`Added "${name}" to your vault`, "success", 1800);
    } catch (err) {
      console.error("Failed to add to vault:", err);
      showToast("Failed to add. Try again.", "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleSave = async () => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid) {
      showToast("Please sign in to save changes.", "error");
      return;
    }
    if (!v) return;
    if (Number(args.form().rating) < 0 || Number(args.form().rating) > 10) {
      showToast("Rating must be between 0 and 10.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const updates: Promise<unknown>[] = [];
      if (args.form().status !== (v.status || "Planned")) {
        updates.push(updateStatusInSupabase(uid, v.id, v.media_type, args.form().status));
      }
      if (Number(args.form().rating) !== (v.rating || 0)) {
        updates.push(updateRatingInSupabase(uid, v.id, v.media_type, Number(args.form().rating)));
      }
      if (args.form().notes !== (v.notes || "")) {
        updates.push(updateNotesInSupabase(uid, v.id, v.media_type, args.form().notes));
      }
      if (args.form().watchDate !== (v.watchDate || "")) {
        updates.push(updateWatchDateInSupabase(uid, v.id, v.media_type, args.form().watchDate));
      }

      // Re-watch tracking — persist if either the count or the dates
      // array changed. We compare against the vault item's current
      // values so we don't write on every save.
      const newCount = Number(args.form().rewatchCount) || 0;
      const oldCount = v.rewatchCount ?? 0;
      const newDates = args.form().rewatchDates;
      const oldDates = v.rewatchDates ?? [];
      const datesChanged =
        newDates.length !== oldDates.length ||
        newDates.some((d, i) => d !== (oldDates[i] ?? ""));
      if (newCount !== oldCount || datesChanged) {
        updates.push(
          updateRewatchInSupabase(uid, v.id, v.media_type, newCount, newDates),
        );
      }

      await Promise.all(updates);
      showToast("Saved successfully!", "success");
      // Cast form().status to the WatchlistItem status union — the form is
      // typed as string because DetailsEditForm uses a <select>, but the
      // values are always one of the 4 valid statuses.
      const updatedVault: WatchlistItem = {
        ...v,
        status: args.form().status as WatchlistItem["status"],
        rating: Number(args.form().rating) || v.rating,
        watchDate: args.form().watchDate,
        notes: args.form().notes,
        rewatchCount: newCount,
        rewatchDates: [...newDates],
      };
      args.setSelectedItem({
        baseItem: { ...args.baseItem()!, ...updatedVault },
        vaultItem: updatedVault,
      });
      // Exit edit mode (mirrors the original setIsEditing(false) at end of save)
      args.resetTo(updatedVault);
    } catch (err) {
      console.error("Save failed:", err);
      showToast("Failed to save changes.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => args.resetTo(args.vaultItem());

  /**
   * Remove the current title from the user's vault.
   *
   * Calls deleteVaultItemInSupabase (soft-delete: sets deleted_at on the
   * vault row). On success, fires a toast with the title name, then calls
   * args.onRemoved() so the parent can close the modal.
   *
   * If the delete fails, the user sees an error toast and nothing is
   * removed locally — the vaultItem stays intact.
   *
   * Offline behavior: Supabase calls fail fast when offline. The user
   * sees "Couldn't remove title. Please try again." — no local removal
   * happens, so no orphaned state.
   */
  const handleRemoveFromVault = async () => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid) {
      showToast("Please sign in to make changes.", "error");
      return;
    }
    if (!v) {
      // Safety: title is no longer in the vault.
      showToast("This title is no longer in your library.", "info");
      args.onRemoved();
      return;
    }
    setIsRemoving(true);
    try {
      await deleteVaultItemInSupabase(uid, v.id, v.media_type);
      const name = v.title || v.name || "Title";
      showToast(`Removed "${name}"`, "success");
      args.onRemoved();
    } catch (err) {
      console.error("Failed to remove from vault:", err);
      showToast("Couldn't remove title. Please try again.", "error");
    } finally {
      setIsRemoving(false);
    }
  };

  const progress = useDetailsProgress({
    baseItem: args.baseItem,
    vaultItem: args.vaultItem,
    watchlist: args.watchlist,
    setSelectedItem: args.setSelectedItem,
    showToast,
  });

  return {
    hasTrailer,
    trailerKey,
    isAdding,
    isSaving,
    isRemoving,
    handleAddToVault,
    handleSave,
    handleCancel,
    handleRemoveFromVault,
    ...progress,
  };
}
