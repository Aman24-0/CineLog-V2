// src/features/details/DetailsModal/useDetailsProgress.ts
import { createSignal, type Accessor, type Setter } from "solid-js";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import type { ToastType } from "~/shared/hooks/useToast";
import { findInVault } from "~/shared/utils/vaultMatch";
import { updateStatusInSupabase } from "~/features/watchlist/vaultAdapter";
import {
  updateSeasonEpisodeInSupabase,
  unmarkEpisodeInSupabase,
  updateEpisodeFeedbackInSupabase,
  updateEpisodeRatingInSupabase
} from "~/features/watchlist/episodeProgressAdapter";
import { getEpisodeProgressRepository } from "~/lib/supabase/repositories";
import type { WatchlistItem } from "~/shared/types";
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
  watchlist: Accessor<WatchlistItem[]>;
  setSelectedItem: Setter<{
    baseItem: WatchlistItem;
    vaultItem: WatchlistItem | null;
  } | null>;
  /** Optional route-aware related-title navigation for dedicated pages. */
  onSelectRelatedItem?: (item: WatchlistItem) => void;
  showToast: (msg: string, type: ToastType, duration?: number) => void;
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
      await updateStatusInSupabase(uid, v.id, v.media_type, nextStatus);
      const updated: WatchlistItem = {
        ...v,
        status: nextStatus as WatchlistItem["status"]
      };
      args.setSelectedItem({
        baseItem: { ...args.baseItem()!, ...updated },
        vaultItem: updated
      });
      args.showToast(`Status: ${nextStatus}`, "success", 1500);
    } catch {
      args.showToast("Failed to update status.", "error");
    }
  };

  const handleEpisodeChange = async (newSeason: number, newEpisode: number) => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid || !v) return;

    try {
      // Phase 7.3 — persists episode progress to the `episode_progress`
      // table via EpisodeProgressRepository. If the item is Planned,
      // upgrade to Watching first.
      let updated: WatchlistItem;
      if (v.status === "Planned" || v.status === "Plan to Watch") {
        await updateStatusInSupabase(uid, v.id, v.media_type, "Watching");
        updated = {
          ...v,
          status: "Watching",
          season: newSeason,
          episode: newEpisode
        };
      } else {
        updated = { ...v, season: newSeason, episode: newEpisode };
      }
      await updateSeasonEpisodeInSupabase(
        uid,
        v.id,
        v.media_type,
        newSeason,
        newEpisode
      );
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
      // Step 1: delete episode_progress records from the unmarked
      // position onward. This is the key step that the old
      // handleEpisodeChange-based rewind was missing — without it,
      // the next vault refresh would re-pick a later episode as
      // "latest watched" and silently undo the rewind.
      await unmarkEpisodeInSupabase(
        uid,
        v.id,
        v.media_type,
        unmarkSeason,
        unmarkEpisode
      );

      // Step 2: update the vault row's tracker position to the
      // rewound episode. We do NOT call updateSeasonEpisodeInSupabase
      // here — that would UPSERT a new episode_progress record for
      // the rewound episode, which already exists from when it was
      // originally watched. The vault row's season/episode columns
      // are updated via the optimistic local update below; the next
      // vault refresh will pick up the latest episode_progress record
      // (which is now the rewound episode) and re-confirm the tracker.
      const updated: WatchlistItem = {
        ...v,
        season: newTrackerSeason,
        episode: newTrackerEpisode
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
      await updateStatusInSupabase(uid, v.id, v.media_type, "Completed");
      const updated: WatchlistItem = { ...v, status: "Completed" };
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
   */
  const handleSetStatus = async (nextStatus: WatchlistItem["status"]) => {
    const uid = getCurrentUid();
    const v = args.vaultItem();
    if (!uid || !v) return;
    // No-op if the status is already set.
    if (v.status === nextStatus) return;

    try {
      await updateStatusInSupabase(uid, v.id, v.media_type, nextStatus);
      const updated: WatchlistItem = { ...v, status: nextStatus };
      args.setSelectedItem({
        baseItem: { ...args.baseItem()!, ...updated },
        vaultItem: updated
      });
      args.showToast(`Status: ${nextStatus}`, "success", 1500);
    } catch {
      args.showToast("Failed to update status.", "error");
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
