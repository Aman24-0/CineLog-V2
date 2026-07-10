// src/features/collections/hooks/useCollections.ts
//
// Phase 8 — Complete Collections Migration
// ------------------------------------------
// Collections feature is now fully Supabase-backed. All reads AND writes
// go through collectionAdapter / collectionEntryAdapter → CollectionRepository.
// Universe preferences go through universePreferencesAdapter → Supabase.
// No Firestore. No watchlistService. No universePreferencesService.
import {createContext, useContext, createSignal, onMount, onCleanup, ParentComponent} from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { CURATED_COLLECTIONS } from "~/shared/data/curatedCollections";
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
import { createCollectionQueries } from "./collectionQueries";
import { COLLECTION_FEATURE_SUPPORT, UnsupportedFeatureError, detectUnsupportedMetaFields } from "../collectionErrors";
import type { CollectionMetaInput } from "../collectionErrors";
import type { Collection, CollectionEntry, SmartRule } from "~/shared/types";

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
      // Defensive: the adapter already returns [] on error, but guard
      // against an unexpected null/undefined so a downstream .map()
      // never throws "Cannot read properties of null".
      setUserCollections(Array.isArray(items) ? items : []);
      setLoading(false);
    } catch (err) {
      console.error("[useCollections] Supabase error:", err);
      setUserCollections([]);
      setLoading(false);
    }
  };

  onMount(() => {
    try {
      const subscription = onSessionChange(async (_event, session: Session | null) => {
        const supabaseUid = session?.user?.id ?? null;
        if (supabaseUid) {
          setLoading(true);
          // AWAIT ensureFavoritesExists BEFORE refreshing collections.
          // Previously this was fire-and-forget (.catch(() => {})), which
          // caused a race condition: multiple onSessionChange events would
          // each check for Favorites concurrently, find none, and each
          // create a duplicate. Awaiting ensures the check+create completes
          // before the collection list is refreshed.
          try {
            await ensureFavoritesExistsInSupabase(supabaseUid);
          } catch (err) {
            console.error("[useCollections] ensureFavoritesExists failed:", err);
          }
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
    } catch (err) {
      console.error("[useCollections] Auth subscription failed:", err);
    }
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

  const updateCollectionMeta = async (collectionId: string, meta: CollectionMetaInput): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      // Phase 8.1 — separate supported from unsupported fields.
      // Unsupported fields produce an explicit warning (never silent).
      const { supported, dropped } = detectUnsupportedMetaFields(meta);
      await updateCollectionMetaInSupabase(collectionId, supported);
      await refreshCollections(uid);
      if (dropped) {
        showToast(`Saved, but unsupported: ${dropped.droppedFields.join(", ")}`, "info", 3000);
      } else {
        showToast("Updated", "success", 1500);
      }
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

  const createSmartCollection = async (name: string, rules: SmartRule[]): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) { showToast("Sign in to create collections.", "error"); return; }
    try {
      // Phase 8.1 — Smart collection rules are NOT persisted. The
      // collections table has no JSONB or rules column (Database Bible
      // §04 defines collection_type='smart' but no rules column).
      // We create the collection with type='smart' so the UI can
      // identify it, but the rules themselves are client-side only.
      // The user is explicitly warned — no silent data loss.
      await createCollectionInSupabase(uid, name, { collectionType: "smart" });
      await refreshCollections(uid);
      if (rules.length > 0) {
        showToast(
          `Created "${name}". Rules are evaluated live — not saved (schema limitation).`,
          "info",
          3000
        );
      } else {
        showToast(`Created smart collection "${name}"`, "success", 1500);
      }
    } catch (err) { console.error("Failed to create smart collection:", err); showToast("Failed to create smart collection.", "error"); }
  };

  const updateSmartRules = async (collectionId: string, rules: SmartRule[]): Promise<void> => {
    // Phase 8.1 — Smart collection rules CANNOT be persisted. The
    // collections table has no JSONB or rules column. Instead of
    // silently ignoring (the old behavior), we throw an explicit
    // UnsupportedFeatureError. The hook catches it and shows a toast.
    void collectionId;
    if (rules.length > 0) {
      const err = new UnsupportedFeatureError(
        "smartRules",
        COLLECTION_FEATURE_SUPPORT.smartRules.limitation,
        "Smart collection rules cannot be saved — the database schema does not support persisting rules."
      );
      console.warn(err.message);
      showToast("Rules are evaluated live and cannot be saved (schema limitation).", "info", 3000);
    }
  };

  // ─── Queries (delegated to collectionQueries.ts) ─────────────
  const queries = createCollectionQueries(userCollections);

  return {
    userCollections, curatedCollections: curated, allCollections, loading,
    ...universePrefs,
    createCollection, addToCollection, removeFromCollection, deleteCollection,
    renameCollection, updateCollectionMeta, duplicateCollection, reorderEntries,
    createSmartCollection, updateSmartRules,
    ...queries,
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
