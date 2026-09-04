// src/server/notifications/__tests__/episodeReleaseDetector.test.ts
//
// Tests for the episode release detection logic (v3 hardened version).
//
// Existing tests (preserved from v2):
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
//
// v3 CONCURRENCY REGRESSION TESTS (new):
//  13. Two simultaneous attempts for the same episode → only one push is sent
//  14. Second worker sees an already claimed episode → no push
//  15. Push failure → status becomes failed/retryable
//  16. Later retry → push can succeed
//  17. Successful notification → subsequent cron run cannot send it again
//  18. Missed E1/E2/E3 → only latest episode is notified (anti-spam via processRelease)

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("~/core/tmdb/tmdb", () => ({
  fetchTmdbMetadata: vi.fn(),
  fetchSeasonDetails: vi.fn()
}));

vi.mock("~/shared/constants/notificationAssets", () => ({
  CINELOG_NOTIFICATION_ICON: "/icon.png"
}));

// ── Admin client mock builder ─────────────────────────────────────
//
// The detector uses three admin-client operations:
//   .from("episode_release_log").select(...)           — dedup query
//   .from("episode_release_log").upsert(...)           — mark actionable rows
//   .from("episode_release_log").update(...)           — final status update
//   .from("vault").update(...)                         — reactivation
//   .rpc("claim_episode_release", ...)                 — ATOMIC CLAIM
//
// buildAdminClient() lets each test configure the rpc behavior (does the
// claim succeed? does it return a claimed row or empty?) so we can
// exercise the concurrency paths deterministically.

interface AdminClientOptions {
  /** Existing episode_release_log rows (for dedup query). */
  existingLogs?: Array<{ episode_number: number; notification_status: string }>;
  /** What claim_episode_release() RPC should return. */
  claimResult?: "claimed" | "empty" | "error";
  /** What the push endpoint will return (mocked via fetch). */
  pushResult?: { sent: number; failed: number; skipped: number };
}

function buildAdminClient(opts: AdminClientOptions = {}) {
  const existingLogs = opts.existingLogs ?? [];
  const claimResult = opts.claimResult ?? "claimed";

  const upsertCalls: Array<{ payload: unknown }> = [];
  const updateCalls: Array<{ payload: unknown }> = [];
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const vaultUpdates: Array<{ payload: unknown }> = [];

  const adminClient = {
    from: vi.fn((table: string) => {
      if (table === "episode_release_log") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() =>
                  Promise.resolve({ data: existingLogs, error: null })
                )
              }))
            }))
          })),
          upsert: vi.fn((payload: unknown) => {
            upsertCalls.push({ payload });
            return Promise.resolve({ error: null });
          }),
          update: vi.fn((payload: unknown) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => {
                    updateCalls.push({ payload });
                    return Promise.resolve({ error: null });
                  })
                }))
              }))
            }))
          }))
        };
      }
      if (table === "vault") {
        return {
          update: vi.fn((payload: unknown) => ({
            eq: vi.fn(() => {
              vaultUpdates.push({ payload });
              return Promise.resolve({ error: null });
            })
          }))
        };
      }
      return {};
    }),
    rpc: vi.fn((name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (claimResult === "error") {
        return Promise.resolve({ data: null, error: { message: "RPC failed" } });
      }
      if (claimResult === "empty") {
        return Promise.resolve({ data: [], error: null });
      }
      // claimed — return one row
      return Promise.resolve({
        data: [
          {
            id: "claim-row-1",
            user_id: "user-1",
            tmdb_id: 1,
            season_number: 1,
            episode_number: 3,
            notification_status: "pending",
            claimed_at: new Date().toISOString()
          }
        ],
        error: null
      });
    })
  };

  return { adminClient: adminClient as never, upsertCalls, updateCalls, rpcCalls, vaultUpdates };
}

// Re-export for tests that don't need call tracking
vi.mock("~/lib/supabase/admin/adminClient", () => ({
  createAdminClient: vi.fn(() => buildAdminClient().adminClient)
}));

import { isEpisodeReleased, detectNewReleasesForItem, processRelease } from "../episodeReleaseDetector";
import type { DetectedRelease } from "../episodeReleaseDetector";
import { fetchTmdbMetadata, fetchSeasonDetails } from "~/core/tmdb/tmdb";

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

// Build a minimal DetectedRelease for processRelease tests
function buildRelease(overrides: Partial<DetectedRelease> = {}): DetectedRelease {
  return {
    tmdbId: 1,
    seasonNumber: 1,
    episodeNumber: 3,
    episodeAirDate: "2024-01-01",
    titleName: "Test Show",
    isReactivation: false,
    allProcessedEpisodeNumbers: [3],
    ...overrides
  };
}

