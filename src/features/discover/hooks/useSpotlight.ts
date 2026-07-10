// src/features/discover/hooks/useSpotlight.ts
import { createResource, createMemo, Accessor } from "solid-js";
import type { TasteProfile, SpotlightPick, WatchlistItem, TMDBTitle } from "~/shared/types";
import {
  discoverMovies,
  discoverTv,
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

/**
 * useSpotlight — picks ONE title to feature in the Spotlight fold.
 *
 * Strategy chain (first non-empty wins):
 *   1. because-you-watched — recommendations from the user's seed title
 *   2. hidden-gems — high-rated, low-popularity in their top genre
 *   3. continue-franchise — next missing entry in an active franchise
 *   4. directors-you-love — discover by a top director's name (via TMDB search)
 *   5. genre-deep-dive — discover in their top genre
 *   6. acclaimed-fallback — TMDB top-rated (also used for cold start / guest)
 *
 * The `reason` field is the human-readable "Because you…" sentence. It is
 * template-generated today; an LLM can replace it later without changing
 * the contract.
 *
 * The hook is memoized on `[taste.signature, excludeId, seed]` via
 * createResource, so re-rolls are debounced and cached.
 */
export function useSpotlight(args: UseSpotlightArgs) {
  // Build a stable signature for the taste so the resource recomputes
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

  const fetcher = async (): Promise<SpotlightPick | null> => {
    const taste = args.taste();
    const inVault = vaultIds();
    const exclude = excludeSet();

    // Helper: filter out vault + excluded titles, pick a deterministic-ish
    // index from the seed so re-rolls rotate through the list.
    const pick = (list: TMDBTitle[], strategy: SpotlightPick["strategy"], reason: string): SpotlightPick | null => {
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
        const pickResult = pick(
          recs,
          "because-you-watched",
          `Because you rated ${seedName} ${taste.seedTitle.rating ?? 9}/10`
        );
        if (pickResult) return pickResult;
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
          const pickResult = pick(
            pool,
            "hidden-gems",
            `A hidden gem in your favorite genre — ${taste.topGenres[0]}`
          );
          if (pickResult) return pickResult;
        }
      } catch (e) {
        // fall through
      }
    }

    // 3. continue-franchise — search for missing franchise entries
    if (taste.activeFranchises.length > 0) {
      // We don't have a clean TMDB franchise endpoint here, so we skip
      // this strategy for the Spotlight (it's better served by the
      // Trajectory fold which can show multiple picks). Fall through.
    }

    // 4. directors-you-love — discover by director name via search
    //    (skipped for Spotlight because it requires a 2-step fetch;
    //     the Trajectory fold handles it.)

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
          const pickResult = pick(
            deep,
            "genre-deep-dive",
            `A standout ${taste.topGenres[0]} film you haven't added`
          );
          if (pickResult) return pickResult;
        }
      } catch (e) {
        // fall through
      }
    }

    // 6. acclaimed-fallback — TMDB top-rated (works for cold start too)
    try {
      const top = await getTopRatedMovies();
      const pickResult = pick(
        top,
        "acclaimed-fallback",
        taste.isColdStart
          ? "A universally acclaimed film"
          : "A universally acclaimed film you haven't seen"
      );
      if (pickResult) return pickResult;
    } catch (e) {
      // last resort failed — return null (UI shows skeleton/error)
    }

    return null;
  };

  // The resource key is [tasteSignature, excludeId, seed]. When any of
  // these change, the fetcher re-runs.
  const resourceKey = createMemo(() => ({
    sig: tasteSignature(),
    exclude: args.excludeId(),
    seed: args.seed()
  }));

  const [pickResource] = createResource(resourceKey, fetcher);

  return {
    pick: pickResource,
    loading: pickResource.loading,
    /** Resolve a director name for a Spotlight pick (lazy, best-effort) */
    resolveDirector: (title: TMDBTitle) => fetchTitleDirector(title.media_type, title.id)
  };
}
