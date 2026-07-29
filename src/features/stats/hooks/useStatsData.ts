// src/features/stats/hooks/useStatsData.ts
//
// useStatsData — derives the full statistics payload from the user's
// in-memory watchlist via the pure calculators in
// `src/lib/supabase/repositories/stats.ts`.
//
// Why not createResource?
// -----------------------
// The watchlist is already loaded once at the app root by
// `useUserLibrary`. Re-fetching from Supabase here would (a) duplicate
// the network round-trip, (b) miss every genre / director / decade
// data point because those fields are TMDB enrichments that live only
// on the in-memory WatchlistItem, and (c) introduce a loading flicker
// on the Stats page.
//
// Instead we use createMemo — the stats re-derive reactively whenever
// the watchlist changes (e.g. after rating a title from elsewhere in
// the app). The memo is cheap because every calculator is O(n) over
// the watchlist with no I/O.
//
// Returned shape: `AllStats | null`. Null means the watchlist hasn't
// loaded yet OR the user has zero titles.

import { createMemo, type Accessor } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useAuth } from "~/shared/hooks/useAuth";
import { getStatsData, type AllStats } from "~/lib/supabase/repositories/stats";
import type { WatchlistItem } from "~/shared/types";

export interface UseStatsDataResult {
  /** The derived stats payload. Null while loading or when the user has no titles. */
  stats: Accessor<AllStats | null>;
  /** True while the auth state OR the watchlist is still loading. */
  loading: Accessor<boolean>;
  /** True when the user is signed in but has zero titles in their library. */
  isEmpty: Accessor<boolean>;
  /** True when the user is not signed in (guest). */
  isGuest: Accessor<boolean>;
}

export function useStatsData(): UseStatsDataResult {
  const library = useUserLibrary();
  const { isSignedIn } = useAuth();

  const isGuest = createMemo(() => !isSignedIn());

  // Guard: `library.watchlist` is always a function per the
  // UserLibrary contract, but we check defensively so a future
  // refactor can't crash the Stats page — instead it shows the
  // empty state.
  const safeWatchlist = createMemo<WatchlistItem[]>(() => {
    try {
      if (!library || typeof library.watchlist !== "function") return [];
      const list = library.watchlist();
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  });

  const loading = createMemo(
    () =>
      library.loading() ||
      (isSignedIn() && safeWatchlist().length === 0 && !library.error()),
  );

  const stats = createMemo<AllStats | null>(() => {
    const list = safeWatchlist();
    if (!list || list.length === 0) return null;
    try {
      return getStatsData(list);
    } catch (err) {
      // Defensive: if a calculator throws on malformed data, we
      // return null so the page shows the empty state instead of
      // crashing the route's error boundary.
      console.error("[useStatsData] getStatsData failed:", err);
      return null;
    }
  });

  const isEmpty = createMemo(
    () => !loading() && isSignedIn() && safeWatchlist().length === 0,
  );

  return { stats, loading, isEmpty, isGuest };
}
