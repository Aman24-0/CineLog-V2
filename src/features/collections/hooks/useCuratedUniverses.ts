/**
 * CineLog V2 — Curated Universes Hook
 * ---------------------------------------------------------------------
 * Reactive adapter over {@link curatedUniverseAdapter}. Provides
 * signals for the Collections page and Add Universe dialog.
 *
 * This hook is the SOLE source of curated universe data in the UI.
 * It fetches from Supabase `curated_universes` — NO hardcoded constants.
 *
 * Architecture:
 *   CollectionsPage → useCuratedUniverses() → curatedUniverseAdapter → DiscoverRepository → Supabase
 */

import { createSignal, onMount, type Accessor } from "solid-js";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { onSessionChange } from "~/lib/supabase/session";
import {
  fetchAllCuratedUniverses,
  fetchSubscribedUniverses,
  fetchSubscribedUniverseIds,
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
}

export function useCuratedUniverses(): UseCuratedUniversesReturn {
  const [allCuratedUniverses, setAllCuratedUniverses] = createSignal<Collection[]>([]);
  const [subscribedUniverses, setSubscribedUniverses] = createSignal<Collection[]>([]);
  const [subscribedIds, setSubscribedIds] = createSignal<Set<string>>(new Set());
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const doFetch = async () => {
    const uid = getCurrentUid();
    setLoading(true);
    setError(null);
    try {
      // Always fetch the full catalog (for the Add Universe dialog).
      const [all, subscribed] = await Promise.all([
        fetchAllCuratedUniverses(),
        uid ? fetchSubscribedUniverses(uid) : Promise.resolve([] as Collection[]),
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

  // Refresh subscribed IDs when the user adds/removes a subscription.
  const refreshSubscribedIds = async () => {
    const uid = getCurrentUid();
    if (!uid) {
      setSubscribedIds(new Set<string>());
      setSubscribedUniverses([]);
      return;
    }
    const ids = await fetchSubscribedUniverseIds(uid);
    setSubscribedIds(ids);
    const subscribed = await fetchSubscribedUniverses(uid);
    setSubscribedUniverses(subscribed);
  };

  onMount(() => {
    doFetch();
    try {
      const subscription = onSessionChange(() => {
        doFetch();
      });
      // Cleanup is handled by the session module; no explicit unsubscribe needed.
      void subscription;
    } catch (err) {
      console.error("[useCuratedUniverses] Auth subscription failed:", err);
    }
  });

  return {
    allCuratedUniverses,
    subscribedUniverses,
    subscribedIds,
    loading,
    error,
    refresh: refreshSubscribedIds,
  };
}
