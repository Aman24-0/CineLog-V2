// src/server/ott-providers/__tests__/ottProviderAvailability.test.ts
//
// Tests for the JustWatch-based OTT provider availability pipeline.
//
// Covers:
//   1. JustWatch title matching (correct selection, wrong first result,
//      movie/TV mismatch).
//   2. Error handling — temporary/network/GraphQL failures are NOT cached
//      as empty results.
//   3. Stale-cache refresh safety — failed refresh preserves old data;
//      confirmed empty results may replace stale data.
//   4. Region-specific cache isolation.
//   5. TTL/expiry behavior.
//
// Run: npx vitest run src/server/ott-providers/__tests__/

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import type {
  ProviderAvailabilityResult,
  ProviderAvailabilityEntry,
  JustWatchSearchResult
} from "../types";

// ─── Mocks ──────────────────────────────────────────────────────────────

// Mock cache module: in-memory store with region isolation + expiry.
const cacheStore = new Map<string, { result: ProviderAvailabilityResult; expiresAt: number }>();

vi.mock("../cache", () => ({
  readCache: vi.fn(async (tmdbId: number, type: string, region: string) => {
    const key = `${type}:${tmdbId}:${region}`;
    const entry = cacheStore.get(key);
    if (!entry) {
      return { result: null, fresh: false };
    }
    const now = Date.now();
    const fresh = entry.expiresAt > now;
    return { result: entry.result, fresh, expiresAt: new Date(entry.expiresAt).toISOString() };
  }),
  writeCache: vi.fn(async (tmdbId: number, type: string, region: string, result: ProviderAvailabilityResult) => {
    const key = `${type}:${tmdbId}:${region}`;
    const ttlMs = 7 * 24 * 60 * 60 * 1000;
    cacheStore.set(key, { result, expiresAt: Date.now() + ttlMs });
  }),
  listStaleEntries: vi.fn(async () => {
    const now = Date.now();
    const stale: Array<{ media_type: "movie" | "tv"; tmdb_id: number; region: string }> = [];
    for (const [key, entry] of cacheStore) {
      if (entry.expiresAt <= now) {
        const [mediaType, tmdbIdStr, region] = key.split(":");
        stale.push({
          media_type: mediaType as "movie" | "tv",
          tmdb_id: parseInt(tmdbIdStr, 10),
          region
        });
      }
    }
    return stale;
  })
}));

// Mock global.fetch to intercept JustWatch GraphQL calls.
const fetchMock = vi.fn() as Mock;
const realFetch = global.fetch;

beforeEach(() => {
  cacheStore.clear();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockReset();
});

afterEach(() => {
  global.fetch = realFetch;
  fetchMock.mockReset();
  cacheStore.clear();
});

// ─── Helper to build JustWatch search response ──────────────────────────

function buildSearchResponse(results: JustWatchSearchResult[]): unknown {
  return {
    data: {
      popularTitles: {
        edges: results.map((r) => ({
          node: {
            id: r.nodeId,
            title: r.title,
            originalTitle: r.originalTitle,
            releaseYear: r.year,
            objectType: r.type === "movie" ? "movie" : "show"
          }
        }))
      }
    }
  };
}

// ─── Helper to build JustWatch offers response ────────────────────────

function buildOffersResponse(providers: ProviderAvailabilityEntry[]): unknown {
  return {
    data: {
      node: {
        id: "test-node",
        offers: providers.map((p) => ({
          monetizationType: p.monetizationType,
          package: { clearName: p.providerName }
        }))
      }
    }
  };
}

// ─── Helper to build error response ────────────────────────────────────

function buildErrorResponse(message: string): unknown {
  return {
    errors: [{ message }]
  };
}

// ─── Helper to set up fetch mock for a search + offers ──────────────────

