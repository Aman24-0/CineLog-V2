// src/features/watchlist/watchlistService.ts
import { doc, updateDoc, deleteDoc, collection, addDoc, setDoc, getDocs, query as fsQuery } from "firebase/firestore";
import { db } from "~/core/firebase";
import type { WatchProgress, VaultFilters, CachedSeasonInfo, WatchlistItem, Collection, CollectionEntry } from "~/shared/types";

const watchlistDoc = (uid: string, itemId: string) =>
  doc(db, "users", uid, "watchlist", String(itemId));

const collectionDoc = (uid: string, collectionId: string) =>
  doc(db, "users", uid, "collections", collectionId);

export const updateStatus = (uid: string, itemId: string, status: string) =>
  updateDoc(watchlistDoc(uid, itemId), { status });

export const updateRating = (uid: string, itemId: string, rating: number) =>
  updateDoc(watchlistDoc(uid, itemId), { rating });

export const updateNotes = (uid: string, itemId: string, notes: string) =>
  updateDoc(watchlistDoc(uid, itemId), { notes });

export const updateWatchDate = (uid: string, itemId: string, watchDate: string) =>
  updateDoc(watchlistDoc(uid, itemId), { watchDate });

export const updateSeasonEpisode = (
  uid: string,
  itemId: string,
  season: number,
  episode: number
) =>
  updateDoc(watchlistDoc(uid, itemId), {
    season,
    episode
  });

/**
 * updateSeasons — persist the cached season structure for a TV series.
 *
 * This cache is consumed by the shared progress engine to compute
 * SERIES-WIDE progress without needing to re-fetch TMDB details on
 * every dashboard render. The Details modal writes it whenever
 * `props.details.seasons` is available.
 *
 * Only `season_number > 0` entries are stored (specials excluded).
 */
export const updateSeasons = (
  uid: string,
  itemId: string,
  seasons: CachedSeasonInfo[]
) =>
  updateDoc(watchlistDoc(uid, itemId), { seasons });

export const updateWatchProgress = (
  uid: string,
  itemId: string,
  watchProgress: WatchProgress
) =>
  updateDoc(watchlistDoc(uid, itemId), {
    watchProgress
  });

/**
 * addToVault — create a new vault entry for a title that isn't in the vault yet.
 *
 * Uses `setDoc({ merge: true })` so the document is created if it doesn't
 * exist, or updated if it does (idempotent — safe to call on a title that's
 * already in the vault). This fixes the previous silent-fail bug where
 * `updateStatus` was used to add new titles but `updateDoc` no-ops on
 * non-existent documents.
 *
 * The `item` shape is the full WatchlistItem — callers construct it from
 * TMDB data (Discover, Search, Details) and pass it in. We add `addedAt`
 * and `updatedAt` timestamps so the Vault's "Recently Added" shelf works.
 *
 * Returns the item that was written (with timestamps) so callers can
 * update the modal's vaultItem state without a refetch.
 */
export const addToVault = async (
  uid: string,
  item: WatchlistItem
): Promise<WatchlistItem> => {
  const now = new Date().toISOString();
  // Strip null/undefined values before writing — Firestore accepts null but
  // mixing null and missing fields can cause orderBy query issues. Converting
  // null to undefined ensures the field is simply absent in the document.
  const cleanItem = Object.fromEntries(
    Object.entries(item).filter(([, v]) => v !== null && v !== undefined)
  ) as WatchlistItem;

  const itemWithTimestamps: WatchlistItem = {
    ...cleanItem,
    status: cleanItem.status || "Planned",
    season: cleanItem.season ?? 1,
    episode: cleanItem.episode ?? 1,
    addedAt: cleanItem.addedAt || now,
    updatedAt: now,
    watchProgress: cleanItem.watchProgress || {
      currentTime: 0,
      duration: 0,
      server: null,
      updatedAt: now,
      season: cleanItem.season ?? 1,
      episode: cleanItem.episode ?? 1
    }
  };
  await setDoc(watchlistDoc(uid, String(item.id)), itemWithTimestamps, { merge: true });
  return itemWithTimestamps;
};

