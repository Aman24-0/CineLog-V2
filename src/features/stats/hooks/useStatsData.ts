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
//
// Phase 6.2 Task 3a — DATE-RANGE FILTER
// -------------------------------------
// The hook now exposes a `dateRange` signal ("all" | "year" | "6months")
// and a `setDateRange` setter. When set to anything other than "all",
// the watchlist is filtered by `addedAt` (when the title was added to
// the vault) BEFORE the stats calculators run. This means every chart
// (overview, genres, decades, ratings, activity, people, trends, pace,
// split, highest-rated) reflects only the titles added within the
// selected window.
//
// We chose `addedAt` (not `watchDate`) because:
//   - `addedAt` is always populated (every vault row has created_at).
//   - `watchDate` is null for non-Completed titles, which would shrink
//     the dataset to only completed titles — misleading for charts
//     like "Planned count" or the genres breakdown.
//   - Users mental-model "Last 6 months of activity" as "titles I've
//     added in the last 6 months", which matches the addedAt filter.
//
// Phase 7 Task 3 — SERVER-SIDE STATS (with local fallback)
// --------------------------------------------------------
// The hook now prefers to fetch stats from the server-side
// `/api/stats?range=...` route. This moves the O(n) calculator loop
// off the main thread, which keeps the browser responsive for vaults
// past ~10k items.
//
// Architecture:
//   1. On mount + on dateRange change: fire `fetch('/api/stats?range=...')`.
//   2. While the request is in-flight: optimistically compute stats
//      LOCALLY from the in-memory watchlist (instant, no flicker).
//   3. When the server response arrives: replace the local stats with
//      the server's stats (canonical).
//   4. If the server request fails (network error, 401, 500): fall
//      back to the local computation permanently for this session.
//      The user still gets stats — just computed client-side.
//
// This means:
//   • Fast first paint (local memo runs synchronously).
//   • Correct canonical stats (server response replaces local).
//   • Graceful degradation (server down → local stats still work).
//   • Existing tests still pass (they test the local memo path; the
//     server fetch is mocked/no-op in test env because `fetch` to
//     `/api/stats` returns 404 in jsdom, which triggers the fallback).

import { createMemo, createResource, createSignal, type Accessor } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useAuth } from "~/shared/hooks/useAuth";
import { getStatsData, type AllStats } from "~/lib/supabase/repositories/stats";
import type { WatchlistItem } from "~/shared/types";

/**
 * StatsDateRange — the union of supported date-range filters.
 *
 *   - "all"      → no filter; include every title in the vault.
 *   - "year"     → only titles added since Jan 1 of the current year.
 *   - "6months"  → only titles added in the last 6 months (rolling).
 */
export type StatsDateRange = "all" | "year" | "6months";

export interface UseStatsDataResult {
  /** The derived stats payload. Null while loading or when the user has no titles. */
  stats: Accessor<AllStats | null>;
  /** True while the auth state OR the watchlist is still loading. */
  loading: Accessor<boolean>;
  /** True when the user is signed in but has zero titles in their library. */
  isEmpty: Accessor<boolean>;
  /** True when the user is not signed in (guest). */
  isGuest: Accessor<boolean>;
  /** Current date-range filter. Phase 6.2 Task 3a. */
  dateRange: Accessor<StatsDateRange>;
  /** Change the date-range filter. Re-derives stats reactively. */
  setDateRange: (r: StatsDateRange) => void;
  /** Total count BEFORE the date-range filter is applied. Useful for
   *  showing "X of Y titles" in the UI. */
  totalTitlesAllTime: Accessor<number>;
}

/**
 * Resolve a WatchlistItem's addedAt to a millisecond timestamp.
 * Returns NaN if the date can't be parsed.
 *
 * Handles all three storage shapes:
 *   - string (ISO 8601, from Supabase)
 *   - Date object (rare, but defensive)
 *   - { seconds, nanoseconds } (legacy Firestore shape, kept for
 *     imported backups)
 */
function addedAtToMs(addedAt: WatchlistItem["addedAt"]): number {
  if (!addedAt) return NaN;
  if (typeof addedAt === "string") return new Date(addedAt).getTime();
  if (addedAt instanceof Date) return addedAt.getTime();
  if (typeof addedAt === "object" && "seconds" in addedAt) {
    return addedAt.seconds * 1000;
  }
  return NaN;
}

/**
 * Compute the cutoff timestamp (inclusive lower bound) for the given
 * date range. Returns 0 for "all" (no filter — includes everything
 * since epoch).
 *
 *   - "year"    → Jan 1, 00:00:00 of the current year (local time).
 *   - "6months" → exactly 6 months ago from now (rolling window).
 *
 * Using local time matches the user's mental model ("this year" =
 * their calendar year, not UTC).
 */
function cutoffForRange(range: StatsDateRange): number {
  if (range === "all") return 0;
  const now = new Date();
  if (range === "year") {
    return new Date(now.getFullYear(), 0, 1).getTime();
  }
  if (range === "6months") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 6);
    return d.getTime();
  }
  return 0;
}

