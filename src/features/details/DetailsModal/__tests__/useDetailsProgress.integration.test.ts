// src/features/details/DetailsModal/__tests__/useDetailsProgress.integration.test.ts
//
// INTEGRATION test for the Completed auto-open flow.
//
// The previous unit test (useDetailsProgress.test.ts) verifies that the
// hook calls `onCompletedAutoOpenEdit` in the unchanged-status case.
// But the real bug report is that the Edit modal doesn't open in the
// actual app, even though the hook calls the callback. This test
// exercises the FULL reactive chain used by the real app:
//
//   handleSetStatus("Completed")
//   → onCompletedAutoOpenEdit()
//   → queueMicrotask(() => setIsEditing(true))
//   → useDetailsForm createEffect (tracks vaultItem)
//   → isEditing signal flips to true
//   → the <Show> condition `!isEditing() || !inVault()` flips to false
//   → DetailsEditForm renders
//
// The key question this test answers: does the queueMicrotask deferral
// actually work when the status doesn't change? When status is
// unchanged, vaultItem() doesn't change, so the useDetailsForm
// createEffect does NOT re-fire, so resetTo(v) is NOT called, so
// setIsEditing(false) is NOT called. The queueMicrotask should fire
// and setIsEditing(true) should stick.
//
// If this test FAILS, the bug is at the Solid reactive layer (e.g.
// the createEffect re-fires for some other reason, or the queueMicrotask
// is cancelled, or there's a race with another signal update).

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRoot, createSignal, createMemo } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

// ── Mocks (same as useDetailsProgress.test.ts) ────────────────────────
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
import { useDetailsForm } from "../useDetailsForm";
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
    status: "Completed",
    ...overrides
  };
}

/**
 * Run the FULL integration: useDetailsForm + useDetailsProgress wired
 * together with the REAL onCompletedAutoOpenEdit callback (queueMicrotask
 * → setIsEditing(true)), exactly as DetailsExperience.tsx wires them.
 *
 * Returns the final isEditing() value after the click + microtask flush.
 */
async function runIntegrationClick(
  initialStatus: WatchlistItem["status"],
  clickedStatus: WatchlistItem["status"]
): Promise<{
  isEditing: boolean;
  setSeriesStatusCalled: boolean;
}> {
  return new Promise((resolve, reject) => {
    createRoot(async (dispose) => {
      try {
        // The REAL signal that backs selectedItem. Both useDetailsForm
        // and useDetailsProgress read from this.
        const [selectedItem, setSelectedItem] = createSignal<{
          baseItem: WatchlistItem;
          vaultItem: WatchlistItem | null;
        } | null>(null);

        // Initialize with a vault item.
        const initialItem = makeVaultItem({ status: initialStatus });
        setSelectedItem({
          baseItem: initialItem,
          vaultItem: initialItem
        });

        // The REAL memos used by DetailsExperience.
        const baseItem = createMemo(() => selectedItem()?.baseItem ?? null);
        const vaultItem = createMemo(() => selectedItem()?.vaultItem ?? null);

        // The REAL useDetailsForm hook.
        const formApi = useDetailsForm(vaultItem);

        // Flush the createEffect that fires on mount (it calls
        // resetTo(vaultItem) → setIsEditing(false)).
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));

        // The REAL onCompletedAutoOpenEdit callback — receives a
        // statusChanged boolean and decides whether to defer
        // (statusChanged → queueMicrotask) or call synchronously
        // (unchanged → immediate). Exactly as DetailsExperience.tsx
        // wires it after the 2026-09-03 fix.
        const onCompletedAutoOpenEdit = (statusChanged: boolean) => {
          if (statusChanged) {
            queueMicrotask(() => formApi.setIsEditing(true));
          } else {
            formApi.setIsEditing(true);
          }
        };

        const showToast = vi.fn();

        // The REAL useDetailsProgress hook.
        const progressApi = useDetailsProgress({
          baseItem,
          vaultItem,
          details: () => null,
          watchlist: () => [],
          setSelectedItem,
          showToast,
          onCompletedAutoOpenEdit
        });

        // We track whether setSelectedItem was called via the
        // setSeriesStatusInSupabase mock (it's called only when
        // statusChanged is true — and setSelectedItem is called in
        // the same branch).

        // Click the status button.
        await progressApi.handleSetStatus(clickedStatus);

        // Flush the queueMicrotask. We need to await a setTimeout(0)
        // to guarantee the microtask has run.
        await new Promise((r) => setTimeout(r, 10));

        const result = {
          isEditing: formApi.isEditing(),
          setSeriesStatusCalled:
            vi.mocked(setSeriesStatusInSupabase).mock.calls.length > 0
        };

        dispose();
        resolve(result);
      } catch (err) {
        dispose();
        reject(err);
      }
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("useDetailsProgress + useDetailsForm integration — Completed auto-open (2026-09-03 fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUid).mockReturnValue("user-1");
    vi.mocked(setSeriesStatusInSupabase).mockResolvedValue({
      status: "Completed" as WatchlistItem["status"],
      season: 1,
      episode: 1,
      watchedCount: 0,
      totalEpisodes: 0,
      progressPct: 0
    });
  });

  it("Completed → tap Completed: isEditing flips to true (the exact bug case)", async () => {
    const result = await runIntegrationClick("Completed", "Completed");
    // The hook should NOT have called setSeriesStatusInSupabase (status
    // is unchanged).
    expect(result.setSeriesStatusCalled).toBe(false);
    // The isEditing signal should be TRUE — the Edit modal should open.
    // This is the exact assertion that the user's manual test verifies.
    expect(result.isEditing).toBe(true);
  });

  it("Watching → tap Watching: isEditing flips to true", async () => {
    vi.mocked(setSeriesStatusInSupabase).mockResolvedValue({
      status: "Watching" as WatchlistItem["status"],
      season: 1,
      episode: 1,
      watchedCount: 0,
      totalEpisodes: 0,
      progressPct: 0
    });
    const result = await runIntegrationClick("Watching", "Watching");
    expect(result.setSeriesStatusCalled).toBe(false);
    expect(result.isEditing).toBe(true);
  });

  it("Watching → tap Completed: isEditing flips to true (status transition)", async () => {
    const result = await runIntegrationClick("Watching", "Completed");
    expect(result.setSeriesStatusCalled).toBe(true);
    expect(result.isEditing).toBe(true);
  });

  it("Completed → tap Watching: isEditing flips to true (status transition)", async () => {
    vi.mocked(setSeriesStatusInSupabase).mockResolvedValue({
      status: "Watching" as WatchlistItem["status"],
      season: 1,
      episode: 1,
      watchedCount: 0,
      totalEpisodes: 0,
      progressPct: 0
    });
    const result = await runIntegrationClick("Completed", "Watching");
    expect(result.setSeriesStatusCalled).toBe(true);
    expect(result.isEditing).toBe(true);
  });

  it("Planned → tap Planned: isEditing stays false (no auto-open)", async () => {
    const result = await runIntegrationClick("Planned", "Planned");
    expect(result.setSeriesStatusCalled).toBe(false);
    expect(result.isEditing).toBe(false);
  });

  it("Dropped → tap Dropped: isEditing stays false (no auto-open)", async () => {
    const result = await runIntegrationClick("Dropped", "Dropped");
    expect(result.setSeriesStatusCalled).toBe(false);
    expect(result.isEditing).toBe(false);
  });
});