export const deleteWatchlistItem = (uid: string, itemId: string) =>
  deleteDoc(watchlistDoc(uid, itemId));

export const savePreset = async (uid: string, name: string, filters: VaultFilters) => {
  const presetsRef = collection(db, "users", uid, "presets");
  return addDoc(presetsRef, { name, filters, createdAt: new Date().toISOString() });
};

export const deletePreset = async (uid: string, presetId: string) => {
  return deleteDoc(doc(db, "users", uid, "presets", presetId));
};

export const renamePreset = async (uid: string, presetId: string, name: string) => {
  return updateDoc(doc(db, "users", uid, "presets", presetId), { name });
};

/* ============================================================
   COLLECTION SERVICE — User collection CRUD operations
   ============================================================ */

/**
 * createUserCollection — create a new user collection (folder).
 * Uses setDoc with a generated id so the doc is created immediately.
 */
export const createUserCollection = async (
  uid: string,
  name: string,
  isFavorites = false
): Promise<Collection> => {
  const now = new Date().toISOString();
  const colRef = doc(collection(db, "users", uid, "collections"));
  const newCollection: Collection = {
    id: colRef.id,
    name,
    type: "user",
    entries: [],
    createdAt: now,
    updatedAt: now,
    isFavorites
  };
  await setDoc(colRef, newCollection);
  return newCollection;
};

/**
 * ensureFavoritesExists — create the Favorites folder if it doesn't exist.
 * Called on sign-in. Idempotent — safe to call every time.
 */
export const ensureFavoritesExists = async (uid: string): Promise<void> => {
  try {
    const q = fsQuery(collection(db, "users", uid, "collections"));
    const snap = await getDocs(q);
    const hasFavorites = snap.docs.some((d) => (d.data() as Collection)?.isFavorites);
    if (!hasFavorites) {
      await createUserCollection(uid, "Favorites", true);
    }
  } catch (err) {
    console.warn("Failed to ensure Favorites exists:", err);
  }
};

/**
 * addToUserCollection — add a title to a user collection.
 * If the title is already in the collection, it's a no-op (idempotent).
 */
export const addToUserCollection = async (
  uid: string,
  collectionId: string,
  entry: CollectionEntry
): Promise<void> => {
  const colRef = collectionDoc(uid, collectionId);
  // Fetch current entries, append, and write back
  const snap = await getDocs(fsQuery(collection(db, "users", uid, "collections")));
  const docSnap = snap.docs.find((d) => d.id === collectionId);
  if (!docSnap) return;
  const col = docSnap.data() as Collection;
  if (col.entries.some((e) => e.id === entry.id && e.media_type === entry.media_type)) return;
  const entries = [...col.entries, { ...entry, order: col.entries.length }];
  await updateDoc(colRef, { entries, updatedAt: new Date().toISOString() });
};

/**
 * removeFromUserCollection — remove a title from a user collection.
 */
export const removeFromUserCollection = async (
  uid: string,
  collectionId: string,
  entryId: string,
  entryMediaType: string
): Promise<void> => {
  const colRef = collectionDoc(uid, collectionId);
  const snap = await getDocs(fsQuery(collection(db, "users", uid, "collections")));
  const docSnap = snap.docs.find((d) => d.id === collectionId);
  if (!docSnap) return;
  const col = docSnap.data() as Collection;
  const entries = col.entries
    .filter((e) => !(e.id === entryId && e.media_type === entryMediaType))
    .map((e, i) => ({ ...e, order: i }));
  await updateDoc(colRef, { entries, updatedAt: new Date().toISOString() });
};

/**
 * deleteUserCollection — delete a user collection (folder).
 * The Favorites folder cannot be deleted.
 */
