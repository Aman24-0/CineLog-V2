import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/supabase/repositories", () => ({
  getVaultRepository: vi.fn(),
  getEpisodeProgressRepository: vi.fn()
}));

vi.mock("~/lib/supabase/repositories/activityLog", () => ({
  logActivity: vi.fn()
}));

import {
  markEpisodeWatchedAndSync,
  setSeriesStatusInSupabase,
  unwatchEpisodeAndSync
} from "../seriesEpisodeStateAdapter";
import {
  getEpisodeProgressRepository,
  getVaultRepository
} from "~/lib/supabase/repositories";

const seasons = [
  { number: 1, count: 3 },
  { number: 2, count: 4 }
];

const progressRow = (season_number: number, episode_number: number) => ({
  season_number,
  episode_number,
  id: `S${season_number}E${episode_number}`,
  vault_id: "vault-1",
  is_completed: true,
  progress_minutes: 0,
  rating: null,
  reaction: null,
  watched_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z"
});

function setup(existingRows: ReturnType<typeof progressRow>[] = []) {
  const vaultRepository = {
    getVaultByTmdbId: vi
      .fn()
      .mockResolvedValue({ data: { id: "vault-1" }, error: null }),
    updateStatus: vi.fn().mockResolvedValue({ error: null })
  };
  const episodeRepository = {
    getEpisodeProgressForVaultItem: vi
      .fn()
      .mockResolvedValue({ data: existingRows, error: null }),
    upsertEpisodeProgress: vi
      .fn()
      .mockResolvedValue({ data: null, error: null }),
    clearEpisodeProgress: vi.fn().mockResolvedValue({ error: null }),
    resetEpisodeProgress: vi.fn().mockResolvedValue({ error: null }),
    deleteEpisodeProgressFrom: vi.fn().mockResolvedValue({ error: null })
  };
  vi.mocked(getVaultRepository).mockReturnValue(vaultRepository as never);
  vi.mocked(getEpisodeProgressRepository).mockReturnValue(
    episodeRepository as never
  );
  return { vaultRepository, episodeRepository };
}

describe("seriesEpisodeStateAdapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks every known episode watched and sets Completed", async () => {
    const { vaultRepository, episodeRepository } = setup();

    const state = await setSeriesStatusInSupabase(
      "user-1",
      "123",
      "tv",
      "Completed",
      seasons
    );

    expect(episodeRepository.upsertEpisodeProgress).toHaveBeenCalledTimes(7);
    expect(
      episodeRepository.upsertEpisodeProgress.mock.calls.every(
        ([payload]) => payload.isCompleted === true
      )
    ).toBe(true);
    expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
      { userId: "user-1", tmdbId: 123, mediaType: "tv" },
      "completed"
    );
    expect(state).toMatchObject({
      status: "Completed",
      season: 2,
      episode: 4,
      watchedCount: 7,
      totalEpisodes: 7,
      progressPct: 100
    });
  });

  it("clears every episode and sets Planned", async () => {
    const { vaultRepository, episodeRepository } = setup([
      progressRow(1, 1),
      progressRow(2, 1)
    ]);

    const state = await setSeriesStatusInSupabase(
      "user-1",
      "123",
      "tv",
      "Planned",
      seasons
    );

    expect(episodeRepository.resetEpisodeProgress).toHaveBeenCalledWith(
      "vault-1"
    );
    expect(episodeRepository.upsertEpisodeProgress).not.toHaveBeenCalled();
    expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
      { userId: "user-1", tmdbId: 123, mediaType: "tv" },
      "planned"
    );
    expect(state).toMatchObject({
      status: "Planned",
      season: 1,
      episode: 1,
      watchedCount: 0,
      totalEpisodes: 7,
      progressPct: 0
    });
  });

  it("fills every preceding episode across seasons and derives Watching", async () => {
    const { vaultRepository, episodeRepository } = setup([
      progressRow(1, 1),
      progressRow(1, 2),
      progressRow(1, 3)
    ]);

    const state = await markEpisodeWatchedAndSync(
      "user-1",
      "123",
      "tv",
      2,
      2,
      seasons
    );

    expect(episodeRepository.upsertEpisodeProgress).toHaveBeenCalledTimes(5);
    expect(
      episodeRepository.upsertEpisodeProgress.mock.calls.map(
        ([payload]) => `S${payload.seasonNumber}E${payload.episodeNumber}`
      )
    ).toEqual(["S1E1", "S1E2", "S1E3", "S2E1", "S2E2"]);
    expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
      { userId: "user-1", tmdbId: 123, mediaType: "tv" },
      "watching"
    );
    expect(state).toMatchObject({
      status: "Watching",
      season: 2,
      episode: 2,
      watchedCount: 5,
      totalEpisodes: 7,
      progressPct: 71
    });
  });

  it("deletes the clicked episode forward and derives the surviving prefix", async () => {
    const { vaultRepository, episodeRepository } = setup([
      progressRow(1, 1),
      progressRow(1, 2),
      progressRow(1, 3),
      progressRow(2, 1),
      progressRow(2, 2),
      progressRow(2, 3)
    ]);

    const state = await unwatchEpisodeAndSync(
      "user-1",
      "123",
      "tv",
      2,
      2,
      { season: 2, episode: 1 },
      seasons
    );

    expect(episodeRepository.deleteEpisodeProgressFrom).toHaveBeenCalledWith(
      "vault-1",
      2,
      2
    );
    expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
      { userId: "user-1", tmdbId: 123, mediaType: "tv" },
      "watching"
    );
    expect(state).toMatchObject({
      status: "Watching",
      season: 2,
      episode: 1,
      watchedCount: 4,
      totalEpisodes: 7,
      progressPct: 57
    });
  });

  // ── 2026-09-03 — Watching status bug regression tests ──────────────
  // ROOT CAUSE: when the user explicitly set status to "Watching" on a
  // TV series, setSeriesStatusInSupabase derived the status from episode
  // progress via deriveSeriesStatus() instead of honoring the explicit
  // "Watching" request. This meant:
  //   - Completed → Watching on a fully-watched series: derived back to
  //     "Completed" (all episodes watched) → the UI stayed on Completed
  //     and the toast said "Status: Completed". BUG.
  //   - Planned → Watching on a series with no watched episodes: derived
  //     back to "Planned" (no episodes watched) → the UI stayed on
  //     Planned and the toast said "Status: Planned". BUG.
  // The fix adds an explicit "Watching" branch that persists "Watching"
  // as-is, keeping the watched prefix but not re-deriving the status.
  describe("setSeriesStatusInSupabase — explicit Watching request (2026-09-03 fix)", () => {
    it("Completed → Watching: persists 'Watching' even when all episodes are watched", async () => {
      // All 7 episodes watched (fully Completed series).
      const { vaultRepository } = setup([
        progressRow(1, 1),
        progressRow(1, 2),
        progressRow(1, 3),
        progressRow(2, 1),
        progressRow(2, 2),
        progressRow(2, 3),
        progressRow(2, 4)
      ]);

      const state = await setSeriesStatusInSupabase(
        "user-1",
        "123",
        "tv",
        "Watching",
        seasons
      );

      // The persisted status MUST be "watching" (NOT "completed").
      expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
        { userId: "user-1", tmdbId: 123, mediaType: "tv" },
        "watching"
      );
      // The returned state.status MUST be "Watching".
      expect(state.status).toBe("Watching");
      // The watchedCount should still reflect the watched prefix (7).
      expect(state.watchedCount).toBe(7);
      expect(state.totalEpisodes).toBe(7);
    });

    it("Planned → Watching: persists 'Watching' even when no episodes are watched", async () => {
      // No episodes watched (Planned series).
      const { vaultRepository } = setup([]);

      const state = await setSeriesStatusInSupabase(
        "user-1",
        "123",
        "tv",
        "Watching",
        seasons
      );

      // The persisted status MUST be "watching" (NOT "planned").
      expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
        { userId: "user-1", tmdbId: 123, mediaType: "tv" },
        "watching"
      );
      // The returned state.status MUST be "Watching".
      expect(state.status).toBe("Watching");
      // watchedCount is 0 (no episodes watched), but status is still Watching.
      expect(state.watchedCount).toBe(0);
    });

    it("Watching → Watching (already partially watched): persists 'Watching' and keeps prefix", async () => {
      // 3 episodes watched (partially Watching).
      const { vaultRepository } = setup([
        progressRow(1, 1),
        progressRow(1, 2),
        progressRow(1, 3)
      ]);

      const state = await setSeriesStatusInSupabase(
        "user-1",
        "123",
        "tv",
        "Watching",
        seasons
      );

      // The persisted status MUST be "watching".
      expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
        { userId: "user-1", tmdbId: 123, mediaType: "tv" },
        "watching"
      );
      expect(state.status).toBe("Watching");
      expect(state.watchedCount).toBe(3);
    });

    it("Completed → Watching: deletes future episode progress beyond the watched prefix", async () => {
      // All 7 episodes watched, but the prefix might have a gap. Verify
      // that deleteEpisodeProgressFrom is called when there's a gap.
      // In this test, all 7 episodes are watched contiguously, so there's
      // no gap — deleteEpisodeProgressFrom should NOT be called.
      const { episodeRepository } = setup([
        progressRow(1, 1),
        progressRow(1, 2),
        progressRow(1, 3),
        progressRow(2, 1),
        progressRow(2, 2),
        progressRow(2, 3),
        progressRow(2, 4)
      ]);

      await setSeriesStatusInSupabase(
        "user-1",
        "123",
        "tv",
        "Watching",
        seasons
      );

      // No gap → no deletion needed.
      expect(episodeRepository.deleteEpisodeProgressFrom).not.toHaveBeenCalled();
    });

    it("Completed → Watching: deletes stray progress when there's a gap in the watched prefix", async () => {
      // 7 episodes but S1E2 is missing (gap at S1E2). The prefix is
      // just S1E1. deleteEpisodeProgressFrom should be called at S1E2
      // to clean up the stray progress (S1E3, S2E1, etc.).
      const { episodeRepository } = setup([
        progressRow(1, 1),
        // S1E2 missing — gap here
        progressRow(1, 3),
        progressRow(2, 1),
        progressRow(2, 2),
        progressRow(2, 3),
        progressRow(2, 4)
      ]);

      await setSeriesStatusInSupabase(
        "user-1",
        "123",
        "tv",
        "Watching",
        seasons
      );

      // Gap at S1E2 → delete from S1E2 onward.
      expect(episodeRepository.deleteEpisodeProgressFrom).toHaveBeenCalledWith(
        "vault-1",
        1,
        2
      );
    });

    it("movie → Watching: persists 'Watching' directly (no episode derivation)", async () => {
      // Movies skip the TV logic entirely — they just persist the
      // requested status. This test confirms the movie path is
      // unaffected by the TV-specific fix.
      const { vaultRepository } = setup();

      const state = await setSeriesStatusInSupabase(
        "user-1",
        "123",
        "movie",
        "Watching",
        seasons
      );

      expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
        { userId: "user-1", tmdbId: 123, mediaType: "movie" },
        "watching"
      );
      expect(state.status).toBe("Watching");
    });
  });

  // ── Verify the other transitions still work (no regression) ────────
  describe("setSeriesStatusInSupabase — other status transitions (no regression)", () => {
    it("Watching → Completed: persists 'completed' and marks all episodes watched", async () => {
      const { vaultRepository, episodeRepository } = setup([
        progressRow(1, 1),
        progressRow(1, 2)
      ]);

      const state = await setSeriesStatusInSupabase(
        "user-1",
        "123",
        "tv",
        "Completed",
        seasons
      );

      expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
        { userId: "user-1", tmdbId: 123, mediaType: "tv" },
        "completed"
      );
      expect(state.status).toBe("Completed");
      // All 7 episodes should be marked watched.
      expect(episodeRepository.upsertEpisodeProgress).toHaveBeenCalledTimes(7);
    });

    it("Watching → Planned: persists 'planned' and resets episode progress", async () => {
      const { vaultRepository, episodeRepository } = setup([
        progressRow(1, 1),
        progressRow(1, 2),
        progressRow(1, 3)
      ]);

      const state = await setSeriesStatusInSupabase(
        "user-1",
        "123",
        "tv",
        "Planned",
        seasons
      );

      expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
        { userId: "user-1", tmdbId: 123, mediaType: "tv" },
        "planned"
      );
      expect(episodeRepository.resetEpisodeProgress).toHaveBeenCalledWith(
        "vault-1"
      );
      expect(state.status).toBe("Planned");
    });

    it("Watching → Dropped: persists 'dropped' and keeps the watched prefix", async () => {
      const { vaultRepository } = setup([
        progressRow(1, 1),
        progressRow(1, 2)
      ]);

      const state = await setSeriesStatusInSupabase(
        "user-1",
        "123",
        "tv",
        "Dropped",
        seasons
      );

      expect(vaultRepository.updateStatus).toHaveBeenCalledWith(
        { userId: "user-1", tmdbId: 123, mediaType: "tv" },
        "dropped"
      );
      expect(state.status).toBe("Dropped");
    });
  });
});
