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
// Phase 5 Task 8: Removed unused signals `topRatedMovies`, `topRatedTv`,
// `newSeasons`, and `nowPlaying`. These were fetched on every Discover
// page load (4 extra TMDB API calls) but never consumed by
// DiscoverPage.tsx — the page only uses `upcoming`, `loading`, and
// `retry`. Removing them eliminates 4 wasted API calls + 4 wasted
// network round-trips on every Discover page load.

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
  discoverMovies
} from "~/core/tmdb/discover";
import { isTmdb404 } from "~/core/tmdb/tmdb";
import { useDiscoverRegion } from "~/core/config/discoverRegion";

export interface DiscoverFeeds {
  trending: Accessor<TMDBTitle[]>;
  upcoming: Accessor<TMDBTitle[]>;
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
    //
    // Phase 5 Task 8: Removed 4 unused feeds (nowPlaying, topRatedMovies,
    // topRatedTv, newSeasons/onTheAir) — they were fetched but never
    // consumed by DiscoverPage.tsx, wasting 4 TMDB API calls per load.
    const feeds: Promise<unknown>[] = [
      getTrending("all", "week")
        .then((v) => {
          setTrending(v);
        })
        .catch((e) => {
          // Phase 15 QA Bug #3: 404s from TMDB are expected (stale IDs,
          // deleted entries) — silence them. Only warn on real errors.
          if (!isTmdb404(e)) console.warn("[useDiscoverFeeds] trending:", e);
        }),

      getUpcoming(r)
        .then((v) => {
          setUpcoming(v);
        })
        .catch((e) => {
          if (!isTmdb404(e)) console.warn("[useDiscoverFeeds] upcoming:", e);
        }),

      // Hidden gems: high rating, low popularity
      discoverMovies({
        sortBy: "vote_average.desc",
        voteCountGte: 200,
        voteAverageGte: 7.5
      })
        .then((titles) => {
          // Sort by vote_count ascending (lowest count = most "hidden")
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
    hiddenGems,
    loading,
    retry: loadAll
  };
}
