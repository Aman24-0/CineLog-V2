// src/features/discover/hooks/useCosmos.ts
import { createResource, createMemo, Accessor } from "solid-js";
import type {TasteProfile, CosmosCluster} from "~/shared/types";
import {
  discoverMovies,
  discoverTv,
  getTrending,
  getTopRatedMovies,
  genreIdFor
} from "~/core/tmdb/discover";

interface UseCosmosArgs {
  taste: Accessor<TasteProfile>;
}

/**
 * useCosmos — builds the ambient browse clusters for Fold 3.
 *
 * The Cosmos is intentionally experimental. It reframes TMDB category
 * data as "the wider universe around your taste". Each cluster has a
 * theme + hook + items, and the user can tap to expand.
 *
 * Initial clusters:
 *   - "What the world is watching" — trending this week (movie + tv)
 *   - "Universally acclaimed"     — TMDB top-rated movies
 *   - One genre cluster from the user's top genre (if available)
 *   - One genre cluster from a genre the user HASN'T explored (contrast)
 *
 * The architecture is open: future versions can swap in LLM-generated
 * themes ("Quiet sci-fi that lingers", "Films about grief that aren't
 * manipulative") by adding builders here. The CosmosCluster contract
 * doesn't care where the theme string comes from.
 */
export function useCosmos(args: UseCosmosArgs) {
  const tasteSig = createMemo(() => {
    const t = args.taste();
    return JSON.stringify({ g: t.topGenres, cold: t.isColdStart });
  });

  const fetcher = async (): Promise<CosmosCluster[]> => {
    const taste = args.taste();
    const out: CosmosCluster[] = [];

    // 1. What the world is watching — trending this week
    try {
      const trending = await getTrending("all", "week");
      if (trending.length > 0) {
        out.push({
          id: "trending-week",
          theme: "What the world is watching",
          icon: "public",
          hook: "Trending across the globe this week",
          items: trending.slice(0, 12)
        });
      }
    } catch (e) { /* skip */ }

    // 2. Universally acclaimed — TMDB top-rated
    try {
      const top = await getTopRatedMovies();
      if (top.length > 0) {
        out.push({
          id: "acclaimed",
          theme: "Universally acclaimed",
          icon: "emoji_events",
          hook: "The highest-rated films of all time",
          items: top.slice(0, 12)
        });
      }
    } catch (e) { /* skip */ }

    // 3. Genre cluster — user's top genre (if available)
    if (taste.topGenres.length > 0) {
      try {
        const genreId = genreIdFor(taste.topGenres[0], "movie");
        if (genreId) {
          const list = await discoverMovies({
            withGenres: [genreId],
            sortBy: "popularity.desc",
            voteCountGte: 1000,
            voteAverageGte: 7
          });
          if (list.length > 0) {
            out.push({
              id: `genre-${taste.topGenres[0].toLowerCase()}`,
              theme: `More ${taste.topGenres[0]}`,
              icon: "movie_filter",
              hook: `The ${taste.topGenres[0].toLowerCase()} universe, expanded`,
              items: list.slice(0, 12)
            });
          }
        }
      } catch (e) { /* skip */ }
    }

    // 4. Contrast cluster — a genre the user hasn't explored much
    //    Pick a "complementary" genre based on their top genre.
    if (taste.topGenres.length > 0) {
      const contrasts: Record<string, string> = {
        "Sci-Fi": "Drama",
        "Drama": "Sci-Fi",
        "Action": "Documentary",
        "Comedy": "Thriller",
        "Thriller": "Comedy",
        "Horror": "Romance",
        "Romance": "Horror",
        "Animation": "Crime",
        "Crime": "Animation",
        "Documentary": "Action"
      };
      const contrast = contrasts[taste.topGenres[0]];
      if (contrast) {
        try {
          const genreId = genreIdFor(contrast, "movie");
          if (genreId) {
            const list = await discoverMovies({
              withGenres: [genreId],
              sortBy: "vote_average.desc",
              voteCountGte: 500,
              voteAverageGte: 7.5
            });
            if (list.length > 0) {
              out.push({
                id: `contrast-${contrast.toLowerCase()}`,
                theme: `Step outside — ${contrast}`,
                icon: "explore",
                hook: `A genre you haven't mined yet`,
                items: list.slice(0, 12)
              });
            }
          }
        } catch (e) { /* skip */ }
      }
    }

    // 5. TV cluster — for variety, even movie-heavy users
    try {
      const tv = await discoverTv({
        sortBy: "popularity.desc",
        voteCountGte: 100,
        voteAverageGte: 7.5
      });
      if (tv.length > 0) {
        out.push({
          id: "tv-acclaimed",
          theme: "Acclaimed series",
          icon: "tv",
          hook: "Television worth your time",
          items: tv.slice(0, 12)
        });
      }
    } catch (e) { /* skip */ }

    return out;
  };

  const [clusters] = createResource(tasteSig, fetcher);

  return { clusters };
}
