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
// the server). The initial load is gated on `authReady()` via a
// `createEffect` (not `onMount`), so on the server the effect never
// fires (authReady stays false during SSR). The skeleton renders on
// SSR with `loading === true` (the initial signal value), then the
// client takes over and resolves the pick once auth is ready.

import {
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  Accessor
} from "solid-js";
import type {
  TasteProfile,
  SpotlightPick,
  WatchlistItem,
  TMDBTitle
} from "~/shared/types";
import {
  discoverMovies,
  getRecommendations,
  getTopRatedMovies,
  getTrending,
  fetchTitleDirector,
  genreIdFor
} from "~/core/tmdb/discover";
import {
  addSeenTitle,
  isTitleSeen,
  getCachedSpotlight,
  setCachedSpotlight,
  clearCachedSpotlight,
  todayKey,
  getSeenTitles
} from "~/shared/utils/seenTitles";
import { getAuthHeaders } from "~/lib/supabase/session";

interface UseSpotlightArgs {
  taste: Accessor<TasteProfile>;
  vault: Accessor<WatchlistItem[]>;
  /** Current user's uid, or null for guests. Drives per-user localStorage keys. */
  userId: Accessor<string | null>;
  /**
   * True once the initial auth session check has completed (either a
   * session was found OR we confirmed there is none). We must NOT run
   * `loadInitial()` before this flips to true, otherwise `userId()`
   * returns `null` even for signed-in users and the daily cache gets
   * written under the `guest` bucket — which then races with the
   * `onAuthStateChange` callback that may fire later and rewrite the
   * cache under the real uid. The result of that race is exactly the
   * bug the user reported: "every refresh shows a different title"
   * because the cache lookup hits a different bucket each time.
   */
  authReady: Accessor<boolean>;
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
  const vaultKeys = createMemo(() => {
    const set = new Set<string>();
    for (const v of args.vault()) {
      set.add(`${v.media_type}/${v.id}`);
    }
    return set;
  });

