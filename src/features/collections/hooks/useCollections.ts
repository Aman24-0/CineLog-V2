// src/features/collections/hooks/useCollections.ts
import { createContext, useContext, createSignal, onMount, onCleanup, ParentComponent, Accessor, createMemo } from "solid-js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { auth, db } from "~/core/firebase";
import {
  createUserCollection as svcCreateUserCollection,
  ensureFavoritesExists,
  addToUserCollection as svcAddToUserCollection,
  removeFromUserCollection as svcRemoveFromUserCollection,
  deleteUserCollection as svcDeleteUserCollection,
  renameUserCollection as svcRenameUserCollection,
  updateCollectionMeta as svcUpdateCollectionMeta,
  duplicateUserCollection as svcDuplicateUserCollection,
  updateEntryOrder as svcUpdateEntryOrder,
  createSmartCollection as svcCreateSmartCollection,
  updateSmartRules as svcUpdateSmartRules
} from "~/features/watchlist/watchlistService";
import {
  addUniverse as svcAddUniverse,
  removeUniverse as svcRemoveUniverse,
  hideUniverse as svcHideUniverse,
  restoreUniverse as svcRestoreUniverse,
  pinUniverse as svcPinUniverse,
  unpinUniverse as svcUnpinUniverse,
  setPreferredOrder as svcSetPreferredOrder,
  setPreferredProvider as svcSetPreferredProvider,
  saveTimelineOverrides as svcSaveTimelineOverrides,
  fetchAllPreferences
} from "~/features/collections/services/universePreferencesService";
import { useToast } from "~/shared/hooks/useToast";
import { CURATED_COLLECTIONS } from "~/shared/data/curatedCollections";
import { SUGGESTED_UNIVERSES } from "~/shared/data/suggestedUniverses";
import { evaluateSmartRules } from "~/features/collections/utils/evaluateSmartRules";
import type { Collection, CollectionEntry, WatchlistItem, UniversePreferences, SmartRule, ViewingOrder, TimelineProvider } from "~/shared/types";

/**
 * useCollections — the Collection Engine's state hook.
 *
 * Provides:
 *   - `userCollections` — user-created folders (from Firestore, live-updated)
 *   - `curatedCollections` — CineLog curated collections (static, from code)
 *   - `allCollections` — merged list for display
 *   - CRUD: create, addTo, removeFrom, delete, rename
 *   - `isInCollection` — check if a title is in a specific user collection
 *   - `collectionsForTitle` — get all user collections a title belongs to
 *   - Universe preferences: add, remove, hide, restore, pin, unpin
 *   - Smart collection evaluation
 *   - Timeline overrides
 *
 * The hook auto-creates the Favorites folder on sign-in (if missing).
 */
