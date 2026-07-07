// src/features/discover/hooks/useTrajectories.ts
import { createResource, createMemo, Accessor } from "solid-js";
import type {
  TasteProfile,
  WatchlistItem,
  TMDBTitle,
  Trajectory,
  TrajectoryArchetype
} from "~/shared/types";
import {
  discoverMovies,
  discoverTv,
  getRecommendations,
  getTopRatedMovies,
  searchMulti,
  genreIdFor
} from "~/core/tmdb/discover";
import { FRANCHISES } from "~/shared/data/franchises";

interface UseTrajectoriesArgs {
  taste: Accessor<TasteProfile>;
  vault: Accessor<WatchlistItem[]>;
}

/**
 * useTrajectories — builds 0-4 intent-based clusters for Fold 1.
 *
 * Initial archetypes (per the approved design):
 *   - tonights-pick     — one strong, broad-appeal pick in the user's top genre
 *   - because-you-watched — recommendations from the user's seed title
 *   - hidden-gems       — high-rated, low-popularity in the user's top genre
 *   - continue-franchise — missing entries in an active franchise
 *
 * The architecture is open: adding a 5th archetype (e.g. "directors-you-love"
 * or "genre-deep-dive") only requires:
 *   1. Adding the value to TrajectoryArchetype in shared/types
 *   2. Adding a builder function here and pushing it into the result
 * No component changes needed — TrajectoryCard renders any Trajectory.
 *
 * Empty trajectories are filtered out. The UI never shows empty shelves.
 */
export function useTrajectories(args: UseTrajectoriesArgs) {
  const tasteSig = createMemo(() => {
    const t = args.taste();
    return JSON.stringify({
      g: t.topGenres,
      s: t.seedTitle?.id ?? null,
      f: t.activeFranchises.map((f) => f.name),
      cold: t.isColdStart
    });
  });

  const vaultIds = createMemo(() => new Set(args.vault().map((m) => String(m.id))));

  const filterAndTake = (list: TMDBTitle[], count: number, excludeFirst = false): TMDBTitle[] => {
    const inVault = vaultIds();
    const filtered = list.filter(
      (t) => !inVault.has(String(t.id)) && (t.poster_path || t.backdrop_path)
    );
    return excludeFirst && filtered.length > 1 ? filtered.slice(1, 1 + count) : filtered.slice(0, count);
  };

  const fetcher = async (): Promise<Trajectory[]> => {
    const taste = args.taste();
    const out: Trajectory[] = [];

    /* 1. tonights-pick — broad-appeal in user's top genre (or top-rated if cold) */
    try {
      let hero: TMDBTitle | null = null;
      let supporting: TMDBTitle[] = [];

      if (taste.topGenres.length > 0) {
        const genreId = genreIdFor(taste.topGenres[0], "movie");
        if (genreId) {
          const list = await discoverMovies({
            withGenres: [genreId],
            sortBy: "popularity.desc",
            voteCountGte: 500,
            voteAverageGte: 7
          });
          const filtered = filterAndTake(list, 4);
          if (filtered.length > 0) {
            hero = filtered[0];
            supporting = filtered.slice(1, 4);
          }
        }
      }
      if (!hero && taste.isColdStart) {
        const top = await getTopRatedMovies();
        const filtered = filterAndTake(top, 4);
        if (filtered.length > 0) {
          hero = filtered[0];
          supporting = filtered.slice(1, 4);
        }
      }
      if (hero) {
        out.push({
          archetype: "tonights-pick",
          intent: taste.isColdStart
            ? "Tonight's Pick — a film everyone should see"
            : `Tonight's Pick — ${taste.topGenres[0] ?? "a great film"} you'll love`,
          subtitle: `${1 + supporting.length} picks for tonight`,
          icon: "tonight",
          hero,
          supporting
        });
      }
    } catch (e) { /* skip */ }

    /* 2. because-you-watched — recommendations from seed title */
    if (taste.seedTitle) {
      try {
        const recs = await getRecommendations(taste.seedTitle.media_type, taste.seedTitle.id);
        const filtered = filterAndTake(recs, 4);
        if (filtered.length > 0) {
          const seedName = taste.seedTitle.title || taste.seedTitle.name || "what you watched";
          out.push({
            archetype: "because-you-watched",
            intent: `Because you watched ${seedName}`,
            subtitle: `${filtered.length} titles in the same vein`,
            icon: "recommend",
            hero: filtered[0],
            supporting: filtered.slice(1, 4)
          });
        }
      } catch (e) { /* skip */ }
    }

    /* 3. hidden-gems — high-rated, low-popularity in user's top genre */
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
          const hidden = gems.filter((t) => (t.vote_count ?? 0) < 3000);
          const pool = hidden.length >= 3 ? hidden : gems;
          const filtered = filterAndTake(pool, 4);
          if (filtered.length > 0) {
            out.push({
              archetype: "hidden-gems",
              intent: `Hidden gems in ${taste.topGenres[0]}`,
              subtitle: `${filtered.length} acclaimed, under-the-radar picks`,
              icon: "diamond",
              hero: filtered[0],
              supporting: filtered.slice(1, 4)
            });
          }
        }
      } catch (e) { /* skip */ }
    }

    /* 4. continue-franchise — missing entries in an active franchise */
    if (taste.activeFranchises.length > 0) {
      try {
        const franchise = taste.activeFranchises[0];
        const franchiseDef = FRANCHISES.find((f) => f.name === franchise.name);
        if (franchiseDef) {
          // Search TMDB for the first keyword not already in the vault
          const ownedKeywords = new Set(
            args.vault()
              .filter((m) => {
                const t = (m.title || m.name || "").toLowerCase();
                return franchiseDef.keywords.some((k) => t.includes(k));
              })
              .map((m) => (m.title || m.name || "").toLowerCase())
          );
          const missingKeyword = franchiseDef.keywords.find(
            (k) => !ownedKeywords.has(k) && !Array.from(ownedKeywords).some((o) => o.includes(k))
          ) || franchiseDef.keywords[0];

          const results = await searchMulti(missingKeyword);
          // Prefer results whose title contains the keyword
          const matched = results.filter((t) => {
            const name = (t.title || t.name || "").toLowerCase();
            return franchiseDef.keywords.some((k) => name.includes(k));
          });
          const filtered = filterAndTake(matched.length > 0 ? matched : results, 4);
          if (filtered.length > 0) {
            out.push({
              archetype: "continue-franchise",
              intent: `Continue the ${franchise.name}`,
              subtitle: `${franchise.missing} entr${franchise.missing === 1 ? "y" : "ies"} missing from your vault`,
              icon: "account_tree",
              hero: filtered[0],
              supporting: filtered.slice(1, 4)
            });
          }
        }
      } catch (e) { /* skip */ }
    }

    return out;
  };

  const [trajectories] = createResource(tasteSig, fetcher);

  return { trajectories };
}

/** Type guard helper — exported so the page can narrow by archetype if needed. */
export function isTrajectoryArchetype(value: string): value is TrajectoryArchetype {
  return ["tonights-pick", "because-you-watched", "hidden-gems", "continue-franchise"].includes(value);
}