  /**
   * Filter a list of TMDB titles down to ones that are eligible for
   * the Spotlight:
   *   1. Has a poster OR backdrop (no faceless cards in the hero).
   *   2. NOT already in the user's vault.
   *   3. NOT seen in the Spotlight in the last 30 days.
   *   4. NOT the current pick (defensive — see note below).
   *
   * The seen-titles check reads from localStorage, so it persists
   * across sessions and is per-user.
   *
   * DEFENSIVE EXCLUSION OF CURRENT PICK:
   *   Even if the seen-titles list fails to persist (localStorage
   *   quota exceeded, private mode, SSR environment without storage,
   *   etc.), the current pick is ALWAYS excluded from the next fetch.
   *   This prevents the "Spotlight shows the same title repeatedly"
   *   bug when the seen list is corrupted — the most common cause of
   *   which is the 3-second safety timer firing before auth resolves
   *   (writing the seen list under the "guest" key) and then auth
   *   resolving later (reading the seen list under the real-uid key,
   *   which is empty).
   */
  const filterEligible = (list: TMDBTitle[]): TMDBTitle[] => {
    const inVault = vaultKeys();
    const uid = args.userId();
    const currentPick = pick();
    const currentKey = currentPick
      ? `${currentPick.title.media_type}/${currentPick.title.id}`
      : null;
    return list.filter((t) => {
      // 1. Must have artwork
      if (!t.poster_path && !t.backdrop_path) return false;
      // 2. Exclude if in vault
      if (inVault.has(`${t.media_type}/${t.id}`)) return false;
      // 3. Exclude if seen in the last 30 days
      if (isTitleSeen(uid, t.media_type, t.id)) return false;
      // 4. Defensive: exclude the current pick even if the seen list
      //    failed to persist. This guarantees the Spotlight never
      //    shows the same title twice in a row.
      if (currentKey === `${t.media_type}/${t.id}`) return false;
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
            taste.seedTitle.id
          );
          const eligible = filterEligible(recs);
          const chosen = pickRandom(eligible);
          if (chosen) {
            const seedName =
              taste.seedTitle.title ||
              taste.seedTitle.name ||
              "what you watched";
            return {
              title: chosen,
              reason: `Because you rated ${seedName} ${taste.seedTitle.rating ?? 9}/10`,
              strategy: "because-you-watched"
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
              voteAverageGte: 7.5
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
                strategy: "hidden-gems"
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
              voteAverageGte: 7
            });
            const eligible = filterEligible(deep);
            const chosen = pickRandom(eligible);
            if (chosen) {
              return {
                title: chosen,
                reason: `A standout ${taste.topGenres[0]} film you haven't added`,
                strategy: "genre-deep-dive"
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
            strategy: "acclaimed-fallback"
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
            strategy: "acclaimed-fallback"
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
    void persistPickToServer(uid, next);
  };

  /**
   * Phase 18 deep fix: persist today's pick to the DB so other browsers
   * signed in as the same user see the same pick. Fire-and-forget —
   * errors are logged but never surface to the user (the localStorage
   * cache is the primary, this is a secondary sync).
   *
   * Phase 18 deep-fix v2: skip the fetch entirely if there's no
   * Authorization header available (session still loading, expired,
   * etc.). This prevents the browser from logging a spurious 401 to
   * the console on every page load. The next render with a valid
   * session will fire the POST and persist the pick.
   */
  const persistPickToServer = async (
    uid: string | null,
    pick: SpotlightPick
  ): Promise<void> => {
    if (!uid) return; // guests have no DB row
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) return; // no session yet — skip silently

      // Include the seen-titles map so other browsers also exclude
      // these titles from future picks. This makes the 30-day no-repeat
      // rule work ACROSS browsers, not just within a single browser.
      const seenMap = getSeenTitles(uid);
      const seen: Record<string, number> = {};
      seenMap.forEach((ts, key) => {
        seen[key] = ts;
      });
      await fetch("/api/discover/spotlight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          date: todayKey(),
          pick,
          seen: Object.keys(seen).length > 0 ? seen : undefined
        })
      });
    } catch (err) {
      // Best-effort — log but don't surface. The localStorage cache is
      // still the primary; this is just cross-browser sync.
      console.warn("[useSpotlight] failed to persist pick to server:", err);
    }
  };

  /**
   * Phase 18 deep fix: read today's pick from the DB. If another
   * browser already generated today's pick, the client reuses it
   * instead of generating a fresh one — this is what makes the
   * Spotlight consistent across browsers signed in as the same user.
   *
   * Returns the cached pick, or null if no pick is cached for today
   * (or the fetch fails — best-effort).
   *
   * Phase 18 deep-fix v2: skip the fetch if there's no Authorization
   * header available. This prevents a spurious 401 console error when
   * the session is still loading. The hook falls back to generating a
   * fresh pick locally; once the session is ready, the next render
   * will hit the DB cache and (if another browser already generated
   * today's pick) replace the local pick with the canonical one.
   */
  const readPickFromServer = async (
    uid: string | null
  ): Promise<SpotlightPick | null> => {
    if (!uid) return null; // guests have no DB row
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) return null; // no session yet — skip silently

      const resp = await fetch("/api/discover/spotlight", {
        headers: {
          Accept: "application/json",
          ...authHeaders
        }
      });
      if (!resp.ok && resp.status !== 404) {
        console.warn(
          "[useSpotlight] server cache read returned",
          resp.status
        );
        return null;
      }
      if (resp.status === 404) return null; // no cached pick for today
      const body = (await resp.json()) as {
        spotlight: {
          date: string;
          pick: SpotlightPick;
          seen?: Record<string, number>;
        } | null;
      };
      const cached = body?.spotlight;
      if (!cached || cached.date !== todayKey()) return null;

      // Merge the seen-titles map from the server into localStorage so
      // the 30-day no-repeat rule is consistent across browsers. We
      // only add entries that aren't already present (we don't
      // overwrite local timestamps — the local map is the source of
      // truth for the local browser's recent activity).
      if (cached.seen && typeof cached.seen === "object") {
        for (const [key, ts] of Object.entries(cached.seen)) {
          if (typeof ts === "number") {
            // Parse the key format "mediaType:tmdbId"
            const sep = key.indexOf(":");
            if (sep > 0) {
              const mediaType = key.slice(0, sep);
              const tmdbId = Number(key.slice(sep + 1));
              if (Number.isFinite(tmdbId) && tmdbId > 0) {
                // Only add if not already seen locally (don't overwrite)
                if (!isTitleSeen(uid, mediaType, tmdbId)) {
                  addSeenTitle(uid, mediaType, tmdbId, ts);
                }
              }
            }
          }
        }
      }

      return cached.pick;
    } catch (err) {
      console.warn("[useSpotlight] server cache read failed:", err);
      return null;
    }
  };

  /**
   * Initial load — runs once on mount.
   *
   * Flow:
   *   1. Check the per-user daily LOCAL cache (localStorage). If today's
   *      pick is cached AND still eligible (not in vault since being
   *      cached), use it directly. This makes a page refresh instant —
   *      no API call.
   *   2. Phase 18 deep fix: if the local cache missed, check the DB
   *      cache (/api/discover/spotlight). Another browser signed in as
   *      the same user may have already generated today's pick — if so,
   *      reuse it so the Spotlight is consistent across browsers. The
   *      DB-cached pick is also validated for vault eligibility.
   *   3. If both caches missed (or were ineligible), fetch a fresh pick
   *      via the strategy chain.
   *   4. If we got a pick, persist it (local cache + seen list + DB).
   *   5. If we didn't, set an error so the UI shows the retry state.
   */
  const loadInitial = async (): Promise<void> => {
    const uid = args.userId();

    // 1. Try the cached daily pick (LOCAL — localStorage)
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

    // 2. Phase 18 deep fix: try the DB cache (cross-browser sync).
    // If another browser generated today's pick, reuse it so the
    // Spotlight is consistent across browsers.
    const serverPick = await readPickFromServer(uid);
    if (serverPick) {
      // Validate the DB-cached pick is still eligible (vault + seen).
      const inVault = vaultKeys();
      const serverKey = `${serverPick.title.media_type}/${serverPick.title.id}`;
      if (!inVault.has(serverKey)) {
        setPick(serverPick);
        // Mirror to the local cache so the next refresh is instant.
        setCachedSpotlight(uid, serverPick);
        setLoading(false);
        return;
      }
      // DB-cached pick is now in vault — invalidate the DB cache by
      // overwriting it with the next fresh pick we generate below.
    }

    // 3. Fetch a fresh pick
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
      setError(
        "We couldn't pick a Spotlight right now. Try again in a moment."
      );
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
      setError(
        "You've seen all our recent recommendations. Check back tomorrow!"
      );
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
      setError(
        "We couldn't pick a Spotlight right now. Try again in a moment."
      );
    }
    setLoading(false);
  };

  // ── Initial load trigger ────────────────────────────────────────────
  //
  // CRITICAL: we wait for `authReady()` to flip true before running
  // `loadInitial()`. If we run it on `onMount` (which fires synchronously
  // after hydration), `user()` is still `null` because the Supabase
  // session check is async — so the cache gets written under the `guest`
  // bucket even for signed-in users. Then on the next refresh, depending
  // on whether Supabase's `onAuthStateChange` fires synchronously or
  // asynchronously, the cache lookup may hit the `guest` bucket OR the
  // real-uid bucket — and that race is exactly what caused the
  // "every refresh shows a different title" bug.
  //
  // By gating on `authReady()`, we guarantee `userId()` is the real uid
  // (or genuinely `null` for guests) when the cache is read + written.
  // The cache key is therefore stable across refreshes for the same
  // user, so the daily rotation actually works.
  //
  // Safety net: if `authReady()` never flips true within 3 seconds
  // (e.g., Supabase is unreachable on a flaky network, or the auth
  // listener failed to register), we fall back to loading with whatever
  // `userId()` we have at that point. Better to show a fresh pick than
  // to leave the skeleton up forever.
  //
  // RACE CONDITION FIX:
  //   If the safety timer fires BEFORE auth resolves, `loadInitial`
  //   runs with uid=null (guest). The cache + seen list get written
  //   under the "guest" key. Then when auth resolves with the real uid,
  //   we need to RE-RUN `loadInitial` with the correct uid — otherwise
  //   the seen list is empty for the real user, and the same title can
  //   be picked again the next day.
  //
  //   We track `lastUid` (the uid that `loadInitial` last ran with).
  //   When `userId()` changes from null to a real uid (or vice versa),
  //   we re-run `loadInitial` with the new uid. This handles:
  //     1. Safety timer fires with uid=null → auth resolves → re-run
  //     2. User signs in mid-session → re-run for the new user
  //     3. User signs out mid-session → re-run for guest
  //
  // `createEffect` is used (instead of `onMount`) so we can reactively
  // wait for `authReady()` AND react to `userId()` changes.
  let didInit = false;
  let lastUid: string | null | undefined = undefined;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    // Wait for auth to be ready before doing anything.
    if (!args.authReady()) return;
    const currentUid = args.userId();

    if (lastUid === undefined) {
      // First load — auth just resolved (or safety timer already fired).
      // Run loadInitial with the current uid.
      lastUid = currentUid;
      didInit = true;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      void loadInitial();
    } else if (currentUid !== lastUid) {
      // userId changed after the initial load. This happens when:
      //   1. The safety timer fired with uid=null (auth was slow), and
      //      then auth resolved with a real uid.
      //   2. The user signed in/out mid-session.
      // Re-run loadInitial so the cache + seen list use the correct key.
      // Without this, the seen list for the real user would be empty,
      // and the same title could be picked again the next day.
      lastUid = currentUid;
      void loadInitial();
    }
  });

  // Safety-net: force-load after 3s even if authReady hasn't resolved.
  // This prevents the Spotlight from being stuck on the skeleton forever
  // if the Supabase client fails to initialize.
  safetyTimer = setTimeout(() => {
    if (!didInit) {
      console.warn(
        "[useSpotlight] authReady did not resolve within 3s — forcing load with current userId"
      );
      didInit = true;
      lastUid = args.userId(); // capture current uid (likely null)
      void loadInitial();
    }
  }, 3000);

  onCleanup(() => {
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  });

  return {
    pick,
    loading,
    error,
    shuffle,
    retry,
    /** Resolve a director name for a Spotlight pick (lazy, best-effort) */
    resolveDirector: (title: TMDBTitle) =>
      fetchTitleDirector(title.media_type, title.id)
  };
}
