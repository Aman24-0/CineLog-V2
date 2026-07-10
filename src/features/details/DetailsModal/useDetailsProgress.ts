// src/features/details/DetailsModal/useDetailsProgress.ts
import type { Accessor, Setter } from "solid-js";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import type { ToastType } from "~/shared/hooks/useToast";
import { findInVault } from "~/shared/utils/vaultMatch";
import { updateStatusInSupabase } from "~/features/watchlist/vaultAdapter";
import { updateSeasonEpisodeInSupabase } from "~/features/watchlist/episodeProgressAdapter";
import type { WatchlistItem } from "~/shared/types";

/**
 * useDetailsProgress — progress-related action handlers for the Details modal.
 *
 * Extracted from useDetailsActions to keep each hook file focused and under
 * the 250-line limit. Handles:
 *   - handleStatusCycle: Planned → Watching → Completed → Planned
 *   - handleMarkCompleted: jumps straight to Completed
 *   - handleEpisodeChange: persists season/episode progress to the
 *     `episode_progress` table (auto-upgrades Planned → Watching first)
 *   - handleSelectItem: navigates to a related title (respects ownership
 *     boundary via findInVault)
 */
export interface UseDetailsProgressArgs {
  baseItem: Accessor<WatchlistItem | null>;
  vaultItem: Accessor<WatchlistItem | null>;
  watchlist: Accessor<WatchlistItem[]>;
  setSelectedItem: Setter<{ baseItem: WatchlistItem; vaultItem: WatchlistItem | null } | null>;
  showToast: (msg: string, type: ToastType, duration?: number) => void;
}

export interface UseDetailsProgressResult {
  handleStatusCycle: () => Promise<void>;
  handleEpisodeChange: (season: number, episode: number) => Promise<void>;
  handleMarkCompleted: () => Promise<void>;
  handleSelectItem: (item: WatchlistItem) => void;
}

export function useDetailsProgress(args: UseDetailsProgressArgs): UseDetailsProgressResult {
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
        status: nextStatus as WatchlistItem["status"],
      };
      args.setSelectedItem({
        baseItem: { ...args.baseItem()!, ...updated },
        vaultItem: updated,
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
          episode: newEpisode,
        };
      } else {
        updated = { ...v, season: newSeason, episode: newEpisode };
      }
      await updateSeasonEpisodeInSupabase(uid, v.id, v.media_type, newSeason, newEpisode);
      args.setSelectedItem({
        baseItem: { ...args.baseItem()!, ...updated },
        vaultItem: updated,
      });
    } catch (err) {
      console.error("Failed to update episode:", err);
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
        vaultItem: updated,
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
    args.setSelectedItem({ baseItem: existing ?? item, vaultItem: existing });
    const container = document.querySelector(".cinematic-scroll");
    if (container) container.scrollTo({ top: 0, behavior: "smooth" });
  };

  return {
    handleStatusCycle,
    handleEpisodeChange,
    handleMarkCompleted,
    handleSelectItem,
  };
}
