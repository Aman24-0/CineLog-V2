// src/features/collections/hooks/useCollections.ts
import { createContext, useContext, createSignal, onMount, onCleanup, ParentComponent, Accessor } from "solid-js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { auth, db } from "~/core/firebase";
import {
  createUserCollection as svcCreateUserCollection,
  ensureFavoritesExists,
  addToUserCollection as svcAddToUserCollection,
  removeFromUserCollection as svcRemoveFromUserCollection,
  deleteUserCollection as svcDeleteUserCollection,
  renameUserCollection as svcRenameUserCollection
} from "~/features/watchlist/watchlistService";
import { useToast } from "~/shared/hooks/useToast";
import { CURATED_COLLECTIONS } from "~/shared/data/curatedCollections";
import type { Collection, CollectionEntry, WatchlistItem } from "~/shared/types";

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
 *
 * The hook auto-creates the Favorites folder on sign-in (if missing).
 */
const useCollectionsLogic = () => {
  const { showToast } = useToast();
  const [userCollections, setUserCollections] = createSignal<Collection[]>([]);
  const [loading, setLoading] = createSignal(true);

  let unsub: (() => void) | null = null;
  let unsubAuth: (() => void) | null = null;

  onMount(() => {
    unsubAuth = onAuthStateChanged(auth, (u) => {
      if (unsub) { unsub(); unsub = null; }
      if (u) {
        // Ensure Favorites folder exists
        ensureFavoritesExists(u.uid).catch(() => {});

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
      } else {
        setUserCollections([]);
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
  const getCollectionProgress = (col: Collection, vault: WatchlistItem[]): { owned: number; total: number; pct: number } => {
    const total = col.entries.length;
    const owned = col.entries.filter((e) =>
      vault.some((v) => String(v.id) === String(e.id) && v.media_type === e.media_type)
    ).length;
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    return { owned, total, pct };
  };

  return {
    userCollections,
    curatedCollections: curated,
    allCollections,
    loading,
    createCollection,
    addToCollection,
    removeFromCollection,
    deleteCollection,
    renameCollection,
    isInCollection,
    collectionsForTitle,
    getCollectionProgress
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
