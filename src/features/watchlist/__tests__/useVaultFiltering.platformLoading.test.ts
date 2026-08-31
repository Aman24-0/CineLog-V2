// src/features/watchlist/__tests__/useVaultFiltering.platformLoading.test.ts
//
// Part 4 follow-up tests — verify that the Platform catalogue loading
// state is DECOUPLED from the title-level JustWatch batch availability
// loading state.
//
// Before the fix, `useVaultFiltering.ottLoading` aggregated BOTH
// loading states (`ottBatchLoading() || catalogLoading()`), and
// `VaultFiltersContent` used `ottLoading` to decide whether to show
// "Loading platforms…". So when the title-level fetch was still
// running for 1000+ titles (can take minutes), the Platform dropdown
// showed "Loading platforms…" even though the small Supabase
// catalogue read had already returned 91 providers.
//
// The fix:
//   - Add a dedicated `platformCatalogLoading` accessor that depends
//     ONLY on `catalogLoading` (the Supabase read).
//   - Keep `ottLoading` (backward-compat) as the aggregate.
//   - VaultFiltersContent uses `platformCatalogLoading` (NOT
//     `ottLoading`) for the "Loading platforms…" hint.
//
// These tests verify:
//   1. When catalog is loading but title-availability is NOT,
//      `platformCatalogLoading` is true.
//   2. When catalog is loaded but title-availability is still loading,
//      `platformCatalogLoading` is false (dropdown should be enabled).
//   3. `ottLoading` aggregates both (backward-compat).
//   4. `uniquePlatforms` reflects the catalog (NOT the watchlist).

import { cleanup, renderHook } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";

// Mock useWatchlistOttAvailability so we can control `loading` (the
// title-level batch-availability fetch) independently from the
// catalog fetch.
const [ottBatchLoading, setOttBatchLoading] = createSignal(false);
const enrichedItems = vi.fn(() => [] as unknown[]);
const providerCatalog = vi.fn(() => []);

vi.mock("../hooks/useWatchlistOttAvailability", () => ({
  useWatchlistOttAvailability: () => ({
    enrichedItems,
    providerCatalog,
    loading: ottBatchLoading,
    error: () => false
  })
}));

// Mock usePublishedProviderCatalog so we can control `catalog` and
// `catalogLoading` independently.
const [catalogSignal, setCatalogSignal] = createSignal<
  Array<{ technicalName: string; clearName: string; count: number }>
>([]);
const [catalogLoadingSignal, setCatalogLoadingSignal] = createSignal(false);

vi.mock("../hooks/usePublishedProviderCatalog", () => ({
  usePublishedProviderCatalog: () => ({
    catalog: catalogSignal,
    loading: catalogLoadingSignal,
    error: () => false,
    country: () => "IN"
  })
}));

// Mock useDiscoverRegion (used by usePublishedProviderCatalog's real
// implementation, but the mock above bypasses it; still needed for
// the import to resolve).
vi.mock("~/core/config/discoverRegion", () => ({
  useDiscoverRegion: () => () => "IN",
  DEFAULT_DISCOVER_REGION: "IN",
  SUPPORTED_DISCOVER_REGIONS: ["IN", "US"] as const
}));

// Mock useSearchParams (used by useVaultFiltering for ?status= URL
// sync) — return empty params.
vi.mock("@solidjs/router", () => ({
  useSearchParams: () => [() => ({}), () => undefined]
}));

// Mock readTagDefinitions (used by useVaultFiltering for the tag
// vocabulary) — return empty.
vi.mock("../tagStore", () => ({
  readTagDefinitions: () => []
}));

const { useVaultFiltering } = await import("../useVaultFiltering");

beforeEach(() => {
  setOttBatchLoading(false);
  setCatalogSignal([]);
  setCatalogLoadingSignal(false);
});

afterEach(() => {
  cleanup();
});

describe("useVaultFiltering — Part 4 follow-up — decoupled platform loading", () => {
  it("platformCatalogLoading=true when the catalog fetch is in flight (regardless of title-availability state)", () => {
    setCatalogLoadingSignal(true);
    setOttBatchLoading(false);

    const hook = renderHook(() =>
      useVaultFiltering({
        watchlist: () => [],
        viewMode: () => "grid"
      })
    );

    expect(hook.result.platformCatalogLoading()).toBe(true);
  });

  it("platformCatalogLoading=false when the catalog has landed, even if title-availability is still loading (the key fix)", () => {
    // The catalog has 91 providers and the fetch is done.
    setCatalogSignal(
      Array.from({ length: 91 }, (_, i) => ({
        technicalName: `provider_${i}`,
        clearName: `Provider ${i}`,
        count: 0
      }))
    );
    setCatalogLoadingSignal(false);
    // But the title-level JustWatch batch availability is still
    // running for 1000+ titles — this can take minutes.
    setOttBatchLoading(true);

    const hook = renderHook(() =>
      useVaultFiltering({
        watchlist: () => [],
        viewMode: () => "grid"
      })
    );

    // The Platform dropdown should NOT show "Loading platforms…"
    // just because title availability is still loading.
    expect(hook.result.platformCatalogLoading()).toBe(false);
    // The 91 providers should be visible immediately.
    expect(hook.result.uniquePlatforms()).toHaveLength(91);
    // `ottLoading` (backward-compat) still aggregates both states.
    expect(hook.result.ottLoading()).toBe(true);
  });

  it("platformCatalogLoading=false when both catalog and title-availability are loaded", () => {
    setCatalogSignal([
      { technicalName: "netflix", clearName: "Netflix", count: 0 }
    ]);
    setCatalogLoadingSignal(false);
    setOttBatchLoading(false);

    const hook = renderHook(() =>
      useVaultFiltering({
        watchlist: () => [],
        viewMode: () => "grid"
      })
    );

    expect(hook.result.platformCatalogLoading()).toBe(false);
    expect(hook.result.ottLoading()).toBe(false);
    expect(hook.result.uniquePlatforms()).toHaveLength(1);
  });

  it("platformCatalogLoading=true when the catalog is loading AND title-availability is also loading", () => {
    setCatalogLoadingSignal(true);
    setOttBatchLoading(true);

    const hook = renderHook(() =>
      useVaultFiltering({
        watchlist: () => [],
        viewMode: () => "grid"
      })
    );

    expect(hook.result.platformCatalogLoading()).toBe(true);
    expect(hook.result.ottLoading()).toBe(true);
  });

  it("uniquePlatforms reflects the published catalog, NOT the watchlist-derived providerCatalog", () => {
    // The watchlist-derived providerCatalog mock returns [] (the
    // Part 4 redesign made it a stable []).
    providerCatalog.mockReturnValue([]);
    // The published catalog has 91 providers.
    setCatalogSignal(
      Array.from({ length: 91 }, (_, i) => ({
        technicalName: `provider_${i}`,
        clearName: `Provider ${i}`,
        count: 0
      }))
    );
    setCatalogLoadingSignal(false);

    const hook = renderHook(() =>
      useVaultFiltering({
        watchlist: () => [],
        viewMode: () => "grid"
      })
    );

    // uniquePlatforms should be the 91 published providers, NOT
    // the watchlist-derived [].
    expect(hook.result.uniquePlatforms()).toHaveLength(91);
  });
});
