// src/features/watchlist/watchlistService.ts
import { doc, updateDoc, deleteDoc, collection, addDoc, setDoc } from "firebase/firestore";
import { db } from "~/core/firebase";
import type { WatchProgress, VaultFilters, CachedSeasonInfo, WatchlistItem } from "~/shared/types";

const watchlistDoc = (uid: string, itemId: string) =>
  doc(db, "users", uid, "watchlist", String(itemId));

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
