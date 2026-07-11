// src/features/discover/hooks/useDiscoverFeeds.ts
//
// useDiscoverFeeds — fetches all TMDB feeds for the Discover page in parallel.
//
// All feeds use the existing apiCache layer — no duplicate requests.
// Each feed is independent: if one fails, the others still load.
// The page renders each section as its data arrives (no blocking).

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
  GENRE_ID,
} from "~/core/tmdb/discover";

export interface DiscoverFeeds {
  trending: Accessor<TMDBTitle[]>;
  nowPlaying: Accessor<TMDBTitle[]>;
  upcoming: Accessor<TMDBTitle[]>;
  topRatedMovies: Accessor<TMDBTitle[]>;
  topRatedTv: Accessor<TMDBTitle[]>;
  newSeasons: Accessor<TMDBTitle[]>;
  hiddenGems: Accessor<TMDBTitle[]>;
  loading: Accessor<boolean>;
}

export function useDiscoverFeeds(region = "IN"): DiscoverFeeds {
  const [trending, setTrending] = createSignal<TMDBTitle[]>([]);
  const [nowPlaying, setNowPlaying] = createSignal<TMDBTitle[]>([]);
  const [upcoming, setUpcoming] = createSignal<TMDBTitle[]>([]);
  const [topRatedMovies, setTopRatedMovies] = createSignal<TMDBTitle[]>([]);
  const [topRatedTv, setTopRatedTv] = createSignal<TMDBTitle[]>([]);
  const [newSeasons, setNewSeasons] = createSignal<TMDBTitle[]>([]);
  const [hiddenGems, setHiddenGems] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);

  onMount(() => {
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
          // TMDBTitle doesn't have popularity but has vote_count via TMDB
          const sorted = [...titles].sort(
            (a, b) => (a.vote_count ?? 0) - (b.vote_count ?? 0)
          );
          setHiddenGems(sorted.slice(0, 20));
        })
        .catch((e) => console.error("[useDiscoverFeeds] hiddenGems:", e)),
    ];

    Promise.allSettled(feeds).finally(() => setLoading(false));
  });

  return {
    trending,
    nowPlaying,
    upcoming,
    topRatedMovies,
    topRatedTv,
    newSeasons,
    hiddenGems,
    loading,
  };
}
