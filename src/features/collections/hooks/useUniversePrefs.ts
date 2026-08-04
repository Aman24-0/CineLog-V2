/**
 * CineLog V2 — Universe Preferences Hook (internal)
 * ---------------------------------------------------------------------
 * Phase 8 — extracted from useCollections.tsx to keep file sizes
 * under 250 lines. Manages universe subscription state and operations
 * via the Supabase `user_universe_subscriptions` table.
 *
 * This is an INTERNAL hook — not exported. It's composed by
 * `useCollectionsLogic` in `useCollections.tsx`.
 */

import { createSignal, createMemo } from "solid-js";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { CURATED_COLLECTIONS } from "~/shared/data/curatedCollections";
import { SUGGESTED_UNIVERSES } from "~/shared/data/suggestedUniverses";
import {
  addUniverseSubscription,
  fetchUniversePreferencesFromSupabase,
  hideUniverseSubscription,
  pinUniverseSubscription,
  removeUniverseSubscription,
  restoreUniverseSubscription,
  setUniversePreferences,
  unpinUniverseSubscription
} from "../universePreferencesAdapter";
import type {
  Collection,
  CollectionEntry,
  UniversePreferences,
  ViewingOrder,
  TimelineProvider
} from "~/shared/types";

/**
 * Internal hook that manages universe preferences state + operations.
 * Returns the signals and methods that `useCollectionsLogic` merges
 * into its public return value.
 */
export function useUniversePrefsLogic() {
  const { showToast } = useToast();
  const [universePrefs, setUniversePrefs] = createSignal<UniversePreferences[]>(
    []
  );

  const refreshUniversePrefs = async (userId: string) => {
    try {
      const prefs = await fetchUniversePreferencesFromSupabase(userId);
      setUniversePrefs(prefs);
    } catch (err) {
      console.warn(
        "[useUniversePrefs] Failed to fetch universe preferences:",
        err
      );
    }
  };

  // ─── Computed ────────────────────────────────────────────────
  const addedUniverses = createMemo(() => {
    const prefs = universePrefs().filter((p) => p.isAdded && !p.isHidden);
    return prefs
      .map((p) => {
        const curated = CURATED_COLLECTIONS.find((c) => c.id === p.universeId);
        if (curated) return curated;
        const suggested = SUGGESTED_UNIVERSES.find(
          (s) => s.id === p.universeId
        );
        if (suggested) {
          return {
            id: suggested.id,
            name: suggested.name,
            type: "official" as const,
            description: suggested.description,
            backdrop_path: suggested.backdrop_path,
            tmdbCollectionId: suggested.tmdbCollectionId,
            entries: []
          } satisfies Collection;
        }
        return null;
      })
      .filter(Boolean) as Collection[];
  });

  const pinnedUniverses = createMemo(() => {
    const pinnedIds = universePrefs()
      .filter((p) => p.isPinned && p.isAdded)
      .map((p) => p.universeId);
    return addedUniverses().filter((u) => pinnedIds.includes(u.id));
  });

  const suggestedUniverses = createMemo(() => {
    const addedOrHiddenIds = universePrefs()
      .filter((p) => p.isAdded || p.isHidden)
      .map((p) => p.universeId);
    return SUGGESTED_UNIVERSES.filter((s) => !addedOrHiddenIds.includes(s.id));
  });

  const hiddenUniverses = createMemo(() => {
    const hiddenIds = universePrefs()
      .filter((p) => p.isHidden)
      .map((p) => p.universeId);
    return SUGGESTED_UNIVERSES.filter((s) => hiddenIds.includes(s.id));
  });

  const getUniversePrefs = (universeId: string): UniversePreferences | null =>
    universePrefs().find((p) => p.universeId === universeId) ?? null;

  // ─── Operations ──────────────────────────────────────────────
  const addUniverseToPrefs = async (universeId: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) {
      showToast("Sign in to add universes.", "error");
      return;
    }
    try {
      await addUniverseSubscription(uid, universeId);
      await refreshUniversePrefs(uid);
      showToast("Universe added", "success", 1500);
    } catch (err) {
      console.error("Failed to add universe:", err);
      showToast("Failed to add universe.", "error");
    }
  };

  const removeUniverseFromPrefs = async (universeId: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await removeUniverseSubscription(uid, universeId);
      await refreshUniversePrefs(uid);
      showToast("Universe removed", "success", 1500);
    } catch (err) {
      console.error("Failed to remove universe:", err);
    }
  };

  const hideUniverseFromPrefs = async (universeId: string): Promise<void> => {
    // Phase 4 Task 2: hide via is_hidden column (subscription retained).
    const uid = getCurrentUid();
    if (!uid) {
      showToast("Sign in to hide universes.", "error");
      return;
    }
    try {
      await hideUniverseSubscription(uid, universeId);
      await refreshUniversePrefs(uid);
      showToast("Universe hidden", "success", 1500);
    } catch (err) {
      console.error("Failed to hide universe:", err);
      showToast("Failed to hide universe.", "error");
    }
  };

  const restoreUniverseToPrefs = async (universeId: string): Promise<void> => {
    // Phase 4 Task 2: restore via is_hidden = false (subscription retained).
    const uid = getCurrentUid();
    if (!uid) {
      showToast("Sign in to restore universes.", "error");
      return;
    }
    try {
      await restoreUniverseSubscription(uid, universeId);
      await refreshUniversePrefs(uid);
      showToast("Universe restored", "success", 1500);
    } catch (err) {
      console.error("Failed to restore universe:", err);
      showToast("Failed to restore universe.", "error");
    }
  };

  const pinUniverseInPrefs = async (universeId: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await pinUniverseSubscription(uid, universeId);
      await refreshUniversePrefs(uid);
    } catch (err) {
      console.error("Failed to pin universe:", err);
    }
  };

  const unpinUniverseInPrefs = async (universeId: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await unpinUniverseSubscription(uid, universeId);
      await refreshUniversePrefs(uid);
    } catch (err) {
      console.error("Failed to unpin universe:", err);
    }
  };

  const setUniversePreferredOrder = async (
    universeId: string,
    order: ViewingOrder
  ): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await setUniversePreferences(uid, universeId, { preferredOrder: order });
      await refreshUniversePrefs(uid);
    } catch (err) {
      console.error("Failed to set preferred order:", err);
    }
  };

  const setUniversePreferredProvider = async (
    universeId: string,
    provider: TimelineProvider
  ): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await setUniversePreferences(uid, universeId, {
        preferredProvider: provider
      });
      await refreshUniversePrefs(uid);
    } catch (err) {
      console.error("Failed to set preferred provider:", err);
    }
  };

  const saveOverrides = async (
    universeId: string,
    overrides: Record<string, Partial<CollectionEntry>>
  ): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await setUniversePreferences(uid, universeId, {
        customOverrides: overrides
      });
      await refreshUniversePrefs(uid);
    } catch (err) {
      console.error("Failed to save overrides:", err);
    }
  };

  return {
    universePrefs,
    refreshUniversePrefs,
    addedUniverses,
    pinnedUniverses,
    suggestedUniverses,
    hiddenUniverses,
    getUniversePrefs,
    addUniverseToPrefs,
    removeUniverseFromPrefs,
    hideUniverseFromPrefs,
    restoreUniverseToPrefs,
    pinUniverseInPrefs,
    unpinUniverseInPrefs,
    setUniversePreferredOrder,
    setUniversePreferredProvider,
    saveOverrides
  };
}