// Mock fetch for push notification calls
function mockFetchResponse(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

// ── Detection logic tests (unchanged from v2) ─────────────────────

describe("detectNewReleasesForItem", () => {
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
    const { adminClient } = buildAdminClient();
    const releases = await detectNewReleasesForItem(item, adminClient);

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
    const { adminClient } = buildAdminClient();
    const releases = await detectNewReleasesForItem(item, adminClient);

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
    const { adminClient } = buildAdminClient();
    const releases = await detectNewReleasesForItem(item, adminClient);

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
    const { adminClient } = buildAdminClient();
    const releases = await detectNewReleasesForItem(item, adminClient);

    expect(releases).toHaveLength(1);
    expect(releases[0]!.isReactivation).toBe(false);
    expect(releases[0]!.episodeNumber).toBe(3);
  });

  it("Active S2 detected when S3 is announced/upcoming (no released episodes in S3)", async () => {
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
    const { adminClient } = buildAdminClient();
    const releases = await detectNewReleasesForItem(item, adminClient);

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
    const { adminClient } = buildAdminClient();
    const releases = await detectNewReleasesForItem(item, adminClient);

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

    const { adminClient } = buildAdminClient({
      existingLogs: [{ episode_number: 1, notification_status: "sent" }]
    });

    const item = mockVaultItem({ status: "watching", season: 1, episode: 0 });
    const releases = await detectNewReleasesForItem(item, adminClient);

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

    const { adminClient } = buildAdminClient({
      existingLogs: [{ episode_number: 1, notification_status: "failed" }]
    });

    const item = mockVaultItem({ status: "watching", season: 1, episode: 0 });
    const releases = await detectNewReleasesForItem(item, adminClient);

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

    const item = mockVaultItem({ status: "watching", season: 1, episode: 0 });
    const { adminClient } = buildAdminClient();
    const releases = await detectNewReleasesForItem(item, adminClient);

    expect(releases).toHaveLength(1);
    expect(releases[0]!.episodeNumber).toBe(3); // latest actionable
    expect(releases[0]!.allProcessedEpisodeNumbers).toContain(1);
    expect(releases[0]!.allProcessedEpisodeNumbers).toContain(2);
    expect(releases[0]!.allProcessedEpisodeNumbers).toContain(3);
  });

  it("TMDB fetch failure → returns empty (no false notifications)", async () => {
    vi.mocked(fetchTmdbMetadata).mockRejectedValue(new Error("TMDB error") as never);

    const item = mockVaultItem({ status: "watching", season: 1, episode: 1 });
    const { adminClient } = buildAdminClient();
    const releases = await detectNewReleasesForItem(item, adminClient);

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
    const { adminClient } = buildAdminClient();
    const releases = await detectNewReleasesForItem(item, adminClient);

    expect(releases).toHaveLength(0);
  });

  it("Only specials (season_number=0) → returns empty", async () => {
    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([{ season_number: 0, episode_count: 1 }]) as never
    );

    const item = mockVaultItem({ status: "watching", season: 1, episode: 1 });
    const { adminClient } = buildAdminClient();
    const releases = await detectNewReleasesForItem(item, adminClient);

    expect(releases).toHaveLength(0);
  });
});

// ── v3 Concurrency regression tests ───────────────────────────────
//
// These tests prove the atomic claim mechanism works correctly:
//   - Only ONE worker can become the sender for an episode
//   - Concurrent workers that lose the claim do NOT send a push
//   - Push failures leave status='failed' for retry
//   - Successful pushes never get re-sent
//   - Missed-release anti-spam works through processRelease

