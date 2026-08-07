// src/features/discover/hooks/useDiscoverRow.ts
//
// useDiscoverRow — a small hook that fetches a single TMDB feed for one
// Discover row. It's designed to be used inside a <Suspense> boundary
// so each row loads independently — one slow row never blocks the others.
//
// The hook:
//   1. Takes a reactive `queryKey` (changes when the row's fetch params
//      change — e.g. when the user picks a different OTT provider).
//   2. Takes a `fetcher` that returns a Promise<TMDBTitle[]>.
//   3. Exposes { titles, loading, error, retry }.
//
// It does NOT dedupe against the vault — the caller is responsible for
// filtering out vault titles (using the excludedKeys set from
// usePersonalizedDiscover) so the same hook works for personalized AND
// generic rows.

import { createSignal, createEffect, onCleanup, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";
import type { TMDBTitle } from "~/shared/types";
import { isTmdb404 } from "~/core/tmdb/tmdb";

export interface DiscoverRow {
  titles: Accessor<TMDBTitle[]>;
  loading: Accessor<boolean>;
  error: Accessor<Error | null>;
  retry: () => void;
}

/**
 * useDiscoverRow — fetch a single TMDB feed for one Discover row.
 *
 * @param queryKey  Reactive key. The fetcher re-runs whenever this
 *                  changes (by value, via JSON.stringify). Pass `null`
 *                  to skip the fetch entirely (e.g. when the row's
 *                  required inputs aren't ready yet).
 * @param fetcher   Async function that returns TMDBTitle[]. Called
 *                  whenever queryKey changes (and is non-null).
 */
export function useDiscoverRow<T>(
  queryKey: Accessor<T | null>,
  fetcher: (key: T) => Promise<TMDBTitle[]>
): DiscoverRow {
  const [titles, setTitles] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [retryTick, setRetryTick] = createSignal(0);

  // Track the latest fetch so a stale response can't overwrite a fresh
  // one (e.g. user switches OTT provider while the old fetch is in-flight).
  let fetchSeq = 0;

  createEffect(() => {
    // Re-run when the key OR the retry tick changes.
    const key = queryKey();
    void retryTick();
    if (isServer) return;
    if (key === null || key === undefined) {
      setTitles([]);
      setLoading(false);
      setError(null);
      return;
    }

    const mySeq = ++fetchSeq;
    setLoading(true);
    setError(null);

    fetcher(key)
      .then((result) => {
        if (mySeq !== fetchSeq) return; // stale — discard
        setTitles(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (mySeq !== fetchSeq) return; // stale — discard
        // Phase 15 QA Bug #3: 404s from TMDB are expected (stale AniList↔TMDB
        // mappings, deleted entries) — silence them so the console isn't
        // flooded with red noise. Only warn on real errors.
        if (!isTmdb404(err)) {
          console.warn("[useDiscoverRow] fetch failed:", err);
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setTitles([]);
        setLoading(false);
      });
  });

  onCleanup(() => {
    fetchSeq++;
  });

  const retry = () => setRetryTick((t) => t + 1);

  return { titles, loading, error, retry };
}
