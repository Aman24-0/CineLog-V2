// src/features/details/DetailsModal/useDetailsProgress.ts
import { createSignal, type Accessor, type Setter } from "solid-js";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import type { ToastType } from "~/shared/hooks/useToast";
import { findInVault } from "~/shared/utils/vaultMatch";
import {
  updateEpisodeFeedbackInSupabase,
  updateEpisodeRatingInSupabase
} from "~/features/watchlist/episodeProgressAdapter";
import {
  markEpisodeWatchedAndSync,
  setSeriesStatusInSupabase,
  unwatchEpisodeAndSync
} from "~/features/watchlist/seriesEpisodeStateAdapter";
import { getEpisodeProgressRepository } from "~/lib/supabase/repositories";
import type { TMDBDetails, WatchlistItem } from "~/shared/types";
import { resolveSeasons } from "~/shared/utils/progress";
import type {
  EpisodeFeedback,
  EpisodeReaction
} from "~/lib/supabase/repositories";

/**
 * useDetailsProgress — progress-related action handlers for the Details modal.
 *
 * Extracted from useDetailsActions to keep each hook file focused and under
 * the 250-line limit. Handles:
 *   - handleStatusCycle: Planned → Watching → Completed → Planned
 *   - handleMarkCompleted: jumps straight to Completed
 *   - handleEpisodeChange: persists season/episode progress to the
 *     `episode_progress` table (auto-upgrades Planned → Watching first)
 *   - handleEpisodeUnmark (v2.6): the unmark direction of the
 *     bidirectional episode toggle — deletes episode_progress records
 *     from the clicked episode onward AND rewinds the tracker to the
 *     previous episode. The delete-forward is required so the next
 *     vault refresh doesn't re-pick a later episode as "latest watched"
 *     and silently undo the rewind.
 *   - handleSelectItem: navigates to a related title (respects ownership
 *     boundary via findInVault)
 */
export interface UseDetailsProgressArgs {
  baseItem: Accessor<WatchlistItem | null>;
  vaultItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  watchlist: Accessor<WatchlistItem[]>;
  setSelectedItem: Setter<{
    baseItem: WatchlistItem;
    vaultItem: WatchlistItem | null;
  } | null>;
  /** Optional route-aware related-title navigation for dedicated pages. */
  onSelectRelatedItem?: (item: WatchlistItem) => void;
  showToast: (msg: string, type: ToastType, duration?: number) => void;
  /**
   * Part 5 — Called when the user sets status to "Completed". The
   * Activity/Edit modal opens automatically so the user can
   * immediately fill in their viewing metadata (rating, reaction,
   * watch date, etc.). The status is ALREADY SAVED before this is
   * called — closing the edit modal without saving does NOT revert
   * the Completed status.
   *
   * 2026-09-03 fix — the callback receives a `statusChanged` boolean:
   *   - `true` when the status actually transitioned (e.g. Watching →
   *     Completed). In this case the `useDetailsForm` createEffect will
   *     re-fire (because `vaultItem()` changed via `setSelectedItem`),
   *     calling `resetTo(v)` → `setIsEditing(false)`. The callback
   *     MUST defer `setIsEditing(true)` to AFTER that effect fires
   *     (e.g. via `queueMicrotask`), otherwise the effect's
   *     `setIsEditing(false)` will override it.
   *   - `false` when the user tapped the already-active status (e.g.
   *     Completed → tap Completed). In this case `vaultItem()` does NOT
   *     change, the effect does NOT re-fire, and the callback can call
   *     `setIsEditing(true)` SYNCHRONOUSLY. This eliminates any
   *     microtask-timing uncertainty and is the exact fix for the
   *     "Completed on already-Completed doesn't open Edit" bug.
   */
  onCompletedAutoOpenEdit?: (statusChanged: boolean) => void;
}

