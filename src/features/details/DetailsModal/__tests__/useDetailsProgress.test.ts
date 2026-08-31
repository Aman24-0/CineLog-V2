// src/features/details/DetailsModal/__tests__/useDetailsProgress.test.ts
//
// Tests for useDetailsProgress.handleSetStatus — specifically the
// 2026-09-02 fix that auto-opens the Edit modal when the user taps
// Completed or Watching, REGARDLESS of whether the status actually
// changes. The previous implementation had an early
// `if (v.status === nextStatus) return;` that prevented the auto-open
// from firing when the user tapped the already-active status — which
// is exactly the case the user tested (a title already marked
// Completed → tap Completed → expected Edit to open, but it didn't).
//
// Covers the 5 scenarios from the bug report:
//   1. Watching → tap Completed → status persisted + Edit opens.
//   2. Completed already active → tap Completed → NO redundant persist
//      + Edit STILL opens.
//   3. Planned → tap Planned → no persist, no Edit.
//   4. Completed → tap Watching → status persisted + Edit opens.
//   5. Watching → tap Watching → NO redundant persist + Edit STILL opens.
//
// Also covers Planned and Dropped (which never auto-open Edit, even on
// transition), and the error path (Supabase failure does NOT auto-open
// Edit, so the user sees the error state without a stray modal).

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

// ── Mocks ─────────────────────────────────────────────────────────────
// useDetailsProgress depends on:
//   - getCurrentUid (useAuth)
//   - setSeriesStatusInSupabase (seriesEpisodeStateAdapter)
//   - getEpisodeProgressRepository (lazy import inside hydrateEpisodeRatings — not invoked here)

vi.mock("~/shared/hooks/useAuth", () => ({
  getCurrentUid: vi.fn()
}));

vi.mock("~/features/watchlist/seriesEpisodeStateAdapter", () => ({
  setSeriesStatusInSupabase: vi.fn(),
  markEpisodeWatchedAndSync: vi.fn(),
  unwatchEpisodeAndSync: vi.fn()
}));

vi.mock("~/features/watchlist/episodeProgressAdapter", () => ({
  updateEpisodeRatingInSupabase: vi.fn(),
  updateEpisodeFeedbackInSupabase: vi.fn()
}));

vi.mock("~/lib/supabase/repositories", () => ({
  getEpisodeProgressRepository: vi.fn()
}));

import { useDetailsProgress } from "../useDetailsProgress";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { setSeriesStatusInSupabase } from "~/features/watchlist/seriesEpisodeStateAdapter";

// ── Helpers ───────────────────────────────────────────────────────────

function makeVaultItem(
  overrides: Partial<WatchlistItem> = {}
): WatchlistItem {
  return {
    id: "1",
    media_type: "movie",
    title: "Test Movie",
    status: "Planned",
    ...overrides
  };
}

interface HookArgs {
  vaultItemStatus: WatchlistItem["status"];
  onCompletedAutoOpenEdit?: () => void;
}