function mockJustWatchFetch(
  searchResponse: unknown,
  offersResponse: unknown,
  searchError = false,
  offersError = false
) {
  fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body?.toString() ?? "";
    // Check if this is a search query or an offers query.
    if (body.includes("popularTitles")) {
      if (searchError) {
        return {
          ok: false,
          status: 500,
          json: async () => buildErrorResponse("Internal server error")
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => searchResponse
      };
    }
    if (body.includes("offers")) {
      if (offersError) {
        return {
          ok: false,
          status: 500,
          json: async () => buildErrorResponse("Offers query failed")
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => offersResponse
      };
    }
    return { ok: true, status: 200, json: async () => ({ data: {} }) };
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("ProviderAvailabilityResult type", () => {
  it("should have correct shape", () => {
    const result: ProviderAvailabilityResult = {
      tmdbId: 123,
      type: "movie",
      region: "US",
      providers: [],
      checkedAt: new Date().toISOString()
    };
    expect(result.tmdbId).toBe(123);
    expect(result.type).toBe("movie");
    expect(result.region).toBe("US");
  });
});

describe("normalizeRegion", () => {
  it("should uppercase valid 2-letter regions", async () => {
    const { normalizeRegion } = await import("../justwatch");
    expect(normalizeRegion("in")).toBe("IN");
    expect(normalizeRegion("us")).toBe("US");
    expect(normalizeRegion("DE")).toBe("DE");
  });

  it("should fallback to US for invalid input", async () => {
    const { normalizeRegion } = await import("../justwatch");
    expect(normalizeRegion("")).toBe("US");
    expect(normalizeRegion("XYZ")).toBe("US");
    expect(normalizeRegion(undefined)).toBe("US");
  });
});

describe("scoreResult title matching", () => {
  it("should score exact title + year + type match highest", async () => {
    const { scoreResult } = await import("../justwatch");
    const result: JustWatchSearchResult = {
      nodeId: "1",
      title: "Dune: Part Two",
      originalTitle: null,
      year: 2024,
      type: "movie"
    };
    expect(scoreResult(result, "Dune: Part Two", 2024, "movie")).toBe(100);
  });

  it("should score exact title + year match (any type) at 80", async () => {
    const { scoreResult } = await import("../justwatch");
    const result: JustWatchSearchResult = {
      nodeId: "1",
      title: "Dune: Part Two",
      originalTitle: null,
      year: 2024,
      type: "tv"
    };
    expect(scoreResult(result, "Dune: Part Two", 2024, "movie")).toBe(80);
  });

  it("should score exact title + type match at 70", async () => {
    const { scoreResult } = await import("../justwatch");
    const result: JustWatchSearchResult = {
      nodeId: "1",
      title: "Dune: Part Two",
      originalTitle: null,
      year: null,
      type: "movie"
    };
    expect(scoreResult(result, "Dune: Part Two", null, "movie")).toBe(70);
  });

  it("should score exact title only at 60", async () => {
    const { scoreResult } = await import("../justwatch");
    const result: JustWatchSearchResult = {
      nodeId: "1",
      title: "Dune: Part Two",
      originalTitle: null,
      year: null,
      type: "tv"
    };
    expect(scoreResult(result, "Dune: Part Two", null, "movie")).toBe(60);
  });

  it("should score normalized title + type at 70", async () => {
    const { scoreResult } = await import("../justwatch");
    const result: JustWatchSearchResult = {
      nodeId: "1",
      title: "Dune  Part Two",
      originalTitle: null,
      year: null,
      type: "movie"
    };
    expect(scoreResult(result, "Dune Part Two", null, "movie")).toBe(70);
  });

  it("should score no match at -1", async () => {
    const { scoreResult } = await import("../justwatch");
    const result: JustWatchSearchResult = {
      nodeId: "1",
      title: "The Matrix",
      originalTitle: null,
      year: 1999,
      type: "movie"
    };
    expect(scoreResult(result, "Dune: Part Two", 2024, "movie")).toBe(-1);
  });

  it("should use originalTitle for matching", async () => {
    const { scoreResult } = await import("../justwatch");
    const result: JustWatchSearchResult = {
      nodeId: "1",
      title: "Dune: Deuxième Partie",
      originalTitle: "Dune: Part Two",
      year: 2024,
      type: "movie"
    };
    expect(scoreResult(result, "Dune: Part Two", 2024, "movie")).toBe(100);
  });
});

describe("JustWatch title matching in fetchProvidersFromJustWatch", () => {
  it("should select the correct result, not blindly the first", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    // First result is wrong (The Matrix), second is correct (Dune).
    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "wrong-1", title: "The Matrix", originalTitle: null, year: 1999, type: "movie" },
        { nodeId: "correct-1", title: "Dune: Part Two", originalTitle: null, year: 2024, type: "movie" }
      ]),
      buildOffersResponse([
        { providerName: "Netflix", monetizationType: "flatrate" }
      ])
    );

    const result = await fetchProvidersFromJustWatch(
      "Dune: Part Two",
      "US",
      "movie"
    );

    expect(result).not.toHaveProperty("error");
    if ("providers" in result) {
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].providerName).toBe("Netflix");
    }
  });

  it("should reject results with no reliable match", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    // Only partial matches — no exact title match.
    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "partial-1", title: "Dune", originalTitle: null, year: 2021, type: "movie" }
      ]),
      buildOffersResponse([])
    );

    const result = await fetchProvidersFromJustWatch(
      "Dune: Part Two",
      "US",
      "movie"
    );

    expect(result).toHaveProperty("error");
  });

  it("should reject movie vs TV mismatch with partial title match", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    // Title is partial ("The Last of Us" vs "The Last of Us Part II"),
    // type is TV but requesting movie, year doesn't match.
    // Score would be partial match only (10) — below threshold of 30.
    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "tv-node", title: "The Last of Us", originalTitle: null, year: 2013, type: "tv" }
      ]),
      buildOffersResponse([])
    );

    const result = await fetchProvidersFromJustWatch(
      "The Last of Us Part II",
      "US",
      "movie"
    );

    // Partial title match but wrong type → score < 30 → error.
    expect(result).toHaveProperty("error");
  });

  it("should reject partial title matches without type confirmation", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    mockJustWatchFetch(
      buildSearchResponse([
        // Partial title match, wrong type, no year.
        { nodeId: "wrong-1", title: "Dune: Part One", originalTitle: null, year: null, type: "tv" }
      ]),
      buildOffersResponse([])
    );

    const result = await fetchProvidersFromJustWatch(
      "Dune: Part Two",
      "US",
      "movie"
    );

    expect(result).toHaveProperty("error");
  });

  it("should use provided nodeId to skip search", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    mockJustWatchFetch(
      buildSearchResponse([]),
      buildOffersResponse([
        { providerName: "Prime Video", monetizationType: "rent" }
      ])
    );

    const result = await fetchProvidersFromJustWatch(
      "Dune: Part Two",
      "US",
      "movie",
      "known-node-id"
    );

    // fetch should not be called for search since nodeId was provided.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty("error");
    if ("providers" in result) {
      expect(result.providers).toHaveLength(1);
      expect(result.justWatchNodeId).toBe("known-node-id");
    }
  });
});

