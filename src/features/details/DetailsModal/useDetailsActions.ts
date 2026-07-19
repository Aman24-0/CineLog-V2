// src/features/details/DetailsModal/useDetailsActions.ts
import { createSignal, createMemo, createEffect, onCleanup } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { pickTrailer, fetchAnyVideoKey } from "~/core/tmdb/tmdb";
import {
  createVaultItemInSupabase,
  deleteVaultItemInSupabase,
  updateNotesInSupabase,
  updateRatingInSupabase,
  updateRewatchInSupabase,
  updateSeasonDatesInSupabase,
  updateStatusInSupabase,
  updateWatchDateInSupabase,
} from "~/features/watchlist/vaultAdapter";
import { cacheMetadataEntries, buildCacheKey } from "~/shared/utils/tmdbCache";
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
  const { openAuthModal } = useAuthModal();
  const [isSaving, setIsSaving] = createSignal(false);
  const [isAdding, setIsAdding] = createSignal(false);
  const [isRemoving, setIsRemoving] = createSignal(false);

  // ── Trailer resolution ──────────────────────────────────────────────
  //
  // v2.4: Two-pass trailer lookup so titles with NO English trailer in
  // their main /details payload still surface a playable video.
  //
  // Pass 1: pickTrailer(details) — scans the videos array that came back
  //         with the main /details fetch (language=en-US +
  //         include_video_language=en,null). Covers English + null-
  //         language trailers/teasers/clips.
  //
  // Pass 2: fetchAnyVideoKey(mediaType, id) — only fires if pass 1
  //         returned null. Makes a SEPARATE /videos call with a broader
  //         include_video_language list (en,null,hi,ja,ko,zh,es,fr,de,
  //         it,pt,ru,ta,te,mr,bn) so international titles (Bollywood,
  //         K-dramas, anime) with ONLY native-language trailers are
  //         caught.
  //
  // The fallback key is cached in `fallbackTrailerKey` and cleared
  // whenever the open title changes (so we don't leak a previous title's
  // trailer into the next one).
  const [fallbackTrailerKey, setFallbackTrailerKey] = createSignal<string | null>(null);

  // Reset fallback whenever the open title changes (id or media_type).
  // The baseItem's TMDB id is a stable identifier for the open title.
  createEffect(() => {
    const item = args.baseItem();
    // Read id + media_type to track them as deps.
    const _id = item?.id;
    const _mt = item?.media_type;
    // Re-run on change.
    setFallbackTrailerKey(null);
  });

  // Trigger the fallback fetch when pickTrailer returns null.
  // Uses a `disposed` flag so the .then() callback never writes to a
  // dead signal when the modal unmounts while the fetch is in flight.
  createEffect(() => {
    const details = args.details();
    const item = args.baseItem();
    if (!details || !item) return;
    // Pass 1: if main payload has a trailer, no need for fallback.
    if (pickTrailer(details) !== null) return;
    // Pass 2: fire fallback fetch.
    const mediaType = item.media_type;
    const id = item.id;
    if (!mediaType || !id) return;
    let disposed = false;
    onCleanup(() => { disposed = true; });
    void fetchAnyVideoKey(
      mediaType === "movie" ? "movie" : "tv",
      id,
    ).then((key) => {
      // Guard: skip if the effect was cleaned up (modal unmounted)
      // OR if we've navigated to a different title since the fetch started.
      if (!disposed && args.baseItem()?.id === id) {
        setFallbackTrailerKey(key);
      }
    });
  });

  const hasTrailer = createMemo(() => {
    const details = args.details();
    if (pickTrailer(details) !== null) return true;
    return fallbackTrailerKey() !== null;
  });

  const trailerKey = createMemo(() => {
    const details = args.details();
    const primary = pickTrailer(details)?.key ?? null;
    if (primary) return primary;
    return fallbackTrailerKey();
  });

  const handleAddToVault = async () => {
    const uid = getCurrentUid();
    const b = args.baseItem();
    if (!uid) {
      // Guest user tapped "+ Add to Watchlist" — open the AuthModal
      // so they can sign in / sign up, then they can retry the add.
      // (Per the share-link flow: a guest who opens a deep link sees
      // only the + and Trailer buttons; tapping + must surface the
      // login UI rather than silently failing.)
      showToast("Sign in to save titles to your vault.", "info");
      openAuthModal();
      return;
    }
    if (!b) return;
    setIsAdding(true);
    try {
      const newItem = await createVaultItemInSupabase(uid, b);
      args.setSelectedItem({ baseItem: newItem, vaultItem: newItem });
      // Cache TMDB metadata for this title so the watchlist loads faster
      // Use the details data if available (richer), otherwise fall back to baseItem
      const details = args.details();
      const cacheData = details
        ? { ...b, title: details.title || b.title, name: details.name || b.name, poster_path: details.poster_path || b.poster_path, backdrop_path: details.backdrop_path || b.backdrop_path, genres: details.genres, vote_average: details.vote_average }
        : b;
      cacheMetadataEntries([{
        key: buildCacheKey(b.media_type, b.id),
        tmdb_id: Number(b.id),
        media_type: b.media_type,
        data: cacheData as any,
      }]).catch(() => {});
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

      // SERIES per-season tracking — persist if seasonDates, seasonRewatchCount,
      // or seasonRewatchDates changed. Single PATCH for all three fields.
      const newSeasonDates = args.form().seasonDates;
      const oldSeasonDates = v.seasonDates ?? {};
      const newSeasonRewatchCount = Number(args.form().seasonRewatchCount) || 0;
      const oldSeasonRewatchCount = v.seasonRewatchCount ?? 0;
      const newSeasonRewatchDates = args.form().seasonRewatchDates;
      const oldSeasonRewatchDates = v.seasonRewatchDates ?? [];
      const seasonDatesChanged = JSON.stringify(newSeasonDates) !== JSON.stringify(oldSeasonDates);
      const seasonRewatchCountChanged = newSeasonRewatchCount !== oldSeasonRewatchCount;
      const seasonRewatchDatesChanged =
        newSeasonRewatchDates.length !== oldSeasonRewatchDates.length ||
        newSeasonRewatchDates.some((m, i) =>
          JSON.stringify(m) !== JSON.stringify(oldSeasonRewatchDates[i] ?? {})
        );
      if (seasonDatesChanged || seasonRewatchCountChanged || seasonRewatchDatesChanged) {
        updates.push(
          updateSeasonDatesInSupabase(
            uid, v.id, v.media_type,
            newSeasonDates,
            newSeasonRewatchCount,
            newSeasonRewatchDates,
          ),
        );
      }

      // Use allSettled so ALL updates run even if one fails.
      // A single field failure (e.g. rewatch_dates column missing) should
      // not prevent the other fields (status, rating, notes) from saving.
      const results = await Promise.allSettled(updates);
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0 && failed.length === updates.length) {
        // All failed — surface an error
        throw new Error("All updates failed");
      }
      if (failed.length > 0) {
        // Partial failure — saved what we could
        showToast("Partially saved — some fields may not have updated.", "info");
      } else {
        showToast("Saved successfully!", "success");
      }
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
        seasonDates: { ...newSeasonDates },
        seasonRewatchCount: newSeasonRewatchCount,
        seasonRewatchDates: newSeasonRewatchDates.map((m) => ({ ...m })),
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