export const deleteUserCollection = async (
  uid: string,
  collectionId: string
): Promise<void> => {
  const snap = await getDocs(fsQuery(collection(db, "users", uid, "collections")));
  const docSnap = snap.docs.find((d) => d.id === collectionId);
  if (!docSnap) return;
  const col = docSnap.data() as Collection;
  if (col.isFavorites) return; // Favorites cannot be deleted
  await deleteDoc(collectionDoc(uid, collectionId));
};

/**
 * renameUserCollection — rename a user collection.
 * The Favorites folder cannot be renamed.
 */
export const renameUserCollection = async (
  uid: string,
  collectionId: string,
  newName: string
): Promise<void> => {
  const snap = await getDocs(fsQuery(collection(db, "users", uid, "collections")));
  const docSnap = snap.docs.find((d) => d.id === collectionId);
  if (!docSnap) return;
  const col = docSnap.data() as Collection;
  if (col.isFavorites) return; // Favorites cannot be renamed
  await updateDoc(collectionDoc(uid, collectionId), { name: newName, updatedAt: new Date().toISOString() });
};

/**
 * updateCollectionMeta — update collection metadata fields.
 * Supports description, accentColor, accentGradient, emoji, coverImagePath,
 * backgroundImagePath, sortOrder, isArchived, isFavorite, isSmart, smartRules.
 */
export const updateCollectionMeta = async (
  uid: string,
  collectionId: string,
  meta: Partial<Pick<Collection, 
    'description' | 'accentColor' | 'accentGradient' | 'emoji' |
    'coverImagePath' | 'backgroundImagePath' | 'sortOrder' | 
    'isArchived' | 'isFavorite' | 'isSmart' | 'smartRules'
  >>
): Promise<void> => {
  await updateDoc(collectionDoc(uid, collectionId), {
    ...meta,
    updatedAt: new Date().toISOString()
  });
};

/**
 * duplicateUserCollection — create a copy of a user collection.
 * The copy has a new ID and " (Copy)" appended to the name.
 */
export const duplicateUserCollection = async (
  uid: string,
  collectionId: string
): Promise<void> => {
  const snap = await getDocs(fsQuery(collection(db, "users", uid, "collections")));
  const docSnap = snap.docs.find((d) => d.id === collectionId);
  if (!docSnap) return;
  const col = docSnap.data() as Collection;
  if (col.isFavorites) return;
  
  const now = new Date().toISOString();
  const newColRef = doc(collection(db, "users", uid, "collections"));
  const newCollection: Collection = {
    ...col,
    id: newColRef.id,
    name: `${col.name} (Copy)`,
    isFavorites: false,
    createdAt: now,
    updatedAt: now
  };
  await setDoc(newColRef, newCollection);
};

/**
 * updateEntryOrder — persist reordered entries after drag-and-drop.
 * Also used for pin/hide/notes changes on individual entries.
 */
export const updateEntryOrder = async (
  uid: string,
  collectionId: string,
  entries: CollectionEntry[]
): Promise<void> => {
  await updateDoc(collectionDoc(uid, collectionId), {
    entries,
    updatedAt: new Date().toISOString()
  });
};

/**
 * createSmartCollection — create a rule-based smart collection.
 */
export const createSmartCollection = async (
  uid: string,
  name: string,
  rules: Collection['smartRules']
): Promise<void> => {
  const now = new Date().toISOString();
  const colRef = doc(collection(db, "users", uid, "collections"));
  const newCollection: Collection = {
    id: colRef.id,
    name,
    type: "user",
    entries: [],
    isSmart: true,
    smartRules: rules,
    createdAt: now,
    updatedAt: now
  };
  await setDoc(colRef, newCollection);
};

/**
 * updateSmartRules — update the rules for a smart collection.
 */
export const updateSmartRules = async (
  uid: string,
  collectionId: string,
  rules: Collection['smartRules']
): Promise<void> => {
  await updateDoc(collectionDoc(uid, collectionId), {
    smartRules: rules,
    updatedAt: new Date().toISOString()
  });
};
