// src/features/discover/hooks/useSpotlight.ts
//
// useSpotlight — picks ONE title to feature in the Spotlight fold.
// -----------------------------------------------------------------
// REWRITE (Personalized-Discovery v3):
//   • Daily rotation — caches today's pick per user; a page refresh
//     restores the same pick until the day rolls over. No flash of
//     "Try again" on reload — the skeleton renders until the cached
//     pick rehydrates (synchronously on the client).
//   • 30-day no-repeat — every shown/skipped title is recorded in
//     localStorage; the fetcher filters them out of every candidate
//     list. After 30 days a title becomes eligible again.
//   • Taste-based — the strategy chain (because-you-watched →
//     hidden-gems → genre-deep-dive → acclaimed-fallback → trending)
//     is unchanged from v2, but each list is now filtered by the
//     seen-titles map before a random pick is chosen.
//   • Vault exclusion — every candidate list is also filtered by the
//     user's vault, so the Spotlight never shows a title the user
//     already has.
//   • Shuffle — `shuffle()` adds the current pick to the seen list
//     (so it won't reappear for 30 days) and fetches a new pick. The
//     new pick replaces today's cached pick, so a refresh after a
//     shuffle keeps the new pick (not the original).
//   • True randomness — picks are chosen with `Math.random()` instead
//     of the previous deterministic index. This means the same user
//     on the same day with the same taste WOULD get different picks
//     across two fresh loads (no cached pick). Once a pick is cached
//     for the day, it stays until the day rolls over or the user
//     shuffles.
//
// STRATEGY CHAIN (first non-empty wins):
//   1. because-you-watched — recommendations from the user's seed title
//   2. hidden-gems — high-rated, low-popularity in their top genre
//   3. genre-deep-dive — broader discover in their top genre
//   4. acclaimed-fallback — TMDB top-rated (also used for cold start / guest)
//   5. trending — last resort, /trending/all/week
//
// SSR safety: all reads/writes to localStorage go through the
// `seenTitles` utility which is SSR-safe (returns safe defaults on
// the server). `onMount` only runs on the client, so the initial
// fetch never fires during SSR. The skeleton renders on SSR with
// `loading === true` (the initial signal value).

import { createSignal, createMemo, onMount, Accessor } from "solid-js";
import type { TasteProfile, SpotlightPick, WatchlistItem, TMDBTitle } from "~/shared/types";
import {
  discoverMovies,
  getRecommendations,
  getTopRatedMovies,
  getTrending,
  fetchTitleDirector,
  genreIdFor,
} from "~/core/tmdb/discover";
import {
  addSeenTitle,
  isTitleSeen,
  getCachedSpotlight,
  setCachedSpotlight,
  clearCachedSpotlight,
  todayKey,
} from "~/shared/utils/seenTitles";

interface UseSpotlightArgs {
  taste: Accessor<TasteProfile>;
  vault: Accessor<WatchlistItem[]>;
  /** Current user's uid, or null for guests. Drives per-user localStorage keys. */
  userId: Accessor<string | null>;
}

/**
 * useSpotlight — the personalized daily-rotating Spotlight picker.
 *
 * Returns:
 *   • pick     — the current SpotlightPick, or null if none yet.
 *   • loading  — true during the initial fetch (and during a shuffle).
 *   • error    — a human-readable error string, or null. Shown with a
 *                retry button in the UI when the fetcher fails to find
 *                ANY eligible title (e.g. all candidates are in the
 *                vault or seen in the last 30 days).
 *   • shuffle  — record the current pick as seen + fetch a new one.
 *   • retry    — re-run the fetcher (used by the error-state retry btn).
 *   • resolveDirector — best-effort lazy fetch of a director name for a
 *                       Spotlight pick (used by the UI to show the
 *                       director pill if one is available).
 */
