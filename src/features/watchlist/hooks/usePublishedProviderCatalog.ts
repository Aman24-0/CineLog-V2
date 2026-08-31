// src/features/watchlist/hooks/usePublishedProviderCatalog.ts
//
// CineLog V2 — Part 4 redesign — Published Supabase Platform Catalogue
// ---------------------------------------------------------------------
// Reads the published JustWatch provider catalogue for the user's
// profile country from Supabase (`justwatch_provider_catalog` rows
// with `active = true`). This hook is the USER-SIDE source of truth
// for the Library Platform filter dropdown options.
//
// ARCHITECTURE (per spec):
//
//   profile.country  (reactive via useDiscoverRegion)
//        │
//        ▼
//   GET /api/ott/providers?country=XX
//        │
//        ▼
//   /api/ott/providers route
//        │
//        ▼
//   getPublishedProviderCatalog(country)   (server-side, Supabase only)
//        │
//        ▼
//   justwatch_provider_catalog rows where active = true
//        │
//        ▼
//   PlatformFilterOption[]   (technicalName + clearName + icon)
//
// NO JustWatch fallback on the user side. If no rows are published for
// the user's country, the dropdown is empty (the Library UI shows a
// "No platforms available for your country" note in the disabled
// state — see VaultFiltersContent).
//
// When the user changes their profile country (Account settings →
// country), `useDiscoverRegion()` flips, and this hook automatically
// refetches the catalogue for the new country.
//
// Caching:
//   - The hook keeps a per-country in-memory cache for the lifetime of
//     the page (a Map keyed by country code → PlatformFilterOption[]).
//     Switching back to a previously-fetched country is instant.
//   - There is NO localStorage cache (the published catalogue does not
//     expire; the admin re-publishes on change).
//   - There is NO JustWatch live-fetch fallback. A country with no
//     published rows stays empty until an admin publishes providers.

import {
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  type Accessor
} from "solid-js";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import type { PlatformFilterOption } from "./useWatchlistOttAvailability";
import type { JustWatchPackage } from "~/shared/types/justwatch";

// In-memory per-country cache. Survives hot reloads (module scope).
// Keyed by ISO 3166-1 alpha-2 country code (uppercase).
const cache = new Map<string, PlatformFilterOption[]>();

/**
 * Clear the in-memory per-country cache. Exposed for tests so each
 * test starts with a clean cache (otherwise the second test would
 * hit the cache from the first test and skip the fetch).
 *
 * Not intended for production use — the cache has no expiry by
 * design (published catalogues are admin-controlled and do not
 * expire; the user-side hook re-fetches when the country changes).
 */
export function _clearPublishedProviderCatalogCacheForTests(): void {
  cache.clear();
}

interface ProvidersResponse {
  country: string;
  providers: JustWatchPackage[];
}

/**
 * usePublishedProviderCatalog — fetch the Library Platform filter
 * options from the published Supabase catalogue for the user's
 * profile country.
 *
 * Returns:
 *   - `catalog`    — the PlatformFilterOption[] (technicalName,
 *                    clearName, icon). Empty while loading, on error,
 *                    or when no providers are published for the
 *                    country.
 *   - `loading`    — true while a fetch is in flight.
 *   - `error`      — true if the last fetch failed (the catalog is
 *                    empty in this state).
 *   - `country`    — the country code currently being read.
 *
 * The hook refetches when `useDiscoverRegion()` changes. It is safe
 * to call from multiple components — the per-country cache dedupes
 * requests.
 */
export function usePublishedProviderCatalog(): {
  catalog: Accessor<PlatformFilterOption[]>;
  loading: Accessor<boolean>;
  error: Accessor<boolean>;
  country: Accessor<string>;
} {
  const region = useDiscoverRegion();
  const [catalog, setCatalog] = createSignal<PlatformFilterOption[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal(false);

  // The country accessor is derived from region() so consumers can
  // read which country's catalogue is currently being shown.
  const country = createMemo(() => region() || "IN");

  let inFlight: AbortController | null = null;

  createEffect(() => {
    const c = country();
    if (!c) return;

    // Cancel any in-flight fetch for a previous country.
    if (inFlight) {
      try {
        inFlight.abort();
      } catch {
        /* ignore */
      }
      inFlight = null;
    }

    // Synchronous cache hit — avoid the loading state entirely so the
    // dropdown is responsive when switching back to a previously-fetched
    // country (e.g. the user toggles IN → US → IN).
    const cached = cache.get(c);
    if (cached) {
      setCatalog(cached);
      setLoading(false);
      setError(false);
      return;
    }

    // Cache miss — fetch from the user-side API route (Supabase only).
    setLoading(true);
    setError(false);
    setCatalog([]);

    const controller = new AbortController();
    inFlight = controller;

    (async () => {
      try {
        const url = `/api/ott/providers?country=${encodeURIComponent(c)}`;
        const res = await fetch(url, {
          signal: controller.signal,
          credentials: "same-origin",
          headers: { Accept: "application/json" }
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as ProvidersResponse;
        if (controller.signal.aborted) return;

        const providers = Array.isArray(json?.providers) ? json.providers : [];
        // Map JustWatchPackage → PlatformFilterOption. We don't compute
        // a per-provider watchlist count here (the Part 4 redesign
        // decouples the dropdown options from the user's current
        // watchlist contents — count is not meaningful at the catalog
        // level). `count` is left at 0 for all entries; consumers that
        // want a count should derive it separately from
        // `useWatchlistOttAvailability.enrichedItems` if needed.
        const options: PlatformFilterOption[] = providers
          .filter((p) => p && p.technicalName && p.clearName)
          .map((p) => ({
            technicalName: p.technicalName,
            clearName: p.clearName,
            icon: p.icon || undefined,
            count: 0
          }));

        cache.set(c, options);
        setCatalog(options);
        setError(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn(
          "[usePublishedProviderCatalog] fetch failed for country",
          c,
          err instanceof Error ? err.message : String(err)
        );
        setError(true);
        setCatalog([]);
      } finally {
        if (inFlight === controller) {
          inFlight = null;
        }
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
  });

  onCleanup(() => {
    if (inFlight) {
      try {
        inFlight.abort();
      } catch {
        /* ignore */
      }
      inFlight = null;
    }
  });

  return { catalog, loading, error, country };
}
