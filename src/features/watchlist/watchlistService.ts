// src/features/watchlist/watchlistService.ts
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "~/core/firebase";
import type { WatchProgress } from "~/shared/types";

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
