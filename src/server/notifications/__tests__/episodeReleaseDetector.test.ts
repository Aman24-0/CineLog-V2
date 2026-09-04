// src/server/notifications/__tests__/episodeReleaseDetector.test.ts
//
// Tests for the episode release detection logic (hardened version).
//
// Tests:
//   1. isEpisodeReleased date logic
//   2. Active season detection (S2 airing when S3 announced)
//   3. Completed + released new season → reactivation
//   4. Completed + no new season → no releases
//   5. Dropped → not reactivated
//   6. Watching + new episode → notification
//   7. Upcoming episode → no notification
//   8. Dedup prevents duplicate notifications
//   9. TMDB failure → no false notifications
//  10. No seasons → empty
//  11. Only specials → empty
//  12. Missed releases: E1/E2/E3 all actionable → only E3 notified, all marked processed

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("~/core/tmdb/tmdb", () => ({
  fetchTmdbMetadata: vi.fn(),
  fetchSeasonDetails: vi.fn()
}));

vi.mock("~/lib/supabase/admin/adminClient", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null }))
            }))
          }))
        }))
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null }))
    }))
  }))
}));

vi.mock("~/shared/constants/notificationAssets", () => ({
  CINELOG_NOTIFICATION_ICON: "/icon.png"
}));

import { isEpisodeReleased, detectNewReleasesForItem } from "../episodeReleaseDetector";
import { fetchTmdbMetadata, fetchSeasonDetails } from "~/core/tmdb/tmdb";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

// ── Helpers ───────────────────────────────────────────────────────

function mockShowDetails(seasons: Array<{ season_number: number; episode_count: number }>) {
  return {
    id: 1,
    name: "Test Show",
    media_type: "tv",
    seasons: seasons.map((s) => ({
      id: s.season_number,
      name: `Season ${s.season_number}`,
      season_number: s.season_number,
      episode_count: s.episode_count
    }))
  };
}

function mockEpisode(
  episodeNumber: number,
  seasonNumber: number,
  airDate: string | null
) {
  return {
    id: episodeNumber,
    episode_number: episodeNumber,
    season_number: seasonNumber,
    name: `Episode ${episodeNumber}`,
    overview: "Test overview",
    air_date: airDate,
    runtime: 60,
    still_path: null,
    vote_average: 7.5,
    vote_count: 100
  };
}

function mockVaultItem(overrides: {
  status: string;
  season?: number | null;
  episode?: number | null;
  tmdbId?: number;
}) {
  return {
    id: "vault-1",
    user_id: "user-1",
    tmdb_id: overrides.tmdbId ?? 1,
    status: overrides.status,
    season: overrides.season ?? null,
    episode: overrides.episode ?? null
  };
}

function mockAdminClientWithLogs(logs: Array<{ episode_number: number; notification_status: string }>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: logs, error: null }))
          }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null }))
            }))
          }))
        }))
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null }))
    }))
  } as never;
}

// ── Date logic tests ──────────────────────────────────────────────

describe("isEpisodeReleased", () => {
  it("returns true for a date in the past", () => {
    expect(isEpisodeReleased("2020-01-01")).toBe(true);
  });

  it("returns true for today's date (UTC)", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isEpisodeReleased(today)).toBe(true);
  });

  it("returns false for a future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    expect(isEpisodeReleased(future.toISOString().slice(0, 10))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isEpisodeReleased(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isEpisodeReleased(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isEpisodeReleased("")).toBe(false);
  });
});

// ── Detection logic tests ─────────────────────────────────────────

