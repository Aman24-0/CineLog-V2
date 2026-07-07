// src/features/collections/services/universePreferencesService.ts
import { doc, setDoc, getDocs, deleteDoc, updateDoc, collection, query as fsQuery } from "firebase/firestore";
import { db } from "~/core/firebase";
import type { UniversePreferences, CollectionEntry } from "~/shared/types";

const prefsDoc = (uid: string, universeId: string) =>
  doc(db, "users", uid, "universePreferences", universeId);

/**
 * Universe Preferences Service — CRUD for per-user universe personalization.
 *
 * Firestore path: users/{uid}/universePreferences/{universeId}
 *
 * Each document stores whether the user has added/hidden/pinned a universe,
 * their preferred viewing order and provider, and any custom timeline overrides.
 */

export async function addUniverse(uid: string, universeId: string): Promise<void> {
  const now = new Date().toISOString();
  const prefs: UniversePreferences = {
    universeId,
    isAdded: true,
    isHidden: false,
    isPinned: false,
    addedAt: now
  };
  await setDoc(prefsDoc(uid, universeId), prefs, { merge: true });
}

export async function removeUniverse(uid: string, universeId: string): Promise<void> {
  await deleteDoc(prefsDoc(uid, universeId));
}

export async function hideUniverse(uid: string, universeId: string): Promise<void> {
  await updateDoc(prefsDoc(uid, universeId), { isHidden: true });
}

export async function restoreUniverse(uid: string, universeId: string): Promise<void> {
  await updateDoc(prefsDoc(uid, universeId), { isHidden: false });
}

export async function pinUniverse(uid: string, universeId: string): Promise<void> {
  await updateDoc(prefsDoc(uid, universeId), { isPinned: true });
}

export async function unpinUniverse(uid: string, universeId: string): Promise<void> {
  await updateDoc(prefsDoc(uid, universeId), { isPinned: false });
}

export async function setPreferredOrder(uid: string, universeId: string, order: string): Promise<void> {
  await updateDoc(prefsDoc(uid, universeId), { preferredOrder: order });
}

export async function setPreferredProvider(uid: string, universeId: string, provider: string): Promise<void> {
  await updateDoc(prefsDoc(uid, universeId), { preferredProvider: provider });
}

export async function saveTimelineOverrides(
  uid: string,
  universeId: string,
  overrides: Record<string, Partial<CollectionEntry>>
): Promise<void> {
  await updateDoc(prefsDoc(uid, universeId), { customOverrides: overrides });
}

export async function fetchAllPreferences(uid: string): Promise<UniversePreferences[]> {
  const q = fsQuery(collection(db, "users", uid, "universePreferences"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      universeId: d.id,
      isAdded: data.isAdded === true,
      isHidden: data.isHidden === true,
      isPinned: data.isPinned === true,
      preferredOrder: data.preferredOrder,
      preferredProvider: data.preferredProvider,
      customOverrides: data.customOverrides,
      addedAt: data.addedAt,
    } as UniversePreferences;
  });
}