describe("fetchProvidersFromJustWatch error handling", () => {
  it("should return error on search fetch failure", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    mockJustWatchFetch(
      buildSearchResponse([]),
      buildOffersResponse([]),
      true, // searchError
      false
    );

    const result = await fetchProvidersFromJustWatch("Test", "US", "movie");

    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("noData");
  });

  it("should return error on search GraphQL errors", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => buildErrorResponse("GraphQL error")
    }));

    const result = await fetchProvidersFromJustWatch("Test", "US", "movie");

    expect(result).toHaveProperty("error");
  });

  it("should return error on search HTTP error", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 503,
      json: async () => ({})
    }));

    const result = await fetchProvidersFromJustWatch("Test", "US", "movie");

    expect(result).toHaveProperty("error");
  });

  it("should return noData=true when search returns no results", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    mockJustWatchFetch(
      buildSearchResponse([]),
      buildOffersResponse([])
    );

    const result = await fetchProvidersFromJustWatch("Test", "US", "movie");

    expect(result).toHaveProperty("error");
  });

  it("should return error on offers fetch failure", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "node-1", title: "Test", originalTitle: null, year: 2024, type: "movie" }
      ]),
      buildOffersResponse([]),
      false, // search ok
      true   // offers error
    );

    const result = await fetchProvidersFromJustWatch("Test", "US", "movie");

    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("providers");
  });

  it("should return noData=true when title found but offers empty", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "node-1", title: "Test", originalTitle: null, year: 2024, type: "movie" }
      ]),
      buildOffersResponse([])
    );

    const result = await fetchProvidersFromJustWatch("Test", "US", "movie");

     expect(result).not.toHaveProperty("error");
     if ("providers" in result) {
       expect(result.noData).toBe(true);
       expect(result.providers).toHaveLength(0);
     }
  });

  it("should return providers when offers found", async () => {
    const { fetchProvidersFromJustWatch } = await import("../justwatch");

    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "node-1", title: "Test", originalTitle: null, year: 2024, type: "movie" }
      ]),
      buildOffersResponse([
        { providerName: "Netflix", monetizationType: "flatrate" },
        { providerName: "Prime Video", monetizationType: "rent" }
      ])
    );

    const result = await fetchProvidersFromJustWatch("Test", "US", "movie");

    expect(result).not.toHaveProperty("error");
    if ("providers" in result) {
      expect(result.providers).toHaveLength(2);
      expect(result.noData).toBe(false);
    }
  });
});