describe("detectNewReleasesForItem", () => {
  const defaultAdminClient = createAdminClient();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Completed S1 + released S2E1 → reactivation (isReactivation=true)", async () => {
    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([
        { season_number: 1, episode_count: 10 },
        { season_number: 2, episode_count: 1 }
      ]) as never
    );
    vi.mocked(fetchSeasonDetails).mockResolvedValue({
      id: 2,
      season_number: 2,
      name: "Season 2",
      overview: "",
      air_date: "2024-01-01",
      episodes: [mockEpisode(1, 2, "2024-01-01")],
      poster_path: null
    } as never);

    const item = mockVaultItem({ status: "completed", season: 1, episode: 10 });
    const releases = await detectNewReleasesForItem(item, defaultAdminClient);

    expect(releases).toHaveLength(1);
    expect(releases[0]!.isReactivation).toBe(true);
    expect(releases[0]!.seasonNumber).toBe(2);
    expect(releases[0]!.episodeNumber).toBe(1);
  });

  it("Completed + no new season (latest = user's season) → no releases", async () => {
    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([{ season_number: 1, episode_count: 10 }]) as never
    );
    vi.mocked(fetchSeasonDetails).mockResolvedValue({
      id: 1,
      season_number: 1,
      name: "Season 1",
      overview: "",
      air_date: "2024-01-01",
      episodes: [mockEpisode(1, 1, "2024-01-01")],
      poster_path: null
    } as never);

    const item = mockVaultItem({ status: "completed", season: 1, episode: 10 });
    const releases = await detectNewReleasesForItem(item, defaultAdminClient);

    expect(releases).toHaveLength(0);
  });

  it("Dropped + released new season → NOT reactivated", async () => {
    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([
        { season_number: 1, episode_count: 10 },
        { season_number: 2, episode_count: 1 }
      ]) as never
    );
    vi.mocked(fetchSeasonDetails).mockResolvedValue({
      id: 2,
      season_number: 2,
      name: "Season 2",
      overview: "",
      air_date: "2024-01-01",
      episodes: [mockEpisode(1, 2, "2024-01-01")],
      poster_path: null
    } as never);

    const item = mockVaultItem({ status: "dropped", season: 1, episode: 5 });
    const releases = await detectNewReleasesForItem(item, defaultAdminClient);

    // Dropped is not "completed", so isReactivation would be false.
    if (releases.length > 0) {
      expect(releases[0]!.isReactivation).toBe(false);
    }
  });

  it("Watching + new released episode → notification (not reactivation)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([{ season_number: 1, episode_count: 5 }]) as never
    );
    vi.mocked(fetchSeasonDetails).mockResolvedValue({
      id: 1,
      season_number: 1,
      name: "Season 1",
      overview: "",
      air_date: "2024-01-01",
      episodes: [
        mockEpisode(1, 1, "2024-01-01"),
        mockEpisode(2, 1, "2024-01-08"),
        mockEpisode(3, 1, today)
      ],
      poster_path: null
    } as never);

    const item = mockVaultItem({ status: "watching", season: 1, episode: 2 });
    const releases = await detectNewReleasesForItem(item, defaultAdminClient);

    expect(releases).toHaveLength(1);
    expect(releases[0]!.isReactivation).toBe(false);
    expect(releases[0]!.episodeNumber).toBe(3);
  });

  it("Active S2 detected when S3 is announced/upcoming (no released episodes in S3)", async () => {
    // S3 exists but has no released episodes. S2 is currently airing.
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date();
    future.setDate(future.getDate() + 30);

    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([
        { season_number: 1, episode_count: 10 },
        { season_number: 2, episode_count: 5 },
        { season_number: 3, episode_count: 1 }
      ]) as never
    );

    // First call (S3) returns no released episodes
    // Second call (S2) returns released episodes
    vi.mocked(fetchSeasonDetails)
      .mockResolvedValueOnce({
        id: 3,
        season_number: 3,
        name: "Season 3",
        overview: "",
        air_date: null,
        episodes: [mockEpisode(1, 3, future.toISOString().slice(0, 10))],
        poster_path: null
      } as never)
      .mockResolvedValueOnce({
        id: 2,
        season_number: 2,
        name: "Season 2",
        overview: "",
        air_date: "2024-01-01",
        episodes: [mockEpisode(1, 2, today)],
        poster_path: null
      } as never);

    const item = mockVaultItem({ status: "watching", season: 1, episode: 10 });
    const releases = await detectNewReleasesForItem(item, defaultAdminClient);

    expect(releases).toHaveLength(1);
    expect(releases[0]!.seasonNumber).toBe(2); // NOT 3
    expect(releases[0]!.episodeNumber).toBe(1);
  });

  it("Upcoming episode (future air_date) → no notification", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);

    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([{ season_number: 1, episode_count: 3 }]) as never
    );
    vi.mocked(fetchSeasonDetails).mockResolvedValue({
      id: 1,
      season_number: 1,
      name: "Season 1",
      overview: "",
      air_date: "2024-01-01",
      episodes: [
        mockEpisode(1, 1, "2024-01-01"),
        mockEpisode(2, 1, "2024-01-08"),
        mockEpisode(3, 1, future.toISOString().slice(0, 10))
      ],
      poster_path: null
    } as never);

    const item = mockVaultItem({ status: "watching", season: 1, episode: 2 });
    const releases = await detectNewReleasesForItem(item, defaultAdminClient);

    // E1 and E2 are released. E3 is future → not included in releasedEpisodes.
    // The releasedEpisodes filter excludes E3, so actionableReleases = [E1, E2].
    // The latest actionable = E2. The notification is for E2, NOT E3.
    expect(releases).toHaveLength(1);
    expect(releases[0]!.episodeNumber).not.toBe(3); // NOT the future episode
  });

  it("Same episode already sent → not re-detected (dedup)", async () => {
    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([{ season_number: 1, episode_count: 3 }]) as never
    );
    vi.mocked(fetchSeasonDetails).mockResolvedValue({
      id: 1,
      season_number: 1,
      name: "Season 1",
      overview: "",
      air_date: "2024-01-01",
      episodes: [mockEpisode(1, 1, "2024-01-01")],
      poster_path: null
    } as never);

    // Mock dedup: E1 is already 'sent'
    const clientWithLogs = mockAdminClientWithLogs([
      { episode_number: 1, notification_status: "sent" }
    ]);

    const item = mockVaultItem({ status: "watching", season: 1, episode: 0 });
    const releases = await detectNewReleasesForItem(item, clientWithLogs);

    expect(releases).toHaveLength(0); // E1 already sent → no new release
  });

  it("Failed push can be retried (status=failed is not processed)", async () => {
    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([{ season_number: 1, episode_count: 3 }]) as never
    );
    vi.mocked(fetchSeasonDetails).mockResolvedValue({
      id: 1,
      season_number: 1,
      name: "Season 1",
      overview: "",
      air_date: "2024-01-01",
      episodes: [mockEpisode(1, 1, "2024-01-01")],
      poster_path: null
    } as never);

    // Mock dedup: E1 is 'failed' → retryable
    const clientWithFailed = mockAdminClientWithLogs([
      { episode_number: 1, notification_status: "failed" }
    ]);

    const item = mockVaultItem({ status: "watching", season: 1, episode: 0 });
    const releases = await detectNewReleasesForItem(item, clientWithFailed);

    // E1 is 'failed' → not in processedEpisodes → actionable
    expect(releases).toHaveLength(1);
    expect(releases[0]!.episodeNumber).toBe(1);
  });

  it("Missed releases E1/E2/E3 → only E3 notified, all marked processed", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([{ season_number: 1, episode_count: 5 }]) as never
    );
    vi.mocked(fetchSeasonDetails).mockResolvedValue({
      id: 1,
      season_number: 1,
      name: "Season 1",
      overview: "",
      air_date: "2024-01-01",
      episodes: [
        mockEpisode(1, 1, "2024-01-01"),
        mockEpisode(2, 1, "2024-01-08"),
        mockEpisode(3, 1, today)
      ],
      poster_path: null
    } as never);

    // No existing logs → all 3 episodes are actionable
    const item = mockVaultItem({ status: "watching", season: 1, episode: 0 });
    const releases = await detectNewReleasesForItem(item, defaultAdminClient);

    expect(releases).toHaveLength(1);
    expect(releases[0]!.episodeNumber).toBe(3); // latest actionable
    // All 3 episodes should be marked as processed
    expect(releases[0]!.allProcessedEpisodeNumbers).toContain(1);
    expect(releases[0]!.allProcessedEpisodeNumbers).toContain(2);
    expect(releases[0]!.allProcessedEpisodeNumbers).toContain(3);
  });

  it("TMDB fetch failure → returns empty (no false notifications)", async () => {
    vi.mocked(fetchTmdbMetadata).mockRejectedValue(new Error("TMDB error") as never);

    const item = mockVaultItem({ status: "watching", season: 1, episode: 1 });
    const releases = await detectNewReleasesForItem(item, defaultAdminClient);

    expect(releases).toHaveLength(0);
  });

  it("No seasons in TMDB data → returns empty", async () => {
    vi.mocked(fetchTmdbMetadata).mockResolvedValue({
      id: 1,
      name: "Test",
      media_type: "tv",
      seasons: []
    } as never);

    const item = mockVaultItem({ status: "watching", season: 1, episode: 1 });
    const releases = await detectNewReleasesForItem(item, defaultAdminClient);

    expect(releases).toHaveLength(0);
  });

  it("Only specials (season_number=0) → returns empty", async () => {
    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([{ season_number: 0, episode_count: 1 }]) as never
    );

    const item = mockVaultItem({ status: "watching", season: 1, episode: 1 });
    const releases = await detectNewReleasesForItem(item, defaultAdminClient);

    expect(releases).toHaveLength(0);
  });
});