const useCollectionsLogic = () => {
  const { showToast } = useToast();
  const [userCollections, setUserCollections] = createSignal<Collection[]>([]);
  const [universePrefs, setUniversePrefs] = createSignal<UniversePreferences[]>([]);
  const [loading, setLoading] = createSignal(true);

  let unsub: (() => void) | null = null;
  let unsubAuth: (() => void) | null = null;

  onMount(() => {
    unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (unsub) { unsub(); unsub = null; }
      if (u) {
        // Ensure Favorites folder exists
        ensureFavoritesExists(u.uid).catch(() => {});

        // Subscribe to user collections
        const q = query(collection(db, "users", u.uid, "collections"), orderBy("createdAt", "desc"));
        unsub = onSnapshot(q, (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Collection);
          // Sort: Favorites first, then by createdAt
          items.sort((a, b) => {
            if (a.isFavorites && !b.isFavorites) return -1;
            if (!a.isFavorites && b.isFavorites) return 1;
            return 0;
          });
          setUserCollections(items);
          setLoading(false);
        }, (err) => {
          console.error("Collections fetch error:", err);
          setLoading(false);
        });

        // Fetch universe preferences
        try {
          const prefs = await fetchAllPreferences(u.uid);
          setUniversePrefs(prefs);
        } catch {
          // Preferences may not exist yet — that's fine
        }
      } else {
        setUserCollections([]);
        setUniversePrefs([]);
        setLoading(false);
      }
    });
  });

  onCleanup(() => {
    if (unsub) unsub();
    if (unsubAuth) unsubAuth();
  });

  const curated = (): Collection[] => CURATED_COLLECTIONS;

  const allCollections = (): Collection[] => [...userCollections(), ...curated()];

  // ─── Universe Preferences Computed ───────────────────────────

  /** Universes the user has explicitly added */
  const addedUniverses = createMemo(() => {
    const prefs = universePrefs().filter((p) => p.isAdded && !p.isHidden);
    return prefs.map((p) => {
      const curated = CURATED_COLLECTIONS.find((c) => c.id === p.universeId);
      if (curated) return curated;
      // For TMDB-only universes, construct a minimal collection
      const suggested = SUGGESTED_UNIVERSES.find((s) => s.id === p.universeId);
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
    }).filter(Boolean) as Collection[];
  });

  /** Universes the user has pinned */
  const pinnedUniverses = createMemo(() => {
    const pinnedIds = universePrefs().filter((p) => p.isPinned && p.isAdded).map((p) => p.universeId);
    return addedUniverses().filter((u) => pinnedIds.includes(u.id));
  });

  /** Suggested universes (not added, not hidden) */
  const suggestedUniverses = createMemo(() => {
    const addedOrHiddenIds = universePrefs()
      .filter((p) => p.isAdded || p.isHidden)
      .map((p) => p.universeId);
    return SUGGESTED_UNIVERSES.filter((s) => !addedOrHiddenIds.includes(s.id));
  });

  /** Hidden universes (for restore UI) */
  const hiddenUniverses = createMemo(() => {
    const hiddenIds = universePrefs().filter((p) => p.isHidden).map((p) => p.universeId);
    return SUGGESTED_UNIVERSES.filter((s) => hiddenIds.includes(s.id));
  });

  /** Get preferences for a specific universe */
  const getUniversePrefs = (universeId: string): UniversePreferences | null => {
    return universePrefs().find((p) => p.universeId === universeId) ?? null;
  };

  // ─── Collection CRUD ─────────────────────────────────────────

  const createCollection = async (name: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) { showToast("Sign in to create collections.", "error"); return; }
    try {
      await svcCreateUserCollection(uid, name);
      showToast(`Created "${name}"`, "success", 1500);
    } catch (err) {
      console.error("Failed to create collection:", err);
      showToast("Failed to create collection.", "error");
    }
  };

  const addToCollection = async (collectionId: string, entry: CollectionEntry): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) { showToast("Sign in to save to collections.", "error"); return; }
    try {
      await svcAddToUserCollection(uid, collectionId, entry);
      const col = userCollections().find((c) => c.id === collectionId);
      showToast(`Added to ${col?.name ?? "collection"}`, "success", 1500);
    } catch (err) {
      console.error("Failed to add to collection:", err);
      showToast("Failed to add.", "error");
    }
  };

  const removeFromCollection = async (collectionId: string, entryId: string, mediaType: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcRemoveFromUserCollection(uid, collectionId, entryId, mediaType);
    } catch (err) {
      console.error("Failed to remove:", err);
    }
  };

  const deleteCollection = async (collectionId: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcDeleteUserCollection(uid, collectionId);
      showToast("Collection deleted", "success", 1500);
    } catch (err) {
      console.error("Failed to delete:", err);
      showToast("Failed to delete.", "error");
    }
  };

  const renameCollection = async (collectionId: string, newName: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcRenameUserCollection(uid, collectionId, newName);
      showToast("Renamed", "success", 1500);
    } catch (err) {
      console.error("Failed to rename:", err);
      showToast("Failed to rename.", "error");
    }
  };

  const updateCollectionMeta = async (collectionId: string, meta: Parameters<typeof svcUpdateCollectionMeta>[2]): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcUpdateCollectionMeta(uid, collectionId, meta);
      showToast("Updated", "success", 1500);
    } catch (err) {
      console.error("Failed to update:", err);
      showToast("Failed to update.", "error");
    }
  };

  const duplicateCollection = async (collectionId: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcDuplicateUserCollection(uid, collectionId);
      showToast("Collection duplicated", "success", 1500);
    } catch (err) {
      console.error("Failed to duplicate:", err);
      showToast("Failed to duplicate.", "error");
    }
  };

  const reorderEntries = async (collectionId: string, entries: CollectionEntry[]): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcUpdateEntryOrder(uid, collectionId, entries);
    } catch (err) {
      console.error("Failed to reorder:", err);
      showToast("Failed to reorder.", "error");
    }
  };

  const createSmartCollection = async (name: string, rules: SmartRule[]): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) { showToast("Sign in to create collections.", "error"); return; }
    try {
      await svcCreateSmartCollection(uid, name, rules);
      showToast(`Created smart collection "${name}"`, "success", 1500);
    } catch (err) {
      console.error("Failed to create smart collection:", err);
      showToast("Failed to create smart collection.", "error");
    }
  };

  const updateSmartRules = async (collectionId: string, rules: SmartRule[]): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcUpdateSmartRules(uid, collectionId, rules);
    } catch (err) {
      console.error("Failed to update rules:", err);
    }
  };

  // ─── Universe Preferences Operations ─────────────────────────

  const addUniverseToPrefs = async (universeId: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) { showToast("Sign in to add universes.", "error"); return; }
    try {
      await svcAddUniverse(uid, universeId);
      // Optimistic update
      setUniversePrefs((prev) => {
        const existing = prev.find((p) => p.universeId === universeId);
        if (existing) {
          return prev.map((p) => p.universeId === universeId ? { ...p, isAdded: true, isHidden: false } : p);
        }
        return [...prev, { universeId, isAdded: true, isHidden: false, isPinned: false, addedAt: new Date().toISOString() }];
      });
      showToast("Universe added", "success", 1500);
    } catch (err) {
      console.error("Failed to add universe:", err);
      showToast("Failed to add universe.", "error");
    }
  };

  const removeUniverseFromPrefs = async (universeId: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcRemoveUniverse(uid, universeId);
      setUniversePrefs((prev) => prev.filter((p) => p.universeId !== universeId));
      showToast("Universe removed", "success", 1500);
    } catch (err) {
      console.error("Failed to remove universe:", err);
    }
  };

  const hideUniverseFromPrefs = async (universeId: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcHideUniverse(uid, universeId);
      setUniversePrefs((prev) => prev.map((p) =>
        p.universeId === universeId ? { ...p, isHidden: true } : p
      ));
    } catch (err) {
      console.error("Failed to hide universe:", err);
    }
  };

  const restoreUniverseToPrefs = async (universeId: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcRestoreUniverse(uid, universeId);
      setUniversePrefs((prev) => prev.map((p) =>
        p.universeId === universeId ? { ...p, isHidden: false } : p
      ));
      showToast("Universe restored", "success", 1500);
    } catch (err) {
      console.error("Failed to restore universe:", err);
    }
  };

  const pinUniverseInPrefs = async (universeId: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcPinUniverse(uid, universeId);
      setUniversePrefs((prev) => prev.map((p) =>
        p.universeId === universeId ? { ...p, isPinned: true } : p
      ));
    } catch (err) {
      console.error("Failed to pin universe:", err);
    }
  };

  const unpinUniverseInPrefs = async (universeId: string): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcUnpinUniverse(uid, universeId);
      setUniversePrefs((prev) => prev.map((p) =>
        p.universeId === universeId ? { ...p, isPinned: false } : p
      ));
    } catch (err) {
      console.error("Failed to unpin universe:", err);
    }
  };

  const setUniversePreferredOrder = async (universeId: string, order: ViewingOrder): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcSetPreferredOrder(uid, universeId, order);
      setUniversePrefs((prev) => prev.map((p) =>
        p.universeId === universeId ? { ...p, preferredOrder: order } : p
      ));
    } catch (err) {
      console.error("Failed to set preferred order:", err);
    }
  };

  const setUniversePreferredProvider = async (universeId: string, provider: TimelineProvider): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcSetPreferredProvider(uid, universeId, provider);
      setUniversePrefs((prev) => prev.map((p) =>
        p.universeId === universeId ? { ...p, preferredProvider: provider } : p
      ));
    } catch (err) {
      console.error("Failed to set preferred provider:", err);
    }
  };

  const saveOverrides = async (universeId: string, overrides: Record<string, Partial<CollectionEntry>>): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await svcSaveTimelineOverrides(uid, universeId, overrides);
      setUniversePrefs((prev) => prev.map((p) =>
        p.universeId === universeId ? { ...p, customOverrides: overrides } : p
      ));
    } catch (err) {
      console.error("Failed to save overrides:", err);
    }
  };

  // ─── Queries ─────────────────────────────────────────────────

  /** Check if a title is in a specific user collection */
  const isInCollection = (collectionId: string, titleId: string, mediaType: string): boolean => {
    const col = userCollections().find((c) => c.id === collectionId);
    if (!col) return false;
    return col.entries.some((e) => e.id === titleId && e.media_type === mediaType);
  };

  /** Get all user collections a title belongs to */
  const collectionsForTitle = (titleId: string, mediaType: string): Collection[] => {
    return userCollections().filter((c) =>
      c.entries.some((e) => e.id === titleId && e.media_type === mediaType)
    );
  };

  /** Compute progress for a collection against the vault */
  const getCollectionProgress = (col: Collection, vault: WatchlistItem[]): { owned: number; total: number; pct: number; completed: number; watching: number; missing: number; totalRuntime: number } => {
    // For smart collections, evaluate rules against vault
    let entries = col.entries;
    if (col.isSmart && col.smartRules && col.smartRules.length > 0) {
      const matched = evaluateSmartRules(col.smartRules, vault);
      entries = matched.map((v) => ({
        id: String(v.id),
        media_type: v.media_type,
        title: v.title,
        name: v.name,
        poster_path: v.poster_path,
        backdrop_path: v.backdrop_path,
        release_date: v.release_date,
        first_air_date: v.first_air_date,
        runtime: v.runtime
      }));
    }

    const total = entries.length;
    const owned = entries.filter((e) =>
      vault.some((v) => String(v.id) === String(e.id) && v.media_type === e.media_type)
    ).length;
    const completed = entries.filter((e) => {
      const v = vault.find((v) => String(v.id) === String(e.id) && v.media_type === e.media_type);
      return v?.status === "Completed";
    }).length;
    const watching = entries.filter((e) => {
      const v = vault.find((v) => String(v.id) === String(e.id) && v.media_type === e.media_type);
      return v?.status === "Watching";
    }).length;
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    const missing = total - owned;
    const totalRuntime = entries.reduce((sum, e) => sum + (e.runtime ?? 0), 0);
    return { owned, total, pct, completed, watching, missing, totalRuntime };
  };

  /** Resolve a smart collection's entries against the vault */
  const resolveSmartCollection = (col: Collection, vault: WatchlistItem[]): CollectionEntry[] => {
    if (!col.isSmart || !col.smartRules) return col.entries;
    const matched = evaluateSmartRules(col.smartRules, vault);
    return matched.map((v) => ({
      id: String(v.id),
      media_type: v.media_type,
      title: v.title,
      name: v.name,
      poster_path: v.poster_path,
      backdrop_path: v.backdrop_path,
      release_date: v.release_date,
      first_air_date: v.first_air_date,
      runtime: v.runtime
    }));
  };

  return {
    // Collections data
    userCollections,
    curatedCollections: curated,
    allCollections,
    loading,
    // Universe preferences
    universePrefs,
    addedUniverses,
    pinnedUniverses,
    suggestedUniverses,
    hiddenUniverses,
    getUniversePrefs,
    // Collection CRUD
    createCollection,
    addToCollection,
    removeFromCollection,
    deleteCollection,
    renameCollection,
    updateCollectionMeta,
    duplicateCollection,
    reorderEntries,
    createSmartCollection,
    updateSmartRules,
    // Universe preferences operations
    addUniverseToPrefs,
    removeUniverseFromPrefs,
    hideUniverseFromPrefs,
    restoreUniverseToPrefs,
    pinUniverseInPrefs,
    unpinUniverseInPrefs,
    setUniversePreferredOrder,
    setUniversePreferredProvider,
    saveOverrides,
    // Queries
    isInCollection,
    collectionsForTitle,
    getCollectionProgress,
    resolveSmartCollection
  };
};

const CollectionsContext = createContext<ReturnType<typeof useCollectionsLogic>>();

export const CollectionsProvider: ParentComponent = (props) => {
  const collections = useCollectionsLogic();
  return (
    <CollectionsContext.Provider value={collections}>
      {props.children}
    </CollectionsContext.Provider>
  );
};

export function useCollections() {
  const ctx = useContext(CollectionsContext);
  if (!ctx) throw new Error("useCollections must be used within a CollectionsProvider");
  return ctx;
}