describe("getProviderAvailability caching", () => {
  it("should cache successful provider results", async () => {
    const { getProviderAvailability } = await import("../worker");
    const { readCache } = await import("../cache");

    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "node-1", title: "Test", originalTitle: null, year: 2024, type: "movie" }
      ]),
      buildOffersResponse([
        { providerName: "Netflix", monetizationType: "flatrate" }
      ])
    );

    const response = await getProviderAvailability({
      tmdbId: 123,
      type: "movie",
      region: "US",
      title: "Test",
      year: 2024
    });

    expect(response.fromCache).toBe(false);
    expect(response.result.providers).toHaveLength(1);

    // Verify it was cached.
    const cached = await readCache(123, "movie", "US");
    expect(cached.result).not.toBeNull();
    expect(cached.fresh).toBe(true);
    expect(cached.result?.providers).toHaveLength(1);
  });

  it("should cache confirmed empty provider results", async () => {
    const { getProviderAvailability } = await import("../worker");
    const { readCache } = await import("../cache");

    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "node-1", title: "Test", originalTitle: null, year: 2024, type: "movie" }
      ]),
      buildOffersResponse([])
    );

    const response = await getProviderAvailability({
      tmdbId: 456,
      type: "movie",
      region: "US",
      title: "Test",
      year: 2024
    });

    expect(response.fromCache).toBe(false);
    expect(response.result.providers).toHaveLength(0);
    expect(response.result.noData).toBe(true);

    // Verify it was cached (noData=true, not an error).
    const cached = await readCache(456, "movie", "US");
    expect(cached.result).not.toBeNull();
    expect(cached.result?.noData).toBe(true);
  });

  it("should NOT cache error results (network failure)", async () => {
    const { getProviderAvailability } = await import("../worker");
    const { readCache } = await import("../cache");

    mockJustWatchFetch(
      buildSearchResponse([]),
      buildOffersResponse([]),
      true, // searchError
      false
    );

    const response = await getProviderAvailability({
      tmdbId: 789,
      type: "movie",
      region: "US",
      title: "Test"
    });

    expect(response.fromCache).toBe(false);
    expect(response.result.providers).toHaveLength(0);

    // Verify it was NOT cached (error result).
    const cached = await readCache(789, "movie", "US");
    expect(cached.result).toBeNull();
  });

  it("should NOT cache error results (offers failure)", async () => {
    const { getProviderAvailability } = await import("../worker");
    const { readCache } = await import("../cache");

    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "node-1", title: "Test", originalTitle: null, year: 2024, type: "movie" }
      ]),
      buildOffersResponse([]),
      false, // search ok
      true   // offers error
    );

    const response = await getProviderAvailability({
      tmdbId: 999,
      type: "movie",
      region: "US",
      title: "Test",
      year: 2024
    });

    expect(response.fromCache).toBe(false);
    expect(response.result.providers).toHaveLength(0);

    // Verify it was NOT cached.
    const cached = await readCache(999, "movie", "US");
    expect(cached.result).toBeNull();
  });

  it("should NOT cache error results (title not found)", async () => {
    const { getProviderAvailability } = await import("../worker");
    const { readCache } = await import("../cache");

    mockJustWatchFetch(
      buildSearchResponse([]),
      buildOffersResponse([])
    );

    const response = await getProviderAvailability({
      tmdbId: 111,
      type: "movie",
      region: "US",
      title: "Test"
    });

    // "No title found" is treated as an error, not noData.
    expect(response.fromCache).toBe(false);
    expect(response.result.providers).toHaveLength(0);

    const cached = await readCache(111, "movie", "US");
    expect(cached.result).toBeNull();
  });
});