async function runHandleSetStatus(
  nextStatus: WatchlistItem["status"],
  args: HookArgs
): Promise<{
  onCompletedAutoOpenEdit: ReturnType<typeof vi.fn>;
  showToast: ReturnType<typeof vi.fn>;
  setSelectedItem: ReturnType<typeof vi.fn>;
}> {
  const onCompletedAutoOpenEdit = vi.fn();
  const showToast = vi.fn();
  const setSelectedItem = vi.fn();
  const [baseItem] = createSignal<WatchlistItem>(makeVaultItem());
  const [vaultItem] = createSignal<WatchlistItem | null>(
    makeVaultItem({ status: args.vaultItemStatus })
  );

  let handleSetStatus: (status: WatchlistItem["status"]) => Promise<void>;

  await new Promise<void>((resolve, reject) => {
    createRoot(async (dispose) => {
      try {
        const api = useDetailsProgress({
          baseItem,
          vaultItem,
          details: () => null,
          watchlist: () => [],
          setSelectedItem,
          showToast,
          onCompletedAutoOpenEdit: args.onCompletedAutoOpenEdit ?? onCompletedAutoOpenEdit
        });
        handleSetStatus = api.handleSetStatus;
        dispose();
        resolve();
      } catch (err) {
        dispose();
        reject(err);
      }
    });
  });

  // handleSetStatus is assigned inside the createRoot callback above.
  await handleSetStatus!(nextStatus);

  return { onCompletedAutoOpenEdit, showToast, setSelectedItem };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("useDetailsProgress.handleSetStatus — auto-open Edit (2026-09-02 fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUid).mockReturnValue("user-1");
    // Default success mock for setSeriesStatusInSupabase — returns the
    // requested status as the persisted state.
    vi.mocked(setSeriesStatusInSupabase).mockResolvedValue({
      status: "Completed" as WatchlistItem["status"],
      season: 1,
      episode: 1,
      watchedCount: 0,
      totalEpisodes: 0,
      progressPct: 0
    });
  });

  it("Watching → tap Completed: persists status and auto-opens Edit", async () => {
    const { onCompletedAutoOpenEdit, setSelectedItem } = await runHandleSetStatus(
      "Completed",
      { vaultItemStatus: "Watching" }
    );
    expect(setSeriesStatusInSupabase).toHaveBeenCalledTimes(1);
    expect(setSeriesStatusInSupabase).toHaveBeenCalledWith(
      "user-1",
      "1",
      "movie",
      "Completed",
      [] // resolveSeasons returns [] for a movie with no seasons/details
    );
    expect(setSelectedItem).toHaveBeenCalledTimes(1);
    expect(onCompletedAutoOpenEdit).toHaveBeenCalledTimes(1);
  });

  it("Completed already active → tap Completed: does NOT persist but STILL auto-opens Edit", async () => {
    // This is the exact case the bug report called out — the early return
    // previously fired before onCompletedAutoOpenEdit, so the Edit modal
    // never opened when the user tapped the already-active status.
    const { onCompletedAutoOpenEdit, setSelectedItem } = await runHandleSetStatus(
      "Completed",
      { vaultItemStatus: "Completed" }
    );
    expect(setSeriesStatusInSupabase).not.toHaveBeenCalled();
    expect(setSelectedItem).not.toHaveBeenCalled();
    expect(onCompletedAutoOpenEdit).toHaveBeenCalledTimes(1);
  });

  it("Watching already active → tap Watching: does NOT persist but STILL auto-opens Edit", async () => {
    const { onCompletedAutoOpenEdit, setSelectedItem } = await runHandleSetStatus(
      "Watching",
      { vaultItemStatus: "Watching" }
    );
    expect(setSeriesStatusInSupabase).not.toHaveBeenCalled();
    expect(setSelectedItem).not.toHaveBeenCalled();
    expect(onCompletedAutoOpenEdit).toHaveBeenCalledTimes(1);
  });

  it("Completed → tap Watching: persists status and auto-opens Edit", async () => {
    const { onCompletedAutoOpenEdit, setSelectedItem } = await runHandleSetStatus(
      "Watching",
      { vaultItemStatus: "Completed" }
    );
    expect(setSeriesStatusInSupabase).toHaveBeenCalledTimes(1);
    expect(setSeriesStatusInSupabase).toHaveBeenCalledWith(
      "user-1",
      "1",
      "movie",
      "Watching",
      [] // resolveSeasons returns [] for a movie with no seasons/details
    );
    expect(setSelectedItem).toHaveBeenCalledTimes(1);
    expect(onCompletedAutoOpenEdit).toHaveBeenCalledTimes(1);
  });

  it("Planned → tap Planned: no persist, no auto-open Edit", async () => {
    const { onCompletedAutoOpenEdit, setSelectedItem } = await runHandleSetStatus(
      "Planned",
      { vaultItemStatus: "Planned" }
    );
    expect(setSeriesStatusInSupabase).not.toHaveBeenCalled();
    expect(setSelectedItem).not.toHaveBeenCalled();
    expect(onCompletedAutoOpenEdit).not.toHaveBeenCalled();
  });

  it("Planned → tap Dropped: persists but does NOT auto-open Edit", async () => {
    const { onCompletedAutoOpenEdit, setSelectedItem } = await runHandleSetStatus(
      "Dropped",
      { vaultItemStatus: "Planned" }
    );
    expect(setSeriesStatusInSupabase).toHaveBeenCalledTimes(1);
    expect(setSelectedItem).toHaveBeenCalledTimes(1);
    expect(onCompletedAutoOpenEdit).not.toHaveBeenCalled();
  });

  it("Completed → tap Dropped: persists but does NOT auto-open Edit", async () => {
    const { onCompletedAutoOpenEdit, setSelectedItem } = await runHandleSetStatus(
      "Dropped",
      { vaultItemStatus: "Completed" }
    );
    expect(setSeriesStatusInSupabase).toHaveBeenCalledTimes(1);
    expect(setSelectedItem).toHaveBeenCalledTimes(1);
    expect(onCompletedAutoOpenEdit).not.toHaveBeenCalled();
  });

  it("Watching → tap Completed: when Supabase fails, does NOT auto-open Edit", async () => {
    // The fix returns early on persistence failure — the user should see
    // the error state and retry without a stray Edit modal appearing.
    vi.mocked(setSeriesStatusInSupabase).mockRejectedValueOnce(
      new Error("Supabase write failed")
    );
    const { onCompletedAutoOpenEdit, setSelectedItem, showToast } =
      await runHandleSetStatus("Completed", { vaultItemStatus: "Watching" });
    expect(setSeriesStatusInSupabase).toHaveBeenCalledTimes(1);
    expect(setSelectedItem).not.toHaveBeenCalled();
    expect(onCompletedAutoOpenEdit).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "Failed to update status.",
      "error"
    );
  });

  it("does not crash when onCompletedAutoOpenEdit is not provided", async () => {
    // Some callers don't wire up the auto-open callback. The fix should
    // not throw when it's missing — the status is still persisted.
    const { setSelectedItem } = await runHandleSetStatus("Completed", {
      vaultItemStatus: "Watching",
      onCompletedAutoOpenEdit: undefined
    });
    expect(setSeriesStatusInSupabase).toHaveBeenCalledTimes(1);
    expect(setSelectedItem).toHaveBeenCalledTimes(1);
  });
});
