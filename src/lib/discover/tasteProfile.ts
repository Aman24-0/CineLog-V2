// src/lib/discover/tasteProfile.ts
//
// CineLog V2 — Taste Profile Calculator (Phase 7 Task 4)
// ---------------------------------------------------------------------
// Pure, environment-agnostic derivation of a `TasteProfile` from a
// `WatchlistItem[]`. This is the SHARED core that both the client
// hook (`useDiscoverTaste`) and the server API route
// (`/api/discover/taste`) call.
//
// WHY EXTRACT THIS?
// -----------------
// Previously the taste-profile derivation lived inline in
// `useDiscoverTaste.ts` as a SolidJS `createMemo`. Phase 7 Task 4
// moves the computation server-side so it can be the seam for future
// ML / collaborative-filtering recommendations. By extracting the
// pure logic into this module:
//
//   1. The server route can call `computeTasteProfile(list)` without
//      pulling in SolidJS reactivity primitives (which would be a
//      server-side anti-pattern).
//   2. The client hook keeps its reactive `createMemo` shape but
//      delegates to the same function — so the client and server
//      produce identical profiles (no drift).
//   3. Tests can pin the calculator's behavior without rendering a
//      Solid component.
//
// COLD START
// ----------
// If the user has no vault signal (guest, empty vault, or no
// rated/completed titles), the returned `isColdStart` is `true` and
// every field is empty/zero. The Discover page uses this to fall back
// to a generic-but-curated experience — we never show fake
// personalization.

import type { WatchlistItem, TasteProfile } from "~/shared/types";
import {
  FRANCHISES,
  detectFranchise as detectFranchiseByName
} from "~/shared/data/franchises";

/**
 * Detect which franchise (if any) a vault item belongs to, based on
 * its title. Returns the franchise name or null.
 *
 * Lifted out of the old `useDiscoverTaste` so both client and server
 * use the same detection logic.
 */
function detectFranchise(m: WatchlistItem): string | null {
  return detectFranchiseByName(m.title || m.name || "")?.name ?? null;
}

/**
 * Compute a `TasteProfile` from the user's vault.
 *
 * Pure function: same input → same output, no I/O, no side effects.
 * Safe to call on the server (no SolidJS primitives, no `window` /
 * `localStorage` access).
 *
 * @param list      The user's vault (already TMDB-enriched).
 * @param isGuest   True if the user is not signed in. When true, the
 *                  function short-circuits to a cold-start profile
 *                  (the server can't personalize for a guest).
 */
export function computeTasteProfile(
  list: WatchlistItem[],
  isGuest: boolean
): TasteProfile {
  // Cold start — no signal at all.
  if (isGuest || list.length === 0) {
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
  const signalSource =
    strongSignalTitles.length >= 3 ? strongSignalTitles : list;
  for (const m of signalSource) {
    if (!m.genresList || !Array.isArray(m.genresList)) continue;
    for (const g of m.genresList) {
      const name =
        typeof g === "string"
          ? g
          : typeof g === "object" && g !== null && "name" in g
            ? String((g as { name: unknown }).name)
            : String(g);
      if (name) genreCounts[name] = (genreCounts[name] || 0) + 1;
    }
  }
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  /* 2. Top directors — directors appearing in ≥ 2 titles rated 8+,
       with their average rating across those titles. */
  const directorBuckets: Record<
    string,
    { count: number; ratingSum: number }
  > = {};
  for (const m of list) {
    if (!m.director) continue;
    if ((m.rating ?? 0) < 8 && m.status !== "Completed") continue;
    const dir = m.director.trim();
    if (!dir || dir === "Unknown" || dir.startsWith("N/A")) continue;
    if (!directorBuckets[dir])
      directorBuckets[dir] = { count: 0, ratingSum: 0 };
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
      const estimatedTotal = franchise
        ? Math.min(franchise.keywords.length + 2, 12)
        : owned.size;
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
  const avgImdb =
    imdbRatings.length > 0
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
}
