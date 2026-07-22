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

import { createSignal, onMount, on, createEffect, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";
import type { TMDBTitle } from "~/shared/types";
import {
  getTrending,
  getNowPlaying,
  getUpcoming,
  getTopRatedMovies,
  getTopRatedTv,
  getOnTheAir,
  discoverMovies,
} from "~/core/tmdb/discover";
import { useDiscoverRegion } from "~/core/config/discoverRegion";

export interface DiscoverFeeds {
  trending: Accessor<TMDBTitle[]>;
  nowPlaying: Accessor<TMDBTitle[]>;
  upcoming: Accessor<TMDBTitle[]>;
  topRatedMovies: Accessor<TMDBTitle[]>;
  topRatedTv: Accessor<TMDBTitle[]>;
  newSeasons: Accessor<TMDBTitle[]>;
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
  regionOverride?: Accessor<string>,
): DiscoverFeeds {
  const defaultRegion = useDiscoverRegion();
  const region = regionOverride ?? defaultRegion;

  const [trending, setTrending] = createSignal<TMDBTitle[]>([]);
  const [nowPlaying, setNowPlaying] = createSignal<TMDBTitle[]>([]);
  const [upcoming, setUpcoming] = createSignal<TMDBTitle[]>([]);
  const [topRatedMovies, setTopRatedMovies] = createSignal<TMDBTitle[]>([]);
  const [topRatedTv, setTopRatedTv] = createSignal<TMDBTitle[]>([]);
  const [newSeasons, setNewSeasons] = createSignal<TMDBTitle[]>([]);
  const [hiddenGems, setHiddenGems] = createSignal<TMDBTitle[]>([]);
  // Start loading as true so the skeleton shows immediately on first render.
  // Previously started as false, which caused a brief flash of empty content
  // before onMount fired and set loading to true.
  const [loading, setLoading] = createSignal(true);

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
        .then((v) => { setTrending(v); })
        .catch((e) => console.error("[useDiscoverFeeds] trending:", e)),

      getNowPlaying(r)
        .then((v) => { setNowPlaying(v); })
        .catch((e) => console.error("[useDiscoverFeeds] nowPlaying:", e)),

      getUpcoming(r)
        .then((v) => { setUpcoming(v); })
        .catch((e) => console.error("[useDiscoverFeeds] upcoming:", e)),

      getTopRatedMovies()
        .then((v) => { setTopRatedMovies(v); })
        .catch((e) => console.error("[useDiscoverFeeds] topRatedMovies:", e)),

      getTopRatedTv()
        .then((v) => { setTopRatedTv(v); })
        .catch((e) => console.error("[useDiscoverFeeds] topRatedTv:", e)),

      getOnTheAir()
        .then((v) => { setNewSeasons(v); })
        .catch((e) => console.error("[useDiscoverFeeds] onTheAir:", e)),

      // Hidden gems: high rating, low popularity
      discoverMovies({
        sortBy: "vote_average.desc",
        voteCountGte: 200,
        voteAverageGte: 7.5,
      })
        .then((titles) => {
          // Sort by vote_count ascending (lowest count = most "hidden")
          const sorted = [...titles].sort(
            (a, b) => (a.vote_count ?? 0) - (b.vote_count ?? 0)
          );
          setHiddenGems(sorted.slice(0, 20));
        })
        .catch((e) => console.error("[useDiscoverFeeds] hiddenGems:", e)),
    ];

    // All feeds use cachedFetch which has proper in-memory caching and
    // the underlying TMDB requests have AbortController timeouts (10s).
    // Promise.allSettled ensures loading becomes false even if some
    // feeds reject — no global safety-net timeout needed.
    Promise.allSettled(feeds).finally(() => {
      setLoading(false);
    });
  };

  onMount(loadAll);

  // REACTIVE: refetch every feed when the user changes their country
  // in Account settings. `defer: true` skips the very first run because
  // onMount already calls loadAll — we only want to react to subsequent
  // changes.
  createEffect(on(region, () => { loadAll(); }, { defer: true }));

  return {
    trending,
    nowPlaying,
    upcoming,
    topRatedMovies,
    topRatedTv,
    newSeasons,
    hiddenGems,
    loading,
    retry: loadAll,
  };
}
