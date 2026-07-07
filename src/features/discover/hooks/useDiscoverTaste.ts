// src/features/discover/hooks/useDiscoverTaste.ts
import { createMemo, Accessor } from "solid-js";
import type { WatchlistItem, TasteProfile } from "~/shared/types";

/* ------------------------------------------------------------------
   Franchise keyword table — shared with the Details page's
   FranchiseInfo component. Inlined here so useDiscoverTaste has no
   cross-feature import. If the Details page's list grows, mirror
   the additions here.
   ------------------------------------------------------------------ */
const FRANCHISES: { name: string; keywords: string[] }[] = [
  { name: "Marvel Cinematic Universe", keywords: ["avengers", "iron man", "captain america", "thor", "black panther", "doctor strange", "spider-man", "guardians of the galaxy", "black widow", "hawkeye", "eternals", "shang-chi", "ant-man", "captain marvel"] },
  { name: "DC Extended Universe", keywords: ["batman", "superman", "wonder woman", "aquaman", "flash", "justice league", "suicide squad", "man of steel", "black adam", "shazam"] },
  { name: "Harry Potter", keywords: ["harry potter", "deathly hallows", "philosopher's stone", "chamber of secrets", "prisoner of azkaban", "goblet of fire", "order of the phoenix", "half-blood prince", "fantastic beasts"] },
  { name: "Mission Impossible", keywords: ["mission impossible"] },
  { name: "John Wick", keywords: ["john wick"] },
  { name: "Fast & Furious", keywords: ["fast and furious", "fast & furious", "furious", "tokyo drift"] },
  { name: "Star Wars", keywords: ["star wars", "empire strikes back", "return of the jedi", "force awakens", "last jedi", "rise of skywalker"] },
  { name: "Lord of the Rings", keywords: ["lord of the rings", "hobbit", "fellowship of the ring", "two towers", "return of the king"] }
];

const titleOf = (m: WatchlistItem): string =>
  (m.title || m.name || "").toLowerCase();

const detectFranchise = (m: WatchlistItem): string | null => {
  const t = titleOf(m);
  for (const f of FRANCHISES) {
    if (f.keywords.some((k) => t.includes(k))) return f.name;
  }
  return null;
};

interface UseDiscoverTasteArgs {
  watchlist: Accessor<WatchlistItem[]>;
  isGuest: Accessor<boolean>;
}

/**
 * useDiscoverTaste — derives a TasteProfile from the user's vault.
 *
 * This is the architectural seam for future AI recommendations. Every
 * other Discover hook consumes `TasteProfile`, not the vault directly,
 * so swapping the source from local heuristics → server ML → LLM is a
 * one-file change here.
 *
 * The profile is computed with a memo, so it only recomputes when the
 * vault (or guest state) changes.
 *
 * COLD START: if the user has no vault signal (guest, empty vault, or
 * no rated/completed titles), `isColdStart` is true and the Discover
 * page falls back to a generic-but-curated experience. This is by
 * design — we never show fake personalization.
 */
export function useDiscoverTaste(args: UseDiscoverTasteArgs) {
  const profile = createMemo<TasteProfile>(() => {
    const list = args.watchlist();
    const guest = args.isGuest();

    // Cold start — no signal at all
    if (guest || list.length === 0) {
      return {
        topGenres: [],
        topDirectors: [],
        activeFranchises: [],
        avgImdb: 0,
        seedTitle: null,
        isColdStart: true
      };
    }

    /* 1. Top genres — from completed AND 8+ rated titles (the strongest
          taste signals). Count by genre occurrence across the vault. */
    const genreCounts: Record<string, number> = {};
    const strongSignalTitles = list.filter(
      (m) => m.status === "Completed" || (m.rating ?? 0) >= 8
    );
    const signalSource = strongSignalTitles.length >= 3 ? strongSignalTitles : list;
    for (const m of signalSource) {
      for (const g of m.genresList || []) {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      }
    }
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    /* 2. Top directors — directors appearing in ≥ 2 titles rated 8+,
          with their average rating across those titles. */
    const directorBuckets: Record<string, { count: number; ratingSum: number }> = {};
    for (const m of list) {
      if (!m.director) continue;
      if ((m.rating ?? 0) < 8 && m.status !== "Completed") continue;
      const dir = m.director.trim();
      if (!dir || dir === "Unknown" || dir.startsWith("N/A")) continue;
      if (!directorBuckets[dir]) directorBuckets[dir] = { count: 0, ratingSum: 0 };
      directorBuckets[dir].count += 1;
      directorBuckets[dir].ratingSum += m.rating ?? 0;
    }
    const topDirectors = Object.entries(directorBuckets)
      .filter(([, v]) => v.count >= 2)
      .map(([name, v]) => ({
        name,
        count: v.count,
        avgRating: v.count > 0 ? v.ratingSum / v.count : 0
      }))
      .sort((a, b) => b.count - a.count || b.avgRating - a.avgRating)
      .slice(0, 3);

    /* 3. Active franchises — franchises the user has started but not
          completed. We use the same FRANCHISES table as the Details
          page's FranchiseInfo component so the two stay in sync. */
    const franchiseOwned: Record<string, Set<string>> = {};
    for (const m of list) {
      const f = detectFranchise(m);
      if (!f) continue;
      if (!franchiseOwned[f]) franchiseOwned[f] = new Set();
      franchiseOwned[f].add(m.id);
    }
    const activeFranchises = Object.entries(franchiseOwned)
      .map(([name, owned]) => {
        const franchise = FRANCHISES.find((f) => f.name === name);
        // Estimate "missing" from the keyword count — this is a rough
        // heuristic; TMDB doesn't expose franchise totals cleanly.
        const estimatedTotal = franchise ? Math.min(franchise.keywords.length + 2, 12) : owned.size;
        return {
          name,
          owned: owned.size,
          missing: Math.max(0, estimatedTotal - owned.size)
        };
      })
      .filter((f) => f.missing > 0) // only "active" franchises (still has missing entries)
      .sort((a, b) => b.owned - a.owned)
      .slice(0, 3);

    /* 4. avgImdb — quality bar for "Hidden gems" threshold. */
    const imdbRatings = list
      .map((m) => parseFloat(m.imdbRating || "0"))
      .filter((r) => !isNaN(r) && r > 0);
    const avgImdb = imdbRatings.length > 0
      ? imdbRatings.reduce((a, b) => a + b, 0) / imdbRatings.length
      : 0;

    /* 5. seedTitle — most recent 9+ rated completed title. This is the
          anchor for the "Because you watched X" trajectory. */
    const seedCandidates = list
      .filter((m) => m.status === "Completed" && (m.rating ?? 0) >= 8)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    const seedTitle = seedCandidates[0] || null;

    /* 6. Cold start if the user has a vault but no usable signal —
          e.g. everything is "Planned" with no ratings. */
    const hasAnySignal =
      topGenres.length > 0 ||
      topDirectors.length > 0 ||
      activeFranchises.length > 0 ||
      seedTitle !== null;

    return {
      topGenres,
      topDirectors,
      activeFranchises,
      avgImdb,
      seedTitle,
      isColdStart: !hasAnySignal
    };
  });

  return { profile };
}
