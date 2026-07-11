// src/features/discover/hooks/useDiscoverFeeds.ts
//
// useDiscoverFeeds — fetches all TMDB feeds for the Discover page in parallel.
//
// All feeds use the existing apiCache layer — no duplicate requests.
// Each feed is independent: if one fails, the others still load.
// The page renders each section as its data arrives (no blocking).
//
// REGION: defaults to `getDiscoverRegion()` (the single source of truth).
// Callers can override the region explicitly (e.g. for tests), but in
// production every Discover section should thread the same region value
// through this hook so future Settings → region switches propagate
// automatically.

import { createSignal, onMount, type Accessor } from "solid-js";
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
import { getDiscoverRegion } from "~/core/config/discoverRegion";

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

export function useDiscoverFeeds(region: string = getDiscoverRegion()): DiscoverFeeds {
  const [trending, setTrending] = createSignal<TMDBTitle[]>([]);
  const [nowPlaying, setNowPlaying] = createSignal<TMDBTitle[]>([]);
  const [upcoming, setUpcoming] = createSignal<TMDBTitle[]>([]);
  const [topRatedMovies, setTopRatedMovies] = createSignal<TMDBTitle[]>([]);
  const [topRatedTv, setTopRatedTv] = createSignal<TMDBTitle[]>([]);
  const [newSeasons, setNewSeasons] = createSignal<TMDBTitle[]>([]);
  const [hiddenGems, setHiddenGems] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);

  const loadAll = () => {
    if (isServer) return;
    setLoading(true);

    // Fetch all feeds in parallel. Each is independent — failures don't
    // affect other feeds. All use cachedFetch so repeated visits are instant.
    const feeds: Promise<unknown>[] = [
      getTrending("all", "week")
        .then((v) => { setTrending(v); })
        .catch((e) => console.error("[useDiscoverFeeds] trending:", e)),

      getNowPlaying(region)
        .then((v) => { setNowPlaying(v); })
        .catch((e) => console.error("[useDiscoverFeeds] nowPlaying:", e)),

      getUpcoming(region)
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

    Promise.allSettled(feeds).finally(() => setLoading(false));
  };

  onMount(loadAll);

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
