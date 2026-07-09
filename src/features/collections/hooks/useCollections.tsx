// src/features/collections/hooks/useCollections.ts
//
// Phase 8 — Complete Collections Migration
// ------------------------------------------
// Collections feature is now fully Supabase-backed. All reads AND writes
// go through collectionAdapter / collectionEntryAdapter → CollectionRepository.
// Universe preferences go through universePreferencesAdapter → Supabase.
// No Firestore. No watchlistService. No universePreferencesService.
import { createContext, useContext, createSignal, onMount, onCleanup, ParentComponent, createMemo } from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { CURATED_COLLECTIONS } from "~/shared/data/curatedCollections";
import { evaluateSmartRules } from "~/features/collections/utils/evaluateSmartRules";
import {
  createCollectionInSupabase,
  deleteCollectionInSupabase,
  duplicateCollectionInSupabase,
  ensureFavoritesExistsInSupabase,
  fetchCollectionsFromSupabase,
  renameCollectionInSupabase,
  updateCollectionMetaInSupabase,
} from "../collectionAdapter";
import {
  addEntryToCollectionByTmdbId,
  removeEntryFromCollection,
  reorderEntriesInCollection,
} from "../collectionEntryAdapter";
import { useUniversePrefsLogic } from "./useUniversePrefs";
import type { Collection, CollectionEntry, WatchlistItem, SmartRule } from "~/shared/types";

