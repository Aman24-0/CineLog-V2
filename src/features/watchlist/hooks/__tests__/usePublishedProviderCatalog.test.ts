// src/features/watchlist/hooks/__tests__/usePublishedProviderCatalog.test.ts
//
// Tests for the Part 4 `usePublishedProviderCatalog` hook — the
// user-side read path for the Library Platform filter dropdown
// options. The hook reads the published Supabase catalogue for the
// user's profile country (no JustWatch fallback).

import { cleanup, renderHook } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";

// Mock the global `fetch` so we can control the API response.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Hold a module-level country signal so the mocked
// `useDiscoverRegion` returns a controllable value across tests.
const [regionSignal, setRegionSignal] = createSignal<string>("IN");

vi.mock("~/core/config/discoverRegion", () => ({
  useDiscoverRegion: () => regionSignal,
  DEFAULT_DISCOVER_REGION: "IN",
  SUPPORTED_DISCOVER_REGIONS: ["IN", "US", "GB"] as const
}));

const { usePublishedProviderCatalog, _clearPublishedProviderCatalogCacheForTests } =
  await import("../usePublishedProviderCatalog");

beforeEach(() => {
  fetchMock.mockReset();
  setRegionSignal("IN");
  // Clear the in-memory cache so each test starts fresh — otherwise
  // the second test would hit the cache from the first test and skip
  // the fetch (and the fetchMock would never be called).
  _clearPublishedProviderCatalogCacheForTests();
});

afterEach(() => {
  cleanup();
});

describe("usePublishedProviderCatalog", () => {
  it("returns an empty catalog while loading, then the published providers after the fetch resolves", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          country: "IN",
          providers: [
            {
              id: "p1",
              clearName: "Netflix",
              shortName: "NF",
              technicalName: "netflix",
              icon: "/icon/1/{profile}/{format}"
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const hook = renderHook(() => usePublishedProviderCatalog());
    expect(hook.result.loading()).toBe(true);
    expect(hook.result.catalog()).toEqual([]);

    await vi.waitFor(() => expect(hook.result.loading()).toBe(false));
    expect(hook.result.error()).toBe(false);
    expect(hook.result.catalog()).toHaveLength(1);
    expect(hook.result.catalog()[0].technicalName).toBe("netflix");
    expect(hook.result.catalog()[0].clearName).toBe("Netflix");
    expect(hook.result.country()).toBe("IN");
  });

  it("returns an empty catalog and error=true when the fetch fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    const hook = renderHook(() => usePublishedProviderCatalog());
    await vi.waitFor(() => expect(hook.result.loading()).toBe(false));
    expect(hook.result.error()).toBe(true);
    expect(hook.result.catalog()).toEqual([]);
  });

  it("returns an empty catalog when no providers are published for the country", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ country: "US", providers: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    setRegionSignal("US");
    const hook = renderHook(() => usePublishedProviderCatalog());
    await vi.waitFor(() => expect(hook.result.loading()).toBe(false));
    expect(hook.result.error()).toBe(false);
    expect(hook.result.catalog()).toEqual([]);
    expect(hook.result.country()).toBe("US");
  });

  it("refetches when the country changes (profile country switch)", async () => {
    // First fetch: IN
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          country: "IN",
          providers: [
            {
              id: "p1",
              clearName: "Netflix",
              shortName: "NF",
              technicalName: "netflix",
              icon: ""
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const hook = renderHook(() => usePublishedProviderCatalog());
    await vi.waitFor(() => expect(hook.result.loading()).toBe(false));
    expect(hook.result.country()).toBe("IN");
    expect(hook.result.catalog()).toHaveLength(1);

    // Switch to US — second fetch should fire.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          country: "US",
          providers: [
            {
              id: "p2",
              clearName: "Hulu",
              shortName: "H",
              technicalName: "hulu",
              icon: ""
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    setRegionSignal("US");
    await vi.waitFor(() => expect(hook.result.country()).toBe("US"));
    await vi.waitFor(() => expect(hook.result.loading()).toBe(false));
    expect(hook.result.catalog()).toHaveLength(1);
    expect(hook.result.catalog()[0].technicalName).toBe("hulu");

    // Verify the right URLs were fetched.
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes("country=IN"))).toBe(true);
    expect(urls.some((u) => u.includes("country=US"))).toBe(true);
  });

  it("passes the country as a query parameter to /api/ott/providers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ country: "IN", providers: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const hook = renderHook(() => usePublishedProviderCatalog());
    await vi.waitFor(() => expect(hook.result.loading()).toBe(false));
    expect(fetchMock).toHaveBeenCalled();
    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain("/api/ott/providers?country=IN");
  });

  it("does NOT fall back to JustWatch — calls ONLY /api/ott/providers (Supabase-backed)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ country: "IN", providers: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const hook = renderHook(() => usePublishedProviderCatalog());
    await vi.waitFor(() => expect(hook.result.loading()).toBe(false));
    // Verify no call to a JustWatch URL was made.
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(
      urls.every(
        (u) => !u.includes("justwatch.com") && !u.includes("apis.justwatch")
      )
    ).toBe(true);
  });
});