export interface UseDetailsProgressResult {
  handleStatusCycle: () => Promise<void>;
  /** Set status directly to a specific value (Planned / Watching / Completed / Dropped). */
  handleSetStatus: (status: WatchlistItem["status"]) => Promise<void>;
  handleEpisodeChange: (season: number, episode: number) => Promise<void>;
  /**
   * Unmark an episode — the unwatch direction of the bidirectional
   * episode toggle. v2.6.
   *
   * @param unmarkSeason  Season of the episode being unmarked.
   * @param unmarkEpisode Episode number being unmarked.
   * @param newTrackerSeason  The season to rewind the tracker to.
   * @param newTrackerEpisode The episode to rewind the tracker to.
   *
   * The caller (SeasonNavigator) computes the rewind position based on
   * the series structure (e.g. unwatching S2E1 rewinds to S1's last
   * episode). This function persists the rewind: it deletes the
   * episode_progress records from (unmarkSeason, unmarkEpisode) onward
   * AND updates the vault row's season/episode to the new tracker
   * position.
   */
  handleEpisodeUnmark: (
    unmarkSeason: number,
    unmarkEpisode: number,
    newTrackerSeason: number,
    newTrackerEpisode: number
  ) => Promise<void>;
  /**
   * Phase 6 Task 2 — Persist a per-episode rating to the
   * `episode_progress.rating` column.
   *
   * @param season   Season number of the rated episode.
   * @param episode  Episode number of the rated episode.
   * @param rating   New rating (1-N) or null to clear.
   *
   * The underlying `updateEpisodeRatingInSupabase` adapter now UPSERTs
   * (was a plain UPDATE before the rating-persistence bugfix): if the
   * episode_progress row doesn't exist — which happens when the tracker
   * jumped past the episode without creating intermediate rows — it is
   * created with the rating + watched-episode defaults. So callers no
   * longer need to ensure the row exists first via `handleEpisodeChange`.
   *
   * The hook also maintains a local `episodeRatings` accessor that the
   * DetailsModal passes to SeasonNavigator so the stars reflect the
   * persisted values. It's updated optimistically here so the star the
   * user just clicked highlights immediately.
   */
  handleEpisodeRating: (
    season: number,
    episode: number,
    rating: number | null
  ) => Promise<void>;
  /** Persist numeric rating and reaction as one episode feedback update. */
  handleEpisodeFeedback: (
    season: number,
    episode: number,
    rating: number | null,
    reaction: EpisodeReaction | null
  ) => Promise<void>;
  /**
   * Phase 6 Task 2 — Map of "S{season}E{episode}" → rating for the
   * currently-open vault item. Hydrated once on mount (when the modal
   * opens) so the EpisodeCards show their persisted star ratings.
   * Updated optimistically when the user rates an episode.
   */
  episodeRatings: Accessor<Map<string, number | null>>;
  /** Hydrated rating + reaction state keyed by S{season}E{episode}. */
  episodeFeedbacks: Accessor<Map<string, EpisodeFeedback>>;
  /**
   * Phase 6 Task 2 — Re-fetch all episode_progress rows for the
   * currently-open vault item and rebuild the `episodeRatings` Map.
   * The caller (DetailsModal) invokes this from a createEffect that
   * tracks the vaultItem accessor, so the Map refreshes whenever the
   * user opens the modal or navigates to a related title.
   */
  hydrateEpisodeRatings: () => Promise<void>;
  handleMarkCompleted: () => Promise<void>;
  handleSelectItem: (item: WatchlistItem) => void;
}

