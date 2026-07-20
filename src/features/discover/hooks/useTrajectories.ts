// src/features/discover/hooks/useTrajectories.ts
import { createResource, createMemo, Accessor } from "solid-js";
import { discoverMovies, getTopRatedMovies, getRecommendations, searchMulti } from "~/core/tmdb/discover";
import { genreIdFor } from "~/core/tmdb/genres";
import { FRANCHISES } from "~/shared/data/franchises";
import type { TMDBTitle, Trajectory, TrajectoryArchetype, TasteProfile } from "~/shared/types";

export interface UseTrajectoriesArgs {
  taste: Accessor<TasteProfile>;
  /** The user's vault. Only id/title/name are accessed for filtering. */
  vault: Accessor<{ id: string; title?: string; name?: string }[]>;
}

/**
 * useTrajectories — Fold 1 of the Discover page.
 *
 * Returns 4 intent-based trajectories:
 *   1. tonights-pick       — broad-appeal in user's top genre
 *   2. because-you-watched — recommendations from seed title
 *   3. hidden-gems         — high-rated, low-popularity in top genre
 *   4. continue-franchise  — missing entries in an active franchise
 *
 * Each trajectory is built by calling TMDB discover/search endpoints.
 * Empty trajectories are filtered out by the UI.
 *
 * ERROR HANDLING: The fetcher is wrapped in a top-level try/catch that
 * returns [] on ANY error. This prevents unhandled promise rejections
 * during SSR when TMDB is unavailable (401, network, etc.) — which
 * would otherwise crash the Node server process.
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

    // Top-level try/catch — if ANY sub-fetch throws, return what we
    // have so far (or empty). This prevents unhandled rejections that
    // crash the SSR server when TMDB is unavailable.
    try {

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
      } catch (e) { /* skip this trajectory */ }

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

    } catch (e) {
      // Top-level catch — return whatever we have so far. This prevents
      // unhandled promise rejections that crash the SSR server.
      console.warn("[useTrajectories] fetcher error (returning partial):", e);
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