export function useSpotlight(args: UseSpotlightArgs) {
  const [pick, setPick] = createSignal<SpotlightPick | null>(null);
  // `loading` starts TRUE so SSR renders the skeleton, not the error
  // fallback. Once the client mounts and the cached/fresh pick is set,
  // loading flips to false. This eliminates the brief "Try again"
  // flash the user used to see on initial load.
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  /** Set of "{mediaType}/{tmdbId}" keys for every title in the vault. */
  const vaultKeys = createMemo(
    () => new Set(args.vault().map((m) => `${m.media_type}/${m.id}`)),
  );

  /**
   * Filter a list of TMDB titles down to ones that are eligible for
   * the Spotlight:
   *   1. Has a poster OR backdrop (no faceless cards in the hero).
   *   2. NOT already in the user's vault.
   *   3. NOT seen in the Spotlight in the last 30 days.
   *
   * The seen-titles check reads from localStorage, so it persists
   * across sessions and is per-user.
   */
  const filterEligible = (list: TMDBTitle[]): TMDBTitle[] => {
    const inVault = vaultKeys();
    const uid = args.userId();
    return list.filter((t) => {
      // 1. Must have artwork
      if (!t.poster_path && !t.backdrop_path) return false;
      // 2. Exclude if in vault
      if (inVault.has(`${t.media_type}/${t.id}`)) return false;
      // 3. Exclude if seen in the last 30 days
      if (isTitleSeen(uid, t.media_type, t.id)) return false;
      return true;
    });
  };

  /**
   * Pick a random title from a list. We use Math.random() rather than
   * a deterministic hash so the same user on the same day with the
   * same taste gets a different pick across sessions (until the pick
   * is cached for the day).
   */
  const pickRandom = (list: TMDBTitle[]): TMDBTitle | null => {
    if (list.length === 0) return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  };

  /**
   * The strategy-chain fetcher. Walks the strategies in order; the
   * first one that yields an eligible title wins.
   *
   * Each strategy:
   *   1. Fetches a candidate list from TMDB.
   *   2. Filters it down to eligible titles (vault + seen + artwork).
   *   3. Picks one at random.
   *   4. Returns it as a SpotlightPick with the strategy + reason.
   *
   * If a strategy's TMDB call fails, we silently fall through to the
   * next strategy — a single failed endpoint never breaks the
   * Spotlight.
   */
  const fetchSpotlight = async (): Promise<SpotlightPick | null> => {
    try {
      const taste = args.taste();

      // 1. because-you-watched — needs a seed title
      if (taste.seedTitle) {
        try {
          const recs = await getRecommendations(
            taste.seedTitle.media_type,
            taste.seedTitle.id,
          );
          const eligible = filterEligible(recs);
          const chosen = pickRandom(eligible);
          if (chosen) {
            const seedName = taste.seedTitle.title || taste.seedTitle.name || "what you watched";
            return {
              title: chosen,
              reason: `Because you rated ${seedName} ${taste.seedTitle.rating ?? 9}/10`,
              strategy: "because-you-watched",
            };
          }
        } catch {
          // fall through to next strategy
        }
      }

      // 2. hidden-gems — high rating, low popularity, top genre
      if (taste.topGenres.length > 0) {
        try {
          const genreId = genreIdFor(taste.topGenres[0], "movie");
          if (genreId) {
            const gems = await discoverMovies({
              withGenres: [genreId],
              sortBy: "vote_average.desc",
              voteCountGte: 200,
              voteAverageGte: 7.5,
            });
            // Filter to vote_count < 3000 to find the "hidden" ones
            const hidden = gems.filter((t) => (t.vote_count ?? 0) < 3000);
            const pool = hidden.length >= 3 ? hidden : gems;
            const eligible = filterEligible(pool);
            const chosen = pickRandom(eligible);
            if (chosen) {
              return {
                title: chosen,
                reason: `A hidden gem in your favorite genre — ${taste.topGenres[0]}`,
                strategy: "hidden-gems",
              };
            }
          }
        } catch {
          // fall through
        }
      }

      // 3. genre-deep-dive — broader discover in top genre
      if (taste.topGenres.length > 0) {
        try {
          const genreId = genreIdFor(taste.topGenres[0], "movie");
          if (genreId) {
            const deep = await discoverMovies({
              withGenres: [genreId],
              sortBy: "popularity.desc",
              voteCountGte: 500,
              voteAverageGte: 7,
            });
            const eligible = filterEligible(deep);
            const chosen = pickRandom(eligible);
            if (chosen) {
              return {
                title: chosen,
                reason: `A standout ${taste.topGenres[0]} film you haven't added`,
                strategy: "genre-deep-dive",
              };
            }
          }
        } catch {
          // fall through
        }
      }

      // 4. acclaimed-fallback — TMDB top-rated (works for cold start too)
      try {
        const top = await getTopRatedMovies();
        const eligible = filterEligible(top);
        const chosen = pickRandom(eligible);
        if (chosen) {
          return {
            title: chosen,
            reason: taste.isColdStart
              ? "A universally acclaimed film"
              : "A universally acclaimed film you haven't seen",
            strategy: "acclaimed-fallback",
          };
        }
      } catch {
        // last resort failed — fall through to trending
      }

      // 5. trending — last resort, /trending/all/week
      try {
        const trending = await getTrending("all", "week");
        const eligible = filterEligible(trending);
        const chosen = pickRandom(eligible);
        if (chosen) {
          return {
            title: chosen,
            reason: "Trending this week",
            strategy: "acclaimed-fallback",
          };
        }
      } catch {
        // truly nothing — return null (UI shows error + retry)
      }

      return null;
    } catch (err) {
      // Top-level catch — return null on any uncaught error to prevent
      // unhandled rejections that crash the SSR server.
      console.warn("[useSpotlight] fetcher error:", err);
      return null;
    }
  };

  /**
   * Persist a freshly-fetched pick to localStorage:
   *   • Cache it as today's pick (so a refresh restores it).
   *   • Add it to the seen-titles map (so it won't repeat for 30 days).
   *
   * Called after both the initial fetch and a shuffle.
   */
  const persistPick = (next: SpotlightPick): void => {
    const uid = args.userId();
    setCachedSpotlight(uid, next);
    addSeenTitle(uid, next.title.media_type, next.title.id);
  };

  /**
   * Initial load — runs once on mount.
   *
   * Flow:
   *   1. Check the per-user daily cache. If today's pick is cached
   *      AND still eligible (not in vault since being cached), use it
   *      directly. This makes a page refresh instant — no API call.
   *   2. Otherwise, fetch a fresh pick via the strategy chain.
   *   3. If we got a pick, persist it (cache + seen list).
   *   4. If we didn't, set an error so the UI shows the retry state.
   */
  const loadInitial = async (): Promise<void> => {
    const uid = args.userId();

    // 1. Try the cached daily pick
    const cached = getCachedSpotlight(uid);
    if (cached && cached.date === todayKey()) {
      // Validate the cached pick is still eligible (the user may have
      // added it to their vault since it was cached).
      const inVault = vaultKeys();
      const cacheKey = `${cached.pick.title.media_type}/${cached.pick.title.id}`;
      if (!inVault.has(cacheKey)) {
        setPick(cached.pick);
        setLoading(false);
        return;
      }
      // Cached pick is now in vault — invalidate + fall through to fetch
      clearCachedSpotlight(uid);
    }

    // 2. Fetch a fresh pick
    setLoading(true);
    setError(null);
    const fresh = await fetchSpotlight();

    if (fresh) {
      setPick(fresh);
      persistPick(fresh);
      setError(null);
    } else {
      // Every strategy returned nothing — the user has either seen
      // every eligible title in the last 30 days, or every candidate
      // is in their vault. Show the empty-state retry message.
      setError("We couldn't pick a Spotlight right now. Try again in a moment.");
    }
    setLoading(false);
  };

  /**
   * Shuffle — record the current pick as seen and fetch a new one.
   *
   * The current pick is added to the seen-titles map (30-day cooldown)
   * BEFORE the fetch, so the new fetcher's `filterEligible` call will
   * exclude it. The daily cache is cleared so the next pick becomes
   * today's cached pick.
   *
   * If the fetcher can't find a new eligible pick (e.g. the user has
   * shuffled through everything), we keep the current pick visible
   * and show an error toast / message.
   */
  const shuffle = async (): Promise<void> => {
    const current = pick();
    const uid = args.userId();

    // Record the current pick as seen BEFORE fetching the next one.
    if (current) {
      addSeenTitle(uid, current.title.media_type, current.title.id);
    }

    // Clear the daily cache so the new pick replaces it.
    clearCachedSpotlight(uid);

    setLoading(true);
    setError(null);

    const next = await fetchSpotlight();

    if (next) {
      setPick(next);
      persistPick(next);
    } else {
      // Couldn't find a new pick — restore the cached one if we still
      // have it, and surface a friendly message.
      if (current) {
        setPick(current);
        // Re-cache the current pick since we cleared it above
        setCachedSpotlight(uid, current);
      }
      setError("You've seen all our recent recommendations. Check back tomorrow!");
    }
    setLoading(false);
  };

  /**
   * Retry — re-run the fetcher after an error. Unlike shuffle, this
   * does NOT add the current pick to the seen list (there may not be
   * one anyway). It just tries the fetch again.
   */
  const retry = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const fresh = await fetchSpotlight();
    if (fresh) {
      setPick(fresh);
      persistPick(fresh);
    } else {
      setError("We couldn't pick a Spotlight right now. Try again in a moment.");
    }
    setLoading(false);
  };

  // Mount: kick off the initial load. onMount only runs on the client,
  // so this never fires during SSR. The skeleton renders on SSR with
  // loading=true, then the client takes over and resolves the pick.
  onMount(() => {
    void loadInitial();
  });

  return {
    pick,
    loading,
    error,
    shuffle,
    retry,
    /** Resolve a director name for a Spotlight pick (lazy, best-effort) */
    resolveDirector: (title: TMDBTitle) => fetchTitleDirector(title.media_type, title.id),
  };
}