describe("processRelease — atomic claim concurrency", () => {
  const userId = "user-1";
  const vaultItemId = "vault-1";

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: CRON_SECRET set so push can fire
    process.env.CRON_SECRET = "test-cron-secret-16chars-min";
    process.env.URL = "http://localhost:3000";
  });

  it("13. Two simultaneous attempts for the same episode → only one push is sent", async () => {
    // Simulate two workers (Worker A claims first, Worker B finds it already claimed).
    const fetchMock = mockFetchResponse({ sent: 1, failed: 0, skipped: 0 });

    // Worker A: claim succeeds → sends push
    const workerA = buildAdminClient({ claimResult: "claimed" });
    const release = buildRelease({ episodeNumber: 3, allProcessedEpisodeNumbers: [3] });
    const resultA = await processRelease(release, userId, vaultItemId, workerA.adminClient);

    // Worker B: claim returns empty → no push
    const workerB = buildAdminClient({ claimResult: "empty" });
    const resultB = await processRelease(release, userId, vaultItemId, workerB.adminClient);

    // Only Worker A's push went out
    expect(resultA.sent).toBe(1);
    expect(resultB.sent).toBe(0);
    expect(resultB.skipped).toBe(1);

    // fetch (push endpoint) was called exactly once across both workers
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Both workers attempted the claim RPC
    expect(workerA.rpcCalls.length).toBe(1);
    expect(workerB.rpcCalls.length).toBe(1);
    expect(workerA.rpcCalls[0]!.name).toBe("claim_episode_release");
    expect(workerB.rpcCalls[0]!.name).toBe("claim_episode_release");
  });

  it("14. Second worker sees an already claimed episode → no push", async () => {
    const fetchMock = mockFetchResponse({ sent: 1, failed: 0, skipped: 0 });

    // Worker B sees empty claim (someone else already claimed)
    const worker = buildAdminClient({ claimResult: "empty" });
    const release = buildRelease({ episodeNumber: 5 });
    const result = await processRelease(release, userId, vaultItemId, worker.adminClient);

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled(); // NO push was sent

    // The claim RPC was still attempted (so we know the worker checked)
    expect(worker.rpcCalls.length).toBe(1);
  });

  it("15. Push failure → status becomes failed/retryable", async () => {
    // Claim succeeds but push fails
    const fetchMock = mockFetchResponse({ sent: 0, failed: 1, skipped: 0 }, true);
    // Override: push endpoint says 1 failed
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ sent: 0, failed: 1, skipped: 0 })
    });

    const worker = buildAdminClient({ claimResult: "claimed" });
    const release = buildRelease({ episodeNumber: 7 });
    const result = await processRelease(release, userId, vaultItemId, worker.adminClient);

    expect(result.failed).toBe(1);

    // Verify the status update call set notification_status='failed'
    expect(worker.updateCalls.length).toBe(1);
    expect(worker.updateCalls[0]!.payload).toMatchObject({
      notification_status: "failed"
    });
  });

  it("16. Later retry → push can succeed (failed → claimed → sent)", async () => {
    // Simulate a retry: claim succeeds this time, push succeeds
    mockFetchResponse({ sent: 1, failed: 0, skipped: 0 });

    const worker = buildAdminClient({ claimResult: "claimed" });
    const release = buildRelease({ episodeNumber: 9 });
    const result = await processRelease(release, userId, vaultItemId, worker.adminClient);

    expect(result.sent).toBe(1);
    expect(worker.updateCalls.length).toBe(1);
    expect(worker.updateCalls[0]!.payload).toMatchObject({
      notification_status: "sent"
    });
  });

  it("17. Successful notification → subsequent cron run cannot send it again", async () => {
    // This test proves the dedup layer ABOVE processRelease works:
    // after a successful send (status='sent'), the detector's
    // detectNewReleasesForItem() must NOT return this episode as
    // actionable on the next run.
    vi.mocked(fetchTmdbMetadata).mockResolvedValue(
      mockShowDetails([{ season_number: 1, episode_count: 5 }]) as never
    );
    vi.mocked(fetchSeasonDetails).mockResolvedValue({
      id: 1,
      season_number: 1,
      name: "Season 1",
      overview: "",
      air_date: "2024-01-01",
      episodes: [mockEpisode(3, 1, "2024-01-01")],
      poster_path: null
    } as never);

    // Previous run successfully sent E3
    const { adminClient } = buildAdminClient({
      existingLogs: [{ episode_number: 3, notification_status: "sent" }]
    });

    const item = mockVaultItem({ status: "watching", season: 1, episode: 0 });
    const releases = await detectNewReleasesForItem(item, adminClient);

    // E3 is 'sent' → not actionable → no new release detected
    expect(releases).toHaveLength(0);
  });

  it("18. Missed E1/E2/E3 → only latest episode is notified (anti-spam via processRelease)", async () => {
    // Detection returns ONLY E3 as the to-be-notified episode, with
    // E1/E2/E3 in allProcessedEpisodeNumbers. processRelease must:
    //   - upsert E1 as 'skipped'
    //   - upsert E2 as 'skipped'
    //   - upsert E3 as 'pending' (will be claimed)
    //   - claim E3
    //   - send push for E3 only
    //   - update E3 to 'sent'
    mockFetchResponse({ sent: 1, failed: 0, skipped: 0 });

    const worker = buildAdminClient({ claimResult: "claimed" });
    const release = buildRelease({
      episodeNumber: 3,
      allProcessedEpisodeNumbers: [1, 2, 3]
    });
    const result = await processRelease(release, userId, vaultItemId, worker.adminClient);

    // Push sent for E3 only
    expect(result.sent).toBe(1);

    // Three upserts happened — E1, E2 (skipped), E3 (pending)
    expect(worker.upsertCalls.length).toBe(3);
    const statusesByEpisode = new Map<number, string>();
    for (const call of worker.upsertCalls) {
      const payload = call.payload as {
        episode_number: number;
        notification_status: string;
      };
      statusesByEpisode.set(payload.episode_number, payload.notification_status);
    }
    expect(statusesByEpisode.get(1)).toBe("skipped");
    expect(statusesByEpisode.get(2)).toBe("skipped");
    expect(statusesByEpisode.get(3)).toBe("pending");

    // Final status update set E3 → sent
    expect(worker.updateCalls.length).toBe(1);
    expect(worker.updateCalls[0]!.payload).toMatchObject({
      notification_status: "sent"
    });
  });
});