export function useDetailsProgress(
  args: UseDetailsProgressArgs
): UseDetailsProgressResult {
  // Status cycling: Planned → Watching → Completed → Planned (vault only)
  const handleStatusCycle = async () => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid || !v) return;

    const currentStatus = v.status || "Planned";
    const nextStatus =
      currentStatus === "Planned" || currentStatus === "Plan to Watch"
        ? "Watching"
        : currentStatus === "Watching"
          ? "Completed"
          : "Planned";

    try {
      const state = await setSeriesStatusInSupabase(
        uid,
        v.id,
        v.media_type,
        nextStatus as WatchlistItem["status"],
        resolveSeasons(v, args.details())
      );
      const updated: WatchlistItem = {
        ...v,
        status: state.status,
        season: state.season,
        episode: state.episode,
        watchProgress: {
          ...(v.watchProgress ?? { currentTime: 0, duration: 0 }),
          season: state.season,
          episode: state.episode,
          updatedAt: new Date().toISOString()
        }
      };
      args.setSelectedItem({
        baseItem: { ...args.baseItem()!, ...updated },
        vaultItem: updated
      });
      args.showToast(`Status: ${state.status}`, "success", 1500);
    } catch {
      args.showToast("Failed to update status.", "error");
    }
  };

  const handleEpisodeChange = async (newSeason: number, newEpisode: number) => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid || !v) return;

    try {
      const state = await markEpisodeWatchedAndSync(
        uid,
        v.id,
        v.media_type,
        newSeason,
        newEpisode,
        resolveSeasons(v, args.details())
      );
      const updated: WatchlistItem = {
        ...v,
        status: state.status,
        season: state.season,
        episode: state.episode,
        watchProgress: {
          ...(v.watchProgress ?? { currentTime: 0, duration: 0 }),
          season: state.season,
          episode: state.episode,
          updatedAt: new Date().toISOString()
        }
      };
      args.setSelectedItem({
        baseItem: { ...args.baseItem()!, ...updated },
        vaultItem: updated
      });
    } catch (err) {
      console.error("Failed to update episode:", err);
      args.showToast("Failed to update progress.", "error");
    }
  };

  /**
   * Unmark an episode — the unwatch direction of the bidirectional
   * episode toggle (v2.6).
   *
   * Two persistence steps, in order:
   *   1. Delete `episode_progress` records from (unmarkSeason,
   *      unmarkEpisode) onward. The delete-forward is critical:
   *      `getLatestEpisodeProgress` picks the most recent record by
   *      watched_at desc, so leaving any later record would silently
   *      undo the rewind on the next vault refresh.
   *   2. Update the vault row's season/episode to the new tracker
   *      position. The previous episode's `episode_progress` record
   *      (already present from when it was watched) becomes the new
   *      "latest watched" — no new upsert needed for it.
   *
   * The status is NOT changed — the user is still "Watching" (or
   * whatever status they had). If they unwatch all the way back to
   * before S1E1 (no-op in the UI), the caller handles the edge case.
   *
   * Optimistic local update: we update the vaultItem signal
   * immediately after the Supabase calls succeed so the UI reflects
   * the rewind without waiting for the next vault refresh.
   */
  const handleEpisodeUnmark = async (
    unmarkSeason: number,
    unmarkEpisode: number,
    newTrackerSeason: number,
    newTrackerEpisode: number
  ) => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid || !v) return;

    try {
      const state = await unwatchEpisodeAndSync(
        uid,
        v.id,
        v.media_type,
        unmarkSeason,
        unmarkEpisode,
        { season: newTrackerSeason, episode: newTrackerEpisode },
        resolveSeasons(v, args.details())
      );
      const updated: WatchlistItem = {
        ...v,
        status: state.status,
        season: state.season,
        episode: state.episode,
        watchProgress: {
          ...(v.watchProgress ?? { currentTime: 0, duration: 0 }),
          season: state.season,
          episode: state.episode,
          updatedAt: new Date().toISOString()
        }
      };
      args.setSelectedItem({
        baseItem: { ...args.baseItem()!, ...updated },
        vaultItem: updated
      });
    } catch (err) {
      console.error("Failed to unmark episode:", err);
      args.showToast("Failed to update progress.", "error");
    }
  };

  const handleMarkCompleted = async () => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid || !v) return;

    try {
      const state = await setSeriesStatusInSupabase(
        uid,
        v.id,
        v.media_type,
        "Completed",
        resolveSeasons(v, args.details())
      );
      const updated: WatchlistItem = {
        ...v,
        status: state.status,
        season: state.season,
        episode: state.episode,
        watchProgress: {
          ...(v.watchProgress ?? { currentTime: 0, duration: 0 }),
          season: state.season,
          episode: state.episode,
          updatedAt: new Date().toISOString()
        }
      };
      args.setSelectedItem({
        baseItem: { ...args.baseItem()!, ...updated },
        vaultItem: updated
      });
      args.showToast("Marked as Completed!", "success");
    } catch {
      args.showToast("Failed to update status.", "error");
    }
  };

  const handleSelectItem = (item: WatchlistItem) => {
    // When navigating to a related title, use findInVault to respect the
    // ownership boundary AND avoid TMDB ID namespace collisions (movie/1398
    // vs tv/1398 are different titles).
    const existing = findInVault(args.watchlist(), item);
    const resolved = existing ?? item;
    if (args.onSelectRelatedItem) {
      args.onSelectRelatedItem(resolved);
      return;
    }
    args.setSelectedItem({ baseItem: resolved, vaultItem: existing });
    const container = document.querySelector(".cinematic-scroll");
    if (container) container.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * Set the vault item's status directly to a specific value.
   * Used by the new action dock's 4 status buttons (Planned / Watching /
   * Completed / Dropped). Skips the cycle and writes the requested status
   * in one shot, then updates the modal state so the button immediately
   * reflects the active state.
   *
   * AUTO-OPEN EDIT BEHAVIOUR (2026-09-02 fix):
   *   - Tapping Completed when current status is NOT Completed:
   *       persist status → update local item → auto-open Edit.
   *   - Tapping Completed when current status IS already Completed:
   *       do NOT persist (no-op) → STILL auto-open Edit.
   *   - Tapping Watching when current status is NOT Watching:
   *       persist → update → auto-open Edit.
   *   - Tapping Watching when current status IS already Watching:
   *       do NOT persist → STILL auto-open Edit.
   *   - Tapping Planned or Dropped: NEVER auto-open Edit (regardless of
   *       whether the status changes).
   *
   * The previous implementation had an early `if (v.status === nextStatus)
   * return;` that prevented the auto-open from firing when the user tapped
   * the same status again — which is exactly the case the user tested
   * (a title already marked Completed → tap Completed → expected Edit
   * to open, but it didn't). The early return is now removed; the
   * auto-open fires unconditionally for Completed/Watching.
   *
   * The Supabase write is only performed when the status is actually
   * changing — re-writing the same value would be a wasted round-trip
   * (and could trigger `updated_at` churn for no reason). The local
   * selectedItem is similarly only updated when the status changes.
   *
   * "Planned" and "Dropped" do NOT auto-open Edit — there is no viewing
   * metadata to record for those statuses.
   */
  const handleSetStatus = async (nextStatus: WatchlistItem["status"]) => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid || !v) return;

    const statusChanged = v.status !== nextStatus;

    // Only persist + update the local item when the status is actually
    // changing. A no-op status tap (e.g. tapping Completed on an already
    // Completed title) skips the Supabase write but STILL falls through
    // to the auto-open Edit logic below.
    if (statusChanged) {
      try {
        const state = await setSeriesStatusInSupabase(
          uid,
          v.id,
          v.media_type,
          nextStatus,
          resolveSeasons(v, args.details())
        );
        const updated: WatchlistItem = {
          ...v,
          status: state.status,
          season: state.season,
          episode: state.episode,
          watchProgress: {
            ...(v.watchProgress ?? { currentTime: 0, duration: 0 }),
            season: state.season,
            episode: state.episode,
            updatedAt: new Date().toISOString()
          }
        };
        args.setSelectedItem({
          baseItem: { ...args.baseItem()!, ...updated },
          vaultItem: updated
        });
        args.showToast(`Status: ${state.status}`, "success", 1500);
      } catch {
        args.showToast("Failed to update status.", "error");
        // If the persistence failed, do NOT auto-open Edit — the user
        // should see the error state and retry. Returning here also
        // avoids surprising the user with an Edit modal for a status
        // that wasn't actually saved.
        return;
      }
    }

    // Auto-open the Activity/Edit modal when the user sets status
    // to "Completed" OR "Watching". Both are milestones where the
    // user is likely to want to record viewing metadata (rating,
    // reaction, watch date, etc.). When the status actually changed,
    // it has ALREADY been saved above — closing the edit modal without
    // saving does NOT revert the status. When the status did NOT
    // change (the user tapped the already-active status), no
    // persistence was needed — the Edit modal still opens so the user
    // can review / edit their existing viewing metadata.
    //
    // "Planned" and "Dropped" do NOT auto-open (no viewing metadata
    // to record for those statuses).
    if (
      (nextStatus === "Completed" || nextStatus === "Watching") &&
      args.onCompletedAutoOpenEdit
    ) {
      args.onCompletedAutoOpenEdit(statusChanged);
    }
  };

  // ── Phase 6 Task 2: per-episode ratings ───────────────────────────
  //
  // We maintain a local Map of "S{season}E{episode}" → rating for the
  // currently-open vault item. The Map is hydrated once on mount (when
  // the modal opens) by fetching all episode_progress rows for the
  // vault item. It's updated optimistically when the user rates an
  // episode so the stars highlight immediately.
  const [episodeRatings, setEpisodeRatings] = createSignal<
    Map<string, number | null>
  >(new Map());
  const [episodeFeedbacks, setEpisodeFeedbacks] = createSignal<
    Map<string, EpisodeFeedback>
  >(new Map());

  // Hydrate episodeRatings when the vault item changes (i.e. when the
  // modal opens or the user navigates to a related title). We use a
  // createEffect-like pattern via the vaultItem accessor — but since
  // this hook doesn't import createEffect (to avoid the overhead for
  // callers that don't use ratings), we expose a `hydrateRatings`
  // function the caller can invoke from a createEffect. The
  // DetailsModal wires this up.
  //
  // Implementation detail: we intentionally fetch ALL episode_progress
  // rows for the vault item (not just the latest) because ratings are
  // per-episode, not just the latest. This is a single query per modal
  // open, so the cost is minimal.
  const hydrateEpisodeRatings = async (): Promise<void> => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid || !v) {
      setEpisodeRatings(new Map());
      setEpisodeFeedbacks(new Map());
      return;
    }
    try {
      // Resolve the vault UUID from the TMDB identity, then fetch all
      // episode_progress rows. We use the repository directly (rather
      // than the adapter) because the adapter only exposes the latest
      // progress, not the full per-episode list.
      const { getVaultRepository } =
        await import("~/lib/supabase/repositories");
      const vaultRepo = getVaultRepository();
      const { data: vaultRow, error: vaultErr } =
        await vaultRepo.getVaultByTmdbId(uid, Number(v.id), v.media_type);
      if (vaultErr || !vaultRow) {
        setEpisodeRatings(new Map());
        setEpisodeFeedbacks(new Map());
        return;
      }
      const epRepo = getEpisodeProgressRepository();
      const { data: epRows, error: epErr } =
        await epRepo.getEpisodeProgressForVaultItem(vaultRow.id);
      if (epErr || !epRows) {
        setEpisodeRatings(new Map());
        setEpisodeFeedbacks(new Map());
        return;
      }
      const map = new Map<string, number | null>();
      const feedbackMap = new Map<string, EpisodeFeedback>();
      for (const row of epRows) {
        const key = `S${row.season_number}E${row.episode_number}`;
        const rating = row.rating ?? null;
        const reaction =
          row.reaction === "love" ||
          row.reaction === "funny" ||
          row.reaction === "wow" ||
          row.reaction === "sad" ||
          row.reaction === "angry" ||
          row.reaction === "disappointed"
            ? row.reaction
            : null;
        map.set(key, rating);
        feedbackMap.set(key, { rating, reaction });
      }
      setEpisodeRatings(map);
      setEpisodeFeedbacks(feedbackMap);
    } catch (err) {
      console.error("[useDetailsProgress] hydrateEpisodeRatings failed:", err);
      // Leave the existing map in place — a failed refresh shouldn't
      // wipe the visible ratings.
    }
  };

  const handleEpisodeRating = async (
    season: number,
    episode: number,
    rating: number | null
  ): Promise<void> => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid || !v) return;

    // Optimistic update — update the local Map immediately so the star
    // the user just clicked highlights before the server round-trip.
    const key = `S${season}E${episode}`;
    setEpisodeRatings((prev) => {
      const next = new Map(prev);
      next.set(key, rating);
      return next;
    });
    setEpisodeFeedbacks((prev) => {
      const next = new Map(prev);
      next.set(key, {
        rating,
        reaction: prev.get(key)?.reaction ?? null
      });
      return next;
    });

    try {
      const ok = await updateEpisodeRatingInSupabase(
        uid,
        v.id,
        v.media_type,
        season,
        episode,
        rating
      );
      if (!ok) {
        // Rollback: re-hydrate from the server. The previous rollback
        // was broken — it didn't have the prior value, so it left the
        // optimistic state in place. Re-hydrating is the correct fix:
        // it replaces the local Map with the canonical server state,
        // which discards the failed optimistic write and restores the
        // real persisted rating (if any).
        void hydrateEpisodeRatings();
        args.showToast("Failed to save rating.", "error");
      }
    } catch (err) {
      console.error("[useDetailsProgress] handleEpisodeRating failed:", err);
      args.showToast("Failed to save rating.", "error");
      void hydrateEpisodeRatings();
    }
  };

  const handleEpisodeFeedback = async (
    season: number,
    episode: number,
    rating: number | null,
    reaction: EpisodeReaction | null
  ): Promise<void> => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid || !v) return;

    const key = `S${season}E${episode}`;
    setEpisodeRatings((prev) => {
      const next = new Map(prev);
      next.set(key, rating);
      return next;
    });
    setEpisodeFeedbacks((prev) => {
      const next = new Map(prev);
      next.set(key, { rating, reaction });
      return next;
    });

    try {
      const ok = await updateEpisodeFeedbackInSupabase(
        uid,
        v.id,
        v.media_type,
        season,
        episode,
        rating,
        reaction
      );
      if (!ok) {
        void hydrateEpisodeRatings();
        args.showToast("Failed to save episode feedback.", "error");
      }
    } catch (err) {
      console.error("[useDetailsProgress] handleEpisodeFeedback failed:", err);
      args.showToast("Failed to save episode feedback.", "error");
      void hydrateEpisodeRatings();
    }
  };

  return {
    handleStatusCycle,
    handleSetStatus,
    handleEpisodeChange,
    handleEpisodeUnmark,
    handleEpisodeRating,
    handleEpisodeFeedback,
    episodeRatings,
    episodeFeedbacks,
    hydrateEpisodeRatings,
    handleMarkCompleted,
    handleSelectItem
  };
}
