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
});
