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

  const loading = createMemo(
    () => library.loading() || (isSignedIn() && library.watchlist().length === 0 && !library.error()),
  );

  const stats = createMemo<AllStats | null>(() => {
    const list = library.watchlist();
    if (!list || list.length === 0) return null;
    return getStatsData(list);
  });

  const isEmpty = createMemo(() => !loading() && isSignedIn() && library.watchlist().length === 0);

  return { stats, loading, isEmpty, isGuest };
}
