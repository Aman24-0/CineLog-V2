// src/features/discover/hooks/useSpotlight.ts
//
// useSpotlight — picks ONE title to feature in the Spotlight fold.
//
// Strategy chain (first non-empty wins):
//   1. because-you-watched — recommendations from the user's seed title
//   2. hidden-gems — high-rated, low-popularity in their top genre
//   3. continue-franchise — next missing entry in an active franchise
//   4. directors-you-love — discover by a top director's name (via TMDB search)
//   5. genre-deep-dive — discover in their top genre
//   6. acclaimed-fallback — TMDB top-rated (also used for cold start / guest)
//
// CRITICAL DESIGN CHOICE: This hook uses createSignal + createEffect instead
// of createResource. This is intentional — createResource is tracked by
// SolidJS's <Suspense> boundary, which means the outer Suspense in app.tsx
// would block the ENTIRE DiscoverPage from rendering until this Spotlight
// fetcher resolves (which can take 5-10 seconds trying multiple strategies).
// By using manual signals instead, the Spotlight's async fetch is NOT tracked
// by any Suspense, so the page renders immediately and Spotlight shows its
// own loading state independently.
//
// The `reason` field is the human-readable "Because you…" sentence. It is
// template-generated today; an LLM can replace it later without changing
// the contract.
//
// Re-rolls: when taste, excludeId, or seed change, the createEffect
// re-fires the fetcher automatically. The fetcher is guarded by an
// isFetching flag to prevent concurrent duplicate fetches.

import { createSignal, createMemo, createEffect, on, Accessor } from "solid-js";
import type { TasteProfile, SpotlightPick, WatchlistItem, TMDBTitle } from "~/shared/types";
import {
  discoverMovies,
  getRecommendations,
  getTopRatedMovies,
  fetchTitleDirector,
  genreIdFor
} from "~/core/tmdb/discover";

interface UseSpotlightArgs {
  taste: Accessor<TasteProfile>;
  vault: Accessor<WatchlistItem[]>;
  /** id to exclude (the previous pick, so re-rolls don't repeat) */
  excludeId: Accessor<number | null>;
  /** re-roll seed — bumps to force a new pick */
  seed: Accessor<number>;
}

export function useSpotlight(args: UseSpotlightArgs) {
  // Build a stable signature for the taste so the fetcher recomputes
  // only when the actual taste signal changes (not on every vault tick).
  const tasteSignature = createMemo(() => {
    const t = args.taste();
    return JSON.stringify({
      g: t.topGenres,
      d: t.topDirectors.map((d) => d.name),
      f: t.activeFranchises.map((f) => f.name),
      s: t.seedTitle?.id ?? null,
      cold: t.isColdStart
    });
  });

  const vaultIds = createMemo(() => new Set(args.vault().map((m) => String(m.id))));

  const excludeSet = createMemo(() => {
    const s = new Set<string>();
    const id = args.excludeId();
    if (id != null) s.add(String(id));
    return s;
  });

  // ── Manual signals instead of createResource ──────────────────────
  // Using createSignal + createEffect avoids Suspense tracking, which
  // prevents the outer Suspense in app.tsx from blocking the entire
  // DiscoverPage until Spotlight resolves.
  const [pick, setPick] = createSignal<SpotlightPick | null>(null);
  const [loading, setLoading] = createSignal(true); // Start as true for immediate skeleton

  let isFetching = false;

  const fetchSpotlight = async () => {
    if (isFetching) return;
    isFetching = true;
    setLoading(true);

    try {
      const taste = args.taste();
      const inVault = vaultIds();
      const exclude = excludeSet();

      // Helper: filter out vault + excluded titles, pick a deterministic-ish
      // index from the seed so re-rolls rotate through the list.
      const pickFromList = (list: TMDBTitle[], strategy: SpotlightPick["strategy"], reason: string): SpotlightPick | null => {
        const filtered = list.filter(
          (t) => !inVault.has(String(t.id)) && !exclude.has(String(t.id)) && (t.poster_path || t.backdrop_path)
        );
        if (filtered.length === 0) return null;
        const idx = Math.abs(args.seed() | 0) % filtered.length;
        return { title: filtered[idx], reason, strategy };
      };

      // 1. because-you-watched — needs a seed title
      if (taste.seedTitle) {
        try {
          const recs = await getRecommendations(
            taste.seedTitle.media_type,
            taste.seedTitle.id
          );
          const seedName = taste.seedTitle.title || taste.seedTitle.name || "what you watched";
          const pickResult = pickFromList(
            recs,
            "because-you-watched",
            `Because you rated ${seedName} ${taste.seedTitle.rating ?? 9}/10`
          );
          if (pickResult) { setPick(pickResult); return; }
        } catch (e) {
          // fall through to next strategy
        }
      }

      // 2. hidden-gems — high rating, low popularity, in user's top genre
      //    (vote_count between 200-3000 = acclaimed but not blockbuster)
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
            const pickResult = pickFromList(
              pool,
              "hidden-gems",
              `A hidden gem in your favorite genre — ${taste.topGenres[0]}`
            );
            if (pickResult) { setPick(pickResult); return; }
          }
        } catch (e) {
          // fall through
        }
      }

      // 3. continue-franchise — search for missing franchise entries
      //    (skipped for Spotlight — Trajectory fold handles it better)

      // 4. directors-you-love — discover by director name via search
      //    (skipped for Spotlight — Trajectory fold handles it better)

      // 5. genre-deep-dive — broader discover in top genre
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
            const pickResult = pickFromList(
              deep,
              "genre-deep-dive",
              `A standout ${taste.topGenres[0]} film you haven't added`
            );
            if (pickResult) { setPick(pickResult); return; }
          }
        } catch (e) {
          // fall through
        }
      }

      // 6. acclaimed-fallback — TMDB top-rated (works for cold start too)
      try {
        const top = await getTopRatedMovies();
        const pickResult = pickFromList(
          top,
          "acclaimed-fallback",
          taste.isColdStart
            ? "A universally acclaimed film"
            : "A universally acclaimed film you haven't seen"
        );
        if (pickResult) { setPick(pickResult); return; }
      } catch (e) {
        // last resort failed — set pick to null (UI shows error)
      }

      // All strategies failed — set pick to null
      setPick(null);
    } catch (e) {
      // Top-level catch — return null on any uncaught error
      console.warn("[useSpotlight] fetcher error:", e);
      setPick(null);
    } finally {
      setLoading(false);
      isFetching = false;
    }
  };

  // Reactively re-fetch when taste, excludeId, or seed change.
  // The effect runs immediately on first mount (no defer), then
  // on subsequent changes.
  createEffect(on(tasteSignature, () => { fetchSpotlight(); }));
  // Also re-fetch when excludeId or seed change (for re-rolls).
  createEffect(on(args.excludeId, () => { fetchSpotlight(); }, { defer: true }));
  createEffect(on(args.seed, () => { fetchSpotlight(); }, { defer: true }));

  return {
    pick,
    loading,
    /** Resolve a director name for a Spotlight pick (lazy, best-effort) */
    resolveDirector: (title: TMDBTitle) => fetchTitleDirector(title.media_type, title.id)
  };
}