describe("getProviderAvailability stale cache + refresh", () => {
  it("should preserve stale data on failed refresh", async () => {
    const { getProviderAvailability } = await import("../worker");
    const { readCache } = await import("../cache");

    // Pre-populate cache with stale data (expired).
    const staleResult: ProviderAvailabilityResult = {
      tmdbId: 222,
      type: "movie",
      region: "US",
      providers: [
        { providerName: "Netflix", monetizationType: "flatrate" }
      ],
      checkedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      justWatchNodeId: "old-node"
    };

    // Write to cache but mark as expired.
    cacheStore.set("movie:222:US", {
      result: staleResult,
      expiresAt: Date.now() - 1000 // expired
    });

    // Mock JustWatch to return an error (failed refresh).
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({})
    }));

    const response = await getProviderAvailability({
      tmdbId: 222,
      type: "movie",
      region: "US",
      title: "Test",
      nodeId: "old-node",
      backgroundRefreshIfStale: false
    });

    // Should return stale data (preserved), not empty.
    expect(response.fromCache).toBe(false);
    expect(response.result.providers).toHaveLength(1);
    expect(response.result.providers[0].providerName).toBe("Netflix");

    // Cache should NOT be updated with error result.
    const cached = await readCache(222, "movie", "US");
    expect(cached.result?.providers).toHaveLength(1);
  });

  it("should replace stale data on successful refresh", async () => {
    const { getProviderAvailability } = await import("../worker");
    const { readCache } = await import("../cache");

    // Pre-populate cache with stale data (expired).
    const staleResult: ProviderAvailabilityResult = {
      tmdbId: 333,
      type: "tv",
      region: "US",
      providers: [
        { providerName: "Old Netflix", monetizationType: "flatrate" }
      ],
      checkedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      justWatchNodeId: "old-node"
    };

    cacheStore.set("tv:333:US", {
      result: staleResult,
      expiresAt: Date.now() - 1000 // expired
    });

    // Mock JustWatch to return new successful data.
    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "new-node", title: "Test Show", originalTitle: null, year: 2024, type: "tv" }
      ]),
      buildOffersResponse([
        { providerName: "Hulu", monetizationType: "flatrate" }
      ])
    );

    const response = await getProviderAvailability({
      tmdbId: 333,
      type: "tv",
      region: "US",
      title: "Test Show",
      nodeId: "old-node",
      backgroundRefreshIfStale: false
    });

    expect(response.fromCache).toBe(false);
    expect(response.result.providers).toHaveLength(1);
    expect(response.result.providers[0].providerName).toBe("Hulu");

    // Cache should be updated with fresh data.
    const cached = await readCache(333, "tv", "US");
    expect(cached.fresh).toBe(true);
    expect(cached.result?.providers[0].providerName).toBe("Hulu");
  });

  it("should return stale immediately with background refresh when requested", async () => {
    const { getProviderAvailability } = await import("../worker");

    const staleResult: ProviderAvailabilityResult = {
      tmdbId: 444,
      type: "movie",
      region: "US",
      providers: [
        { providerName: "Netflix", monetizationType: "flatrate" }
      ],
      checkedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      justWatchNodeId: "old-node"
    };

    cacheStore.set("movie:444:US", {
      result: staleResult,
      expiresAt: Date.now() - 1000 // expired
    });

    // Mock JustWatch to return new data (will be fetched in background).
    mockJustWatchFetch(
      buildSearchResponse([
        { nodeId: "new-node", title: "Test", originalTitle: null, year: 2024, type: "movie" }
      ]),
      buildOffersResponse([
        { providerName: "Prime Video", monetizationType: "rent" }
      ])
    );

    const response = await getProviderAvailability({
      tmdbId: 444,
      type: "movie",
      region: "US",
      title: "Test",
      nodeId: "old-node",
      backgroundRefreshIfStale: true
    });

    // Should return stale data immediately.
    expect(response.fromCache).toBe(true);
    expect(response.stale).toBe(true);
    expect(response.result.providers).toHaveLength(1);
    expect(response.result.providers[0].providerName).toBe("Netflix");
  });

  it("should return fresh cache without hitting JustWatch", async () => {
    const { getProviderAvailability } = await import("../worker");

    const freshResult: ProviderAvailabilityResult = {
      tmdbId: 555,
      type: "movie",
      region: "US",
      providers: [
        { providerName: "Netflix", monetizationType: "flatrate" }
      ],
      checkedAt: new Date().toISOString(),
      justWatchNodeId: "node-1",
      fresh: true
    } as ProviderAvailabilityResult & { fresh?: boolean };

    cacheStore.set("movie:555:US", {
      result: freshResult as ProviderAvailabilityResult,
      expiresAt: Date.now() + 86400000 // fresh (1 day TTL)
    });

    const response = await getProviderAvailability({
      tmdbId: 555,
      type: "movie",
      region: "US",
      title: "Test"
    });

    expect(response.fromCache).toBe(true);
    expect(response.stale).toBe(false);
    expect(response.result.providers).toHaveLength(1);
    // fetchMock should not have been called.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("region-specific cache isolation", () => {
  it("should NOT return IN cache for US request", async () => {
    const { getProviderAvailability } = await import("../worker");

    // Cache data for IN region.
    const inResult: ProviderAvailabilityResult = {
      tmdbId: 777,
      type: "movie",
      region: "IN",
      providers: [
        { providerName: "Netflix", monetizationType: "flatrate" }
      ],
      checkedAt: new Date().toISOString(),
      justWatchNodeId: "in-node"
    };

    cacheStore.set("movie:777:IN", {
      result: inResult,
      expiresAt: Date.now() + 86400000 // fresh
    });

    // Request for US region — should NOT find the IN cache entry.
    // This will trigger a fresh JustWatch fetch (which we mock as returning empty).
    mockJustWatchFetch(
      buildSearchResponse([]),
      buildOffersResponse([])
    );

    const response = await getProviderAvailability({
      tmdbId: 777,
      type: "movie",
      region: "US",
      title: "Test"
    });

    // US region has no cache, so it should NOT return fromCache=true.
    expect(response.fromCache).toBe(false);
  });

  it("should return correct data for each region independently", async () => {
    const { getProviderAvailability } = await import("../worker");

    // Cache fresh data for both IN and US.
    const inResult: ProviderAvailabilityResult = {
      tmdbId: 888,
      type: "movie",
      region: "IN",
      providers: [
        { providerName: "Netflix", monetizationType: "flatrate" }
      ],
      checkedAt: new Date().toISOString(),
      justWatchNodeId: "in-node"
    };

    const usResult: ProviderAvailabilityResult = {
      tmdbId: 888,
      type: "movie",
      region: "US",
      providers: [
        { providerName: "Prime Video", monetizationType: "rent" }
      ],
      checkedAt: new Date().toISOString(),
      justWatchNodeId: "us-node"
    };

    cacheStore.set("movie:888:IN", {
      result: inResult,
      expiresAt: Date.now() + 86400000
    });

    cacheStore.set("movie:888:US", {
      result: usResult,
      expiresAt: Date.now() + 86400000
    });

    const inResponse = await getProviderAvailability({
      tmdbId: 888,
      type: "movie",
      region: "IN",
      title: "Test"
    });

    const usResponse = await getProviderAvailability({
      tmdbId: 888,
      type: "movie",
      region: "US",
      title: "Test"
    });

    expect(inResponse.fromCache).toBe(true);
    expect(inResponse.result.providers[0].providerName).toBe("Netflix");

    expect(usResponse.fromCache).toBe(true);
    expect(usResponse.result.providers[0].providerName).toBe("Prime Video");
  });
});

