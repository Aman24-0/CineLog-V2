/**
 * CineLog V2 — Curated Universes Hook (Context-Scoped)
 * ---------------------------------------------------------------------
 * Phase 9 Chunk 5a — Converted to a Context provider so every caller
 * across the app shares the SAME signals. This is the fix for the
 * "universe subscribed but not appearing in grid" bug.
 *
 * ROOT CAUSE (bug):
 *   Previously `useCuratedUniverses()` was a plain function that created
 *   fresh signals per call. AddUniverseModal called `refresh()` on ITS
 *   instance — CollectionsPage's separate instance never got the update,
 *   so the universe never appeared in the grid until a full page reload.
 *
 * FIX:
 *   1. Expose `CuratedUniversesProvider` (mount once at app root).
 *   2. `useCuratedUniverses()` now reads from `useContext` — every
 *      caller sees the same signals.
 *   3. Added `addSubscribedUniverse(collection)` and
 *      `removeSubscribedUniverse(id)` for OPTIMISTIC updates — the
 *      universe appears in the grid instantly, before the DB write
 *      even completes.
 *
 * Architecture:
 *   CollectionsPage → useCuratedUniverses() → curatedUniverseAdapter → DiscoverRepository → Supabase
 */

import {
  createContext,
  createSignal,
  onMount,
  createEffect,
  useContext,
  type Accessor,
  type ParentComponent
} from "solid-js";
import { getCurrentUid, useAuth } from "~/shared/hooks/useAuth";
import { onSessionChange } from "~/lib/supabase/session";
import {
  fetchAllCuratedUniverses,
  fetchSubscribedUniverses,
  fetchSubscribedUniverseIds
} from "../curatedUniverseAdapter";
import type { Collection } from "~/shared/types";

export interface UseCuratedUniversesReturn {
  /** All developer-managed curated universes (Add Universe dialog). */
  readonly allCuratedUniverses: Accessor<Collection[]>;
  /** Universes the user has subscribed to (Collections page). */
  readonly subscribedUniverses: Accessor<Collection[]>;
  /** Set of subscribed universe IDs (for "Added" state in dialog). */
  readonly subscribedIds: Accessor<Set<string>>;
  readonly loading: Accessor<boolean>;
  readonly error: Accessor<string | null>;
  readonly refresh: () => Promise<void>;
  /**
   * Phase 9 Chunk 5a: Optimistic add. Pushes the universe into the
   * subscribedUniverses + subscribedIds signals IMMEDIATELY, before the
   * DB write completes. The caller should still invoke the underlying
   * subscription write (via useCollections().addUniverseToPrefs) to
   * persist the change.
   */
  readonly addSubscribedUniverse: (universe: Collection) => void;
  /**
   * Phase 9 Chunk 5a: Optimistic remove. Removes the universe from the
   * subscribedUniverses + subscribedIds signals immediately.
   */
  readonly removeSubscribedUniverse: (universeId: string) => void;
}

const CuratedUniversesContext =
  createContext<UseCuratedUniversesReturn>();

export const CuratedUniversesProvider: ParentComponent = (props) => {
  const { authReady } = useAuth();
  const [allCuratedUniverses, setAllCuratedUniverses] = createSignal<
    Collection[]
  >([]);
  const [subscribedUniverses, setSubscribedUniverses] = createSignal<
    Collection[]
  >([]);
  const [subscribedIds, setSubscribedIds] = createSignal<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  let lastFetchUid: string | null | undefined = undefined;

  const doFetch = async () => {
    const uid = getCurrentUid();
    // Race-safe: skip if a fetch for this uid is already in flight.
    if (lastFetchUid === uid) return;
    lastFetchUid = uid;
    setLoading(true);
    setError(null);
    try {
      const [all, subscribed] = await Promise.all([
        fetchAllCuratedUniverses(),
        uid
          ? fetchSubscribedUniverses(uid)
          : Promise.resolve([] as Collection[])
      ]);
      setAllCuratedUniverses(all);
      setSubscribedUniverses(subscribed);
      setSubscribedIds(new Set<string>(subscribed.map((c) => c.id)));
    } catch (err) {
      console.error("[useCuratedUniverses] Fetch error:", err);
      setError("Failed to load universes.");
    } finally {
      setLoading(false);
    }
  };

  // Refresh subscribed IDs + universes when the user adds/removes a
  // subscription. Re-fetches from Supabase to ensure the local state
  // matches the server (reconciliation after an optimistic update).
  const refreshSubscribedIds = async () => {
    const uid = getCurrentUid();
    if (!uid) {
      setSubscribedIds(new Set<string>());
      setSubscribedUniverses([]);
      return;
    }
    const [ids, subscribed] = await Promise.all([
      fetchSubscribedUniverseIds(uid),
      fetchSubscribedUniverses(uid)
    ]);
    setSubscribedIds(ids);
    setSubscribedUniverses(subscribed);
  };

  // ─── Optimistic update helpers (Phase 9 Chunk 5a bug fix) ────────
  const addSubscribedUniverse = (universe: Collection) => {
    setSubscribedUniverses((prev) => {
      if (prev.some((u) => u.id === universe.id)) return prev;
      return [universe, ...prev];
    });
    setSubscribedIds((prev) => {
      if (prev.has(universe.id)) return prev;
      const next = new Set(prev);
      next.add(universe.id);
      return next;
    });
  };

  const removeSubscribedUniverse = (universeId: string) => {
    setSubscribedUniverses((prev) =>
      prev.filter((u) => u.id !== universeId)
    );
    setSubscribedIds((prev) => {
      if (!prev.has(universeId)) return prev;
      const next = new Set(prev);
      next.delete(universeId);
      return next;
    });
  };

  onMount(() => {
    doFetch();
    try {
      const subscription = onSessionChange(() => {
        doFetch();
      });
      void subscription;
    } catch (err) {
      console.error(
        "[useCuratedUniverses] Auth subscription failed:",
        err
      );
    }
  });

  createEffect(() => {
    if (!authReady()) return;
    void doFetch();
  });

  const value: UseCuratedUniversesReturn = {
    allCuratedUniverses,
    subscribedUniverses,
    subscribedIds,
    loading,
    error,
    refresh: refreshSubscribedIds,
    addSubscribedUniverse,
    removeSubscribedUniverse
  };

  return (
    <CuratedUniversesContext.Provider value={value}>
      {props.children}
    </CuratedUniversesContext.Provider>
  );
};

export function useCuratedUniverses(): UseCuratedUniversesReturn {
  const ctx = useContext(CuratedUniversesContext);
  if (!ctx) {
    throw new Error(
      "useCuratedUniverses must be used within a CuratedUniversesProvider"
    );
  }
  return ctx;
}