export function useStatsData(): UseStatsDataResult {
  const library = useUserLibrary();
  const { isSignedIn } = useAuth();

  // Phase 6.2 Task 3a — date-range filter signal. Defaults to "all".
  // The signal is created INSIDE the hook so each StatisticsPage
  // instance gets its own filter state (avoids cross-instance leaks
  // if the page is ever mounted twice).
  const [dateRange, setDateRange] = createSignal<StatsDateRange>("all");

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
      (isSignedIn() && safeWatchlist().length === 0 && !library.error())
  );

  // Total count BEFORE the date-range filter is applied. Useful for
  // showing "viewing X of Y titles" in the date-range selector label.
  const totalTitlesAllTime = createMemo(() => safeWatchlist().length);

  // Phase 6.2 Task 3a — filtered watchlist based on dateRange.
  // When dateRange() === "all", this is the same as safeWatchlist()
  // (the cutoff is 0, which everything passes). Otherwise we filter
  // by addedAt >= cutoff.
  const filteredWatchlist = createMemo<WatchlistItem[]>(() => {
    const list = safeWatchlist();
    const range = dateRange();
    if (range === "all") return list;
    const cutoff = cutoffForRange(range);
    return list.filter((m) => {
      const ms = addedAtToMs(m.addedAt);
      // If addedAt is missing/unparseable, EXCLUDE the item from the
      // filtered view (we can't verify it's within the window). This
      // is the safer choice than including it (which would skew the
      // stats with potentially-ancient titles).
      if (isNaN(ms)) return false;
      return ms >= cutoff;
    });
  });

  const localStats = createMemo<AllStats | null>(() => {
    const list = filteredWatchlist();
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

  // ── Phase 7 Task 3: Server-side stats (preferred) ────────────────
  // Fetch canonical stats from `/api/stats?range=...`. The server
  // route uses the SAME adapter + calculators, so the result is
  // structurally identical to `localStats()` — just computed off the
  // main thread. We use `createResource` so the fetch is reactive on
  // `dateRange` and re-fires when the user changes the filter.
  //
  // The fetcher is async and returns `AllStats | null`. On error
  // (network failure, 401, 5xx), we return `null` and let the
  // `stats` memo below fall back to `localStats()`. This means:
  //   • If the server is unreachable, the user still sees stats
  //     (computed locally) — graceful degradation.
  //   • If the server returns 401 (session expired), the local
  //     fallback still works until the auth redirect kicks in.
  //
  // We DON'T pass `isSignedIn()` as a source signal because
  // `createResource` would re-fire on every auth state change (e.g.
  // token refresh), causing a refetch flicker. The route itself
  // returns 401 if the session is missing, which we handle in the
  // fetcher.
  const fetchServerStats = async (
    range: StatsDateRange
  ): Promise<AllStats | null> => {
    // Skip fetch on the server (SSR) — there's no session cookie
    // available yet, and the route would 401. The client will
    // re-fetch after hydration.
    if (typeof window === "undefined") return null;
    try {
      const resp = await fetch(
        `/api/stats?range=${encodeURIComponent(range)}`,
        { credentials: "include" }
      );
      if (!resp.ok) {
        // 401 / 5xx → fall back to local stats. We log at warn level
        // so it's visible in devtools without spamming error tracking.
        if (resp.status !== 401) {
          console.warn(
            `[useStatsData] /api/stats returned ${resp.status}, falling back to local stats.`
          );
        }
        return null;
      }
      const body = (await resp.json()) as {
        stats: AllStats | null;
        range: StatsDateRange;
      };
      return body.stats;
    } catch (err) {
      // Network error / JSON parse error — fall back to local stats.
      console.warn(
        "[useStatsData] /api/stats fetch failed, falling back to local stats:",
        err
      );
      return null;
    }
  };

  const [serverStats] = createResource<AllStats | null, StatsDateRange>(
    dateRange,
    fetchServerStats
  );

  // The PUBLIC `stats` accessor: prefer server stats, fall back to
  // local stats. This is what every chart on the Stats page reads.
  //
  //   • While the server fetch is in-flight: serverStats() === undefined
  //     → fall back to localStats() (instant first paint).
  //   • When the server fetch succeeds with a non-null value: use it
  //     (canonical).
  //   • When the server fetch succeeds with null (empty library):
  //     use localStats() (which is also null in that case — consistent).
  //   • When the server fetch errors: serverStats() === undefined
  //     → fall back to localStats() (graceful degradation).
  const stats = createMemo<AllStats | null>(() => {
    const server = serverStats();
    // `undefined` means "still loading or errored" — fall back.
    if (server === undefined) return localStats();
    // `null` means "server returned empty" — fall back to local,
    // which is also null for an empty library (consistent shape).
    if (server === null) return localStats();
    return server;
  });

  // "Empty" is true when the user has zero titles in their ENTIRE
  // vault (not just zero in the filtered view). This way the empty
  // state only shows when there's genuinely nothing to look at, and
  // the date-range filter just shows fewer charts (not the empty state)
  // when the filtered window has no titles.
  const isEmpty = createMemo(
    () => !loading() && isSignedIn() && totalTitlesAllTime() === 0
  );

  return {
    stats,
    loading,
    isEmpty,
    isGuest,
    dateRange,
    setDateRange,
    totalTitlesAllTime
  };
}