describe("stale cache + failed refresh preserves old data", () => {
  it("should preserve stale data when refresh returns error after 1st fetchMock call", async () => {
    const { getProviderAvailability } = await import("../worker");

    // Pre-populate with stale data.
    const staleResult: ProviderAvailabilityResult = {
      tmdbId: 666,
      type: "movie",
      region: "US",
      providers: [
        { providerName: "Netflix", monetizationType: "flatrate" }
      ],
      checkedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      justWatchNodeId: "stale-node"
    };

    cacheStore.set("movie:666:US", {
      result: staleResult,
      expiresAt: Date.now() - 1000 // expired
    });

    // Mock fetch to succeed for search but fail for offers.
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const body = typeof input === "string" ? input : "";
      if (body.includes("popularTitles")) {
        return {
          ok: true,
          status: 200,
          json: async () => buildSearchResponse([
            { nodeId: "stale-node", title: "Test", originalTitle: null, year: 2024, type: "movie" }
          ])
        };
      }
      // Offers fetch fails.
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const response = await getProviderAvailability({
      tmdbId: 666,
      type: "movie",
      region: "US",
      title: "Test",
      nodeId: "stale-node",
      backgroundRefreshIfStale: false
    });

    // Should fall back to stale data.
    expect(response.result.providers).toHaveLength(1);
    expect(response.result.providers[0].providerName).toBe("Netflix");
  });
});
