// src/features/discover/hooks/useDiscoverFeeds.ts
//
// useDiscoverFeeds — fetches all TMDB feeds for the Discover page in parallel.
//
// All feeds use the existing apiCache layer — no duplicate requests.
// Each feed is independent: if one fails, the others still load.
// The page renders each section as its data arrives (no blocking).
//
// REGION: REACTIVE. The hook reads the live region via
// `useDiscoverRegion()` and automatically refetches every feed when
// the user changes their country in Account settings. Callers can
// still override with their own accessor for tests, but in production
// every Discover section should just consume the hook's default so
// region switches propagate automatically.
//
// 2026-09-03: Re-added `nowPlaying` feed for the "Running in Theatres"
// section. It was previously removed (Phase 5 Task 8) because it was
// fetched but never consumed. Now it IS consumed by the new section,
// so it's back. Uses `getNowPlaying(region)` which calls TMDB's
// /movie/now_playing endpoint with the user's region for localization.

import {
  createSignal,
  onMount,
  on,
  createEffect,
  type Accessor
} from "solid-js";
import { isServer } from "solid-js/web";
import type { TMDBTitle } from "~/shared/types";
import {
  getTrending,
  getUpcoming,
  getNowPlaying,
  discoverMovies
} from "~/core/tmdb/discover";
import { isTmdb404 } from "~/core/tmdb/tmdb";
import { useDiscoverRegion } from "~/core/config/discoverRegion";

export interface DiscoverFeeds {
  trending: Accessor<TMDBTitle[]>;
  upcoming: Accessor<TMDBTitle[]>;
  /** Movies currently in theatres (region-specific). 2026-09-03. */
  nowPlaying: Accessor<TMDBTitle[]>;
  hiddenGems: Accessor<TMDBTitle[]>;
  loading: Accessor<boolean>;
  /** Retry the full feed batch (used by the empty-state Retry button). */
  retry: () => void;
}

/**
 * useDiscoverFeeds — fetches every Discover feed in parallel.
 *
 * @param regionOverride optional reactive accessor for the region.
 *   Defaults to `useDiscoverRegion()` so the hook reacts to country
 *   changes made in Account settings → Country dropdown.
 */
export function useDiscoverFeeds(
  regionOverride?: Accessor<string>
): DiscoverFeeds {
  const defaultRegion = useDiscoverRegion();
  const region = regionOverride ?? defaultRegion;

  const [trending, setTrending] = createSignal<TMDBTitle[]>([]);
  const [upcoming, setUpcoming] = createSignal<TMDBTitle[]>([]);
  const [nowPlaying, setNowPlaying] = createSignal<TMDBTitle[]>([]);
  const [hiddenGems, setHiddenGems] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);

  const loadAll = () => {
    if (isServer) return;
    setLoading(true);

    // Snapshot region at call-time so all parallel fetches in this
    // batch use the same region even if it changes mid-flight.
    const r = region();

    // Fetch all feeds in parallel. Each is independent — failures don't
    // affect other feeds. All use cachedFetch so repeated visits are instant.
    const feeds: Promise<unknown>[] = [
      getTrending("all", "week")
        .then((v) => {
          setTrending(v);
        })
        .catch((e) => {
          if (!isTmdb404(e)) console.warn("[useDiscoverFeeds] trending:", e);
        }),

      getUpcoming(r)
        .then((v) => {
          setUpcoming(v);
        })
        .catch((e) => {
          if (!isTmdb404(e)) console.warn("[useDiscoverFeeds] upcoming:", e);
        }),

      // 2026-09-03: now-playing (theatrical) movies for the user's region.
      // Uses TMDB's /movie/now_playing?region={r} — the region parameter
      // ensures the results match the user's selected country.
      getNowPlaying(r)
        .then((v) => {
          setNowPlaying(v);
        })
        .catch((e) => {
          if (!isTmdb404(e)) console.warn("[useDiscoverFeeds] nowPlaying:", e);
        }),

      // Hidden gems: high rating, low popularity
      discoverMovies({
        sortBy: "vote_average.desc",
        voteCountGte: 200,
        voteAverageGte: 7.5
      })
        .then((titles) => {
          const sorted = [...titles].sort(
            (a, b) => (a.vote_count ?? 0) - (b.vote_count ?? 0)
          );
          setHiddenGems(sorted.slice(0, 20));
        })
        .catch((e) => {
          if (!isTmdb404(e)) console.warn("[useDiscoverFeeds] hiddenGems:", e);
        })
    ];

    // Safety-net: force loading=false after 15 seconds regardless of
    // whether all feeds have settled. This prevents the Discover page
    // from being stuck on a skeleton forever if any underlying fetch
    // hangs (e.g. TMDB unreachable, network timeout, or a bug in
    // cachedFetch that prevents the promise from settling).
    const safetyTimeout = setTimeout(() => {
      console.warn(
        "[useDiscoverFeeds] Global timeout — forcing loading=false after 15s"
      );
      setLoading(false);
    }, 15_000);

    Promise.allSettled(feeds).finally(() => {
      clearTimeout(safetyTimeout);
      setLoading(false);
    });
  };

  onMount(loadAll);

  // REACTIVE: refetch every feed when the user changes their country
  // in Account settings. `defer: true` skips the very first run because
  // onMount already calls loadAll — we only want to react to subsequent
  // changes.
  createEffect(
    on(
      region,
      () => {
        loadAll();
      },
      { defer: true }
    )
  );

  return {
    trending,
    upcoming,
    nowPlaying,
    hiddenGems,
    loading,
    retry: loadAll
  };
}