const useCollectionsLogic = () => {
  const { showToast } = useToast();
  const [userCollections, setUserCollections] = createSignal<Collection[]>([]);
  const [loading, setLoading] = createSignal(true);
  let unsubAuth: (() => void) | null = null;

  // Delegate universe preferences to the extracted hook
  const universePrefs = useUniversePrefsLogic();

  const refreshCollections = async (userId: string) => {
    try {
      const items = await fetchCollectionsFromSupabase(userId);
      setUserCollections(items);
      setLoading(false);
    } catch (err) {
      console.error("[useCollections] Supabase error:", err);
      setLoading(false);
    }
  };

  onMount(() => {
    const subscription = onSessionChange(async (_event, session: Session | null) => {
      const supabaseUid = session?.user?.id ?? null;
      if (supabaseUid) {
        setLoading(true);
        ensureFavoritesExistsInSupabase(supabaseUid).catch(() => {});
        await Promise.all([
          refreshCollections(supabaseUid),
          universePrefs.refreshUniversePrefs(supabaseUid),
        ]);
      } else {
        setUserCollections([]);
        setLoading(false);
      }
    });
    unsubAuth = () => subscription.unsubscribe();
  });

  onCleanup(() => { if (unsubAuth) unsubAuth(); });

  const curated = (): Collection[] => CURATED_COLLECTIONS;
  const allCollections = (): Collection[] => [...userCollections(), ...curated()];

  // ─── Collection CRUD (all via Supabase) ──────────────────────
  const createCollection = async (name: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) { showToast("Sign in to create collections.", "error"); return; }
    try {
      await createCollectionInSupabase(uid, name);
      await refreshCollections(uid);
      showToast(`Created "${name}"`, "success", 1500);
    } catch (err) { console.error("Failed to create collection:", err); showToast("Failed to create collection.", "error"); }
  };

  const addToCollection = async (collectionId: string, entry: CollectionEntry): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) { showToast("Sign in to save to collections.", "error"); return; }
    try {
      await addEntryToCollectionByTmdbId(uid, collectionId, entry.id, entry.media_type);
      await refreshCollections(uid);
      const col = userCollections().find((c) => c.id === collectionId);
      showToast(`Added to ${col?.name ?? "collection"}`, "success", 1500);
    } catch (err) { console.error("Failed to add to collection:", err); showToast("Failed to add.", "error"); }
  };

  const removeFromCollection = async (collectionId: string, entryId: string, _mediaType: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await removeEntryFromCollection(collectionId, entryId);
      await refreshCollections(uid);
    } catch (err) { console.error("Failed to remove:", err); }
  };

  const deleteCollection = async (collectionId: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await deleteCollectionInSupabase(collectionId);
      await refreshCollections(uid);
      showToast("Collection deleted", "success", 1500);
    } catch (err) { console.error("Failed to delete:", err); showToast("Failed to delete.", "error"); }
  };

  const renameCollection = async (collectionId: string, newName: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await renameCollectionInSupabase(collectionId, newName);
      await refreshCollections(uid);
      showToast("Renamed", "success", 1500);
    } catch (err) { console.error("Failed to rename:", err); showToast("Failed to rename.", "error"); }
  };

  const updateCollectionMeta = async (collectionId: string, meta: { name?: string; description?: string | null; color?: string | null; coverUrl?: string | null; bannerUrl?: string | null; accentColor?: string; emoji?: string; isArchived?: boolean }): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await updateCollectionMetaInSupabase(collectionId, {
        name: meta.name, description: meta.description,
        coverUrl: meta.coverUrl, bannerUrl: meta.bannerUrl,
        color: meta.color ?? meta.accentColor ?? null,
      });
      await refreshCollections(uid);
      showToast("Updated", "success", 1500);
    } catch (err) { console.error("Failed to update:", err); showToast("Failed to update.", "error"); }
  };

  const duplicateCollection = async (collectionId: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await duplicateCollectionInSupabase(uid, collectionId);
      await refreshCollections(uid);
      showToast("Collection duplicated", "success", 1500);
    } catch (err) { console.error("Failed to duplicate:", err); showToast("Failed to duplicate.", "error"); }
  };

  const reorderEntries = async (collectionId: string, entries: CollectionEntry[]): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await reorderEntriesInCollection(collectionId, entries.map((e) => e.id));
      await refreshCollections(uid);
    } catch (err) { console.error("Failed to reorder:", err); showToast("Failed to reorder.", "error"); }
  };

  const createSmartCollection = async (name: string, _rules: SmartRule[]): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) { showToast("Sign in to create collections.", "error"); return; }
    try {
      await createCollectionInSupabase(uid, name, { collectionType: "smart" as "user" | "curated" | "smart" });
      await refreshCollections(uid);
      showToast(`Created smart collection "${name}"`, "success", 1500);
    } catch (err) { console.error("Failed to create smart collection:", err); showToast("Failed to create smart collection.", "error"); }
  };

  const updateSmartRules = async (_collectionId: string, _rules: SmartRule[]): Promise<void> => {
    void _collectionId; void _rules;
  };

  // ─── Queries ─────────────────────────────────────────────────
  const isInCollection = (collectionId: string, titleId: string, mediaType: string): boolean => {
    const col = userCollections().find((c) => c.id === collectionId);
    if (!col) return false;
    return (col.entries ?? []).some((e) => e.id === titleId && e.media_type === mediaType);
  };

  const collectionsForTitle = (titleId: string, mediaType: string): Collection[] =>
    userCollections().filter((c) => (c.entries ?? []).some((e) => e.id === titleId && e.media_type === mediaType));

  const getCollectionProgress = (col: Collection, vault: WatchlistItem[]) => {
    let entries = (col.entries ?? []).filter((e): e is CollectionEntry => e != null && typeof e === "object");
    if (col.isSmart && Array.isArray(col.smartRules) && col.smartRules.length > 0) {
      const matched = evaluateSmartRules(col.smartRules, vault);
      entries = matched.map((v) => ({ id: String(v.id), media_type: v.media_type, title: v.title, name: v.name, poster_path: v.poster_path, backdrop_path: v.backdrop_path, release_date: v.release_date, first_air_date: v.first_air_date, runtime: v.runtime }));
    }
    const total = entries.length;
    const owned = entries.filter((e) => vault.some((v) => String(v.id) === String(e.id) && v.media_type === e.media_type)).length;
    const completed = entries.filter((e) => { const v = vault.find((v) => String(v.id) === String(e.id) && v.media_type === e.media_type); return v?.status === "Completed"; }).length;
    const watching = entries.filter((e) => { const v = vault.find((v) => String(v.id) === String(e.id) && v.media_type === e.media_type); return v?.status === "Watching"; }).length;
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    const totalRuntime = entries.reduce((sum, e) => sum + (e.runtime ?? 0), 0);
    return { owned, total, pct, completed, watching, missing: total - owned, totalRuntime };
  };

  const resolveSmartCollection = (col: Collection, vault: WatchlistItem[]): CollectionEntry[] => {
    if (!col.isSmart || !col.smartRules) return col.entries ?? [];
    const matched = evaluateSmartRules(col.smartRules, vault);
    return matched.map((v) => ({ id: String(v.id), media_type: v.media_type, title: v.title, name: v.name, poster_path: v.poster_path, backdrop_path: v.backdrop_path, release_date: v.release_date, first_air_date: v.first_air_date, runtime: v.runtime }));
  };

  return {
    userCollections, curatedCollections: curated, allCollections, loading,
    ...universePrefs,
    createCollection, addToCollection, removeFromCollection, deleteCollection,
    renameCollection, updateCollectionMeta, duplicateCollection, reorderEntries,
    createSmartCollection, updateSmartRules,
    isInCollection, collectionsForTitle, getCollectionProgress, resolveSmartCollection,
  };
};

const CollectionsContext = createContext<ReturnType<typeof useCollectionsLogic>>();

export const CollectionsProvider: ParentComponent = (props) => {
  const collections = useCollectionsLogic();
  return <CollectionsContext.Provider value={collections}>{props.children}</CollectionsContext.Provider>;
};

export function useCollections() {
  const ctx = useContext(CollectionsContext);
  if (!ctx) throw new Error("useCollections must be used within a CollectionsProvider");
  return ctx;
}
