// src/features/watchlist/watchlistService.ts
import { doc, updateDoc, deleteDoc, collection, addDoc } from "firebase/firestore";
import { db } from "~/core/firebase";
import type { WatchProgress, VaultFilters, CachedSeasonInfo } from "~/shared/types";

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
