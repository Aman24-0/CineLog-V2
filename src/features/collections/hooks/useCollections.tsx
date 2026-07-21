// src/features/collections/hooks/useCollections.ts
//
// Phase 8 — Complete Collections Migration
// Phase 9 — Optimistic Updates (Performance Fix #3)
// ------------------------------------------
// Collections feature is fully Supabase-backed with optimistic local
// updates. All writes update the signal immediately, fire the server
// write in the background, and rollback on error.
//
// refreshCollections() is now ONLY called on:
//   - Initial load (auth session change)
//   - removeVaultItemFromAllUserCollections (cross-collection cascade)
//   - DeactivateAccountSheet / ResetConfirmSheet (cache clear)
//
// All 8 ordinary mutations use optimistic updates:
//   addToCollection, removeFromCollection, createCollection,
//   renameCollection, deleteCollection, duplicateCollection,
//   reorderEntries, updateCollectionMeta
import {createContext, useContext, createSignal, onMount, onCleanup, createEffect, ParentComponent} from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import type { Session } from "~/lib/supabase/session";
import { getCurrentUid, useAuth } from "~/shared/hooks/useAuth";
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
  removeEntryFromCollectionByTmdbId,
  removeVaultItemFromAllCollections,
  reorderEntriesInCollection,
} from "../collectionEntryAdapter";
import { useUniversePrefsLogic } from "./useUniversePrefs";
import { createCollectionQueries } from "./collectionQueries";
import { COLLECTION_FEATURE_SUPPORT, UnsupportedFeatureError, detectUnsupportedMetaFields } from "../collectionErrors";
import type { CollectionMetaInput } from "../collectionErrors";
import type { Collection, CollectionEntry, SmartRule } from "~/shared/types";

// ---------------------------------------------------------------------------
// Optimistic update infrastructure
// ---------------------------------------------------------------------------

/** Counter for generating unique temp IDs for optimistically-created collections. */
let _tempIdCounter = 0;

/** Generate a temporary ID for optimistically-created collections. */
const makeTempId = (): string => `temp-${Date.now()}-${++_tempIdCounter}`;

/**
 * Registry of temp IDs awaiting reconciliation with server-assigned IDs.
 * Maps temp ID → { promise, resolve } so that operations on a just-created
 * collection (e.g., addToCollection) can await the real ID before sending
 * their own server writes.
 */
const pendingTempIds = new Map<string, {
  promise: Promise<string>;
  resolve: (id: string) => void;
}>();

/**
 * Wait for a collection's real server-assigned ID. If the collectionId is
 * not a temp ID (doesn't start with "temp-"), returns immediately.
 * Otherwise, waits for the server to respond with the real ID.
 */
const waitForRealId = async (collectionId: string): Promise<string> => {
  if (!collectionId.startsWith("temp-")) return collectionId;
  const entry = pendingTempIds.get(collectionId);
  if (entry) return entry.promise;
  // Already reconciled or not a tracked temp ID — return as-is.
  return collectionId;
};

/** Sort collections: Favorites first, then preserve existing order. */
const sortCollectionsLocal = (cols: Collection[]): Collection[] => {
  return [...cols].sort((a, b) => {
    if (a.isFavorites && !b.isFavorites) return -1;
    if (!a.isFavorites && b.isFavorites) return 1;
    return 0;
  });
};

/**
 * Apply local optimistic metadata fields from a CollectionMetaInput to a
 * Collection object. This includes BOTH supported and unsupported fields
 * (emoji, isArchived) so the UI updates immediately even for fields the
 * server can't persist.
 */
const applyMetaLocally = (
  col: Collection,
  meta: CollectionMetaInput,
): Collection => {
  const updated = { ...col };
  if (meta.name !== undefined) updated.name = meta.name;
  if (meta.description !== undefined) updated.description = meta.description ?? undefined;
  if (meta.coverUrl !== undefined) {
    updated.coverImagePath = meta.coverUrl ?? undefined;
    updated.poster_path = meta.coverUrl ?? undefined;
  }
  if (meta.bannerUrl !== undefined) updated.backdrop_path = meta.bannerUrl;
  if (meta.accentColor !== undefined) updated.accentColor = meta.accentColor;
  if (meta.color !== undefined) updated.accentColor = meta.color ?? undefined;
  // Unsupported fields — applied locally even though server won't persist.
  if (meta.emoji !== undefined) updated.emoji = meta.emoji;
  if (meta.isArchived !== undefined) updated.isArchived = meta.isArchived;
  updated.updatedAt = new Date().toISOString();
  return updated;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const useCollectionsLogic = () => {
  const { showToast } = useToast();
  const { authReady, isSignedIn } = useAuth();
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

  /**
   * Shared loader — called both from onSessionChange (when the user
   * signs in/out) AND from the reactive createEffect below (which
   * catches the initial session that onSessionChange can miss).
   *
   * Race-safe: tracks the latest in-flight uid so a stale fetch can't
   * overwrite a fresh one.
   */
  let lastFetchUid: string | null = null;
  const loadForUid = async (supabaseUid: string | null) => {
    if (supabaseUid) {
      // Skip if a fetch for this uid is already in flight.
      if (lastFetchUid === supabaseUid) return;
      lastFetchUid = supabaseUid;
      setLoading(true);
      // AWAIT ensureFavoritesExists BEFORE refreshing collections.
      // Previously this was fire-and-forget (.catch(() => {})), which
      // caused a race condition: multiple onSessionChange events would
      // each check for Favorites concurrently, find none, and each
      // create a duplicate. Awaiting ensures the check+create completes
      // before the collection list is refreshed.
      // Timeout guard (5 s): if Supabase is slow/unreachable, don't block
      // the entire collections page in skeleton state indefinitely.
      try {
        await Promise.race([
          ensureFavoritesExistsInSupabase(supabaseUid),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
        ]);
      } catch (err) {
        // Non-fatal: collections still load even if Favorites creation fails/times out.
        if ((err as Error)?.message !== "timeout") {
          console.error("[useCollections] ensureFavoritesExists failed:", err);
        }
      }
      await Promise.all([
        refreshCollections(supabaseUid),
        universePrefs.refreshUniversePrefs(supabaseUid),
      ]);
    } else {
      lastFetchUid = null;
      setUserCollections([]);
      setLoading(false);
    }
  };

  onMount(() => {
    try {
      const subscription = onSessionChange(async (_event, session: Session | null) => {
        const supabaseUid = session?.user?.id ?? null;
        await loadForUid(supabaseUid);
      });
      unsubAuth = () => subscription.unsubscribe();
    } catch (err) {
      console.error("[useCollections] Auth subscription failed:", err);
    }
  });

  /**
   * REACTIVE AUTH TRIGGER (bug fix).
   *
   * `onSessionChange` only fires on auth STATE CHANGES. If the user was
   * already logged in (persisted session in localStorage) before the
   * CollectionsProvider mounted, the listener may never receive an
   * INITIAL_SESSION event because the auth state was initialized
   * earlier by useAuth's checkInitialSession(). The result was that
   * `loading` stayed `true` forever and the Collections page showed
   * a skeleton.
   *
   * This createEffect mirrors the pattern used by useUserLibrary: it
   * reacts to `authReady()` + `isSignedIn()` and triggers the same
   * loader that onSessionChange uses. The loader is race-safe (tracks
   * the latest uid) so duplicate triggers are no-ops.
   */
  createEffect(() => {
    if (!authReady()) return;
    const uid = getCurrentUid();
    if (isSignedIn() && uid) {
      void loadForUid(uid);
    } else {
      void loadForUid(null);
    }
  });

  onCleanup(() => { if (unsubAuth) unsubAuth(); });

  const curated = (): Collection[] => CURATED_COLLECTIONS;
  const allCollections = (): Collection[] => [...userCollections(), ...curated()];

  // ─── Optimistic Collection CRUD ───────────────────────────

  /**
   * Create a new collection. Optimistic: adds a placeholder with a temp
   * ID immediately, then reconciles with the server-assigned ID on success.
   */
  const createCollection = async (name: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) { showToast("Sign in to create collections.", "error"); return; }

    const tempId = makeTempId();
    const now = new Date().toISOString();

    // Register the pending ID so subsequent operations (e.g., addToCollection)
    // on this temp-ID'd collection can await the real server ID.
    let resolveRealId!: (id: string) => void;
    const realIdPromise = new Promise<string>((resolve) => { resolveRealId = resolve; });
    pendingTempIds.set(tempId, { promise: realIdPromise, resolve: resolveRealId });

    const snapshot = userCollections();
    try {
      // Optimistic: add the new collection with temp ID
      setUserCollections(sortCollectionsLocal([
        ...snapshot,
        {
          id: tempId,
          name,
          type: "user" as const,
          entries: [],
          createdAt: now,
          updatedAt: now,
          isFavorites: false,
          isSmart: false,
        },
      ]));

      // Fire server write
      const serverId = await createCollectionInSupabase(uid, name);

      if (serverId) {
        // Reconcile: replace temp ID with real ID in local state
        setUserCollections((prev) =>
          prev.map((c) => c.id === tempId ? { ...c, id: serverId } : c)
        );
        // Resolve the pending promise so any waiting operations can proceed
        resolveRealId(serverId);
      } else {
        // Server didn't return an ID — keep the temp ID as fallback
        resolveRealId(tempId);
      }

      showToast(`Created "${name}"`, "success", 1500);
    } catch (err) {
      // Rollback: remove the optimistic placeholder
      setUserCollections(snapshot);
      resolveRealId(tempId);
      console.error("Failed to create collection:", err);
      showToast("Failed to create collection.", "error");
    } finally {
      pendingTempIds.delete(tempId);
    }
  };

  /**
   * Add an entry to a collection. Optimistic: pushes the entry onto the
   * collection's entries array immediately. If the collection was just
   * created (temp ID), waits for the real server ID before sending the
   * server write.
   */
  const addToCollection = async (collectionId: string, entry: CollectionEntry): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) { showToast("Sign in to save to collections.", "error"); return; }

    const snapshot = userCollections();
    try {
      // Optimistic: add entry to the target collection
      setUserCollections((prev) =>
        sortCollectionsLocal(
          prev.map((c) =>
            c.id === collectionId
              ? { ...c, entries: [...(c.entries ?? []), entry] }
              : c
          )
        )
      );

      // Wait for real ID if this is a temp collection
      const realId = await waitForRealId(collectionId);
      await addEntryToCollectionByTmdbId(uid, realId, entry.id, entry.media_type);

      const col = userCollections().find((c) => c.id === collectionId || c.id === realId);
      showToast(`Added to ${col?.name ?? "collection"}`, "success", 1500);
    } catch (err) {
      setUserCollections(snapshot);
      console.error("Failed to add to collection:", err);
      showToast("Failed to add.", "error");
    }
  };

  /**
   * Remove an entry from a collection. Optimistic: filters the entry out
   * of the collection's entries array immediately.
   */
  const removeFromCollection = async (collectionId: string, entryId: string, mediaType: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;

    const snapshot = userCollections();
    try {
      // Optimistic: remove entry from the target collection
      setUserCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                entries: (c.entries ?? []).filter(
                  (e) => !(e.id === entryId && e.media_type === mediaType)
                ),
              }
            : c
        )
      );

      await removeEntryFromCollectionByTmdbId(uid, collectionId, entryId, mediaType as "movie" | "tv");
    } catch (err) {
      setUserCollections(snapshot);
      console.error("Failed to remove:", err);
    }
  };

  /**
   * Remove a vault item from EVERY collection the user owns.
   * This is a cross-collection cascade operation that's hard to
   * optimise locally (entries use TMDB IDs, but we only have the
   * vault UUID). Falls back to full refreshCollections.
   */
  const removeVaultItemFromAllUserCollections = async (vaultId: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await removeVaultItemFromAllCollections(uid, vaultId);
      await refreshCollections(uid);
    } catch (err) { console.error("Failed to cascade-remove from collections:", err); }
  };

  /**
   * Delete a collection. Optimistic: removes the collection from the
   * local array immediately. Rollback re-adds it on failure.
   */
  const deleteCollection = async (collectionId: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;

    const snapshot = userCollections();
    const _target = snapshot.find((c) => c.id === collectionId);
    try {
      // Optimistic: remove the collection
      setUserCollections(snapshot.filter((c) => c.id !== collectionId));

      await deleteCollectionInSupabase(collectionId);
      showToast("Collection deleted", "success", 1500);
    } catch (err) {
      setUserCollections(snapshot);
      console.error("Failed to delete:", err);
      showToast("Failed to delete.", "error");
    }
  };

  /**
   * Rename a collection. Optimistic: updates the name in local state
   * immediately.
   */
  const renameCollection = async (collectionId: string, newName: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;

    const snapshot = userCollections();
    try {
      // Optimistic: update the name
      setUserCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId
            ? { ...c, name: newName, updatedAt: new Date().toISOString() }
            : c
        )
      );

      await renameCollectionInSupabase(collectionId, newName);
      showToast("Renamed", "success", 1500);
    } catch (err) {
      setUserCollections(snapshot);
      console.error("Failed to rename:", err);
      showToast("Failed to rename.", "error");
    }
  };

  /**
   * Update collection metadata. Optimistic: applies all metadata fields
   * (including unsupported ones like emoji, isArchived) to local state
   * immediately so the UI reflects the change instantly.
   */
  const updateCollectionMeta = async (collectionId: string, meta: CollectionMetaInput): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;

    const snapshot = userCollections();
    try {
      // Phase 8.1 — separate supported from unsupported fields for the
      // server write. For the optimistic local update, we apply ALL fields
      // (even unsupported ones) so the UI updates immediately.
      const { supported, dropped } = detectUnsupportedMetaFields(meta);

      // Optimistic: apply all meta fields locally
      setUserCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId ? applyMetaLocally(c, meta) : c
        )
      );

      // Server write — only supported fields
      await updateCollectionMetaInSupabase(collectionId, supported);

      if (dropped) {
        showToast(`Saved, but unsupported: ${dropped.droppedFields.join(", ")}`, "info", 3000);
      } else {
        showToast("Updated", "success", 1500);
      }
    } catch (err) {
      setUserCollections(snapshot);
      console.error("Failed to update:", err);
      showToast("Failed to update.", "error");
    }
  };

  /**
   * Duplicate a collection. Optimistic: clones the collection with
   * "(copy)" suffix and a temp ID, then reconciles with the server-
   * assigned ID on success.
   */
  const duplicateCollection = async (collectionId: string): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;

    const source = userCollections().find((c) => c.id === collectionId);
    if (!source) return;

    const tempId = makeTempId();
    const now = new Date().toISOString();

    // Register the pending ID
    let resolveRealId!: (id: string) => void;
    const realIdPromise = new Promise<string>((resolve) => { resolveRealId = resolve; });
    pendingTempIds.set(tempId, { promise: realIdPromise, resolve: resolveRealId });

    const snapshot = userCollections();
    try {
      // Optimistic: add a clone of the source collection
      const clone: Collection = {
        ...source,
        id: tempId,
        name: `${source.name} (copy)`,
        entries: [...(source.entries ?? [])],
        isFavorites: false,
        createdAt: now,
        updatedAt: now,
      };
      setUserCollections(sortCollectionsLocal([...snapshot, clone]));

      // Fire server write
      const serverId = await duplicateCollectionInSupabase(uid, collectionId);

      if (serverId) {
        // Reconcile: replace temp ID with real ID
        setUserCollections((prev) =>
          prev.map((c) => c.id === tempId ? { ...c, id: serverId } : c)
        );
        resolveRealId(serverId);
      } else {
        resolveRealId(tempId);
      }

      showToast("Collection duplicated", "success", 1500);
    } catch (err) {
      setUserCollections(snapshot);
      resolveRealId(tempId);
      console.error("Failed to duplicate:", err);
      showToast("Failed to duplicate.", "error");
    } finally {
      pendingTempIds.delete(tempId);
    }
  };

  /**
   * Reorder entries in a collection. Optimistic: replaces the entries
   * array with the new order immediately.
   */
  const reorderEntries = async (collectionId: string, entries: CollectionEntry[]): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) return;

    const snapshot = userCollections();
    try {
      // Optimistic: update entries to the new order
      setUserCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId
            ? { ...c, entries, updatedAt: new Date().toISOString() }
            : c
        )
      );

      await reorderEntriesInCollection(collectionId, entries.map((e) => e.id));
    } catch (err) {
      setUserCollections(snapshot);
      console.error("Failed to reorder:", err);
      showToast("Failed to reorder.", "error");
    }
  };

  const createSmartCollection = async (name: string, rules: SmartRule[]): Promise<void> => {
    const uid = getCurrentUid();
    if (!uid) { showToast("Sign in to create collections.", "error"); return; }

    const tempId = makeTempId();
    const now = new Date().toISOString();

    // Register the pending ID
    let resolveRealId!: (id: string) => void;
    const realIdPromise = new Promise<string>((resolve) => { resolveRealId = resolve; });
    pendingTempIds.set(tempId, { promise: realIdPromise, resolve: resolveRealId });

    const snapshot = userCollections();
    try {
      // Optimistic: add the new smart collection with temp ID
      setUserCollections(sortCollectionsLocal([
        ...snapshot,
        {
          id: tempId,
          name,
          type: "user" as const,
          entries: [],
          createdAt: now,
          updatedAt: now,
          isFavorites: false,
          isSmart: true,
          smartRules: rules,
        },
      ]));

      // Fire server write
      const serverId = await createCollectionInSupabase(uid, name, { collectionType: "smart" });

      if (serverId) {
        setUserCollections((prev) =>
          prev.map((c) => c.id === tempId ? { ...c, id: serverId } : c)
        );
        resolveRealId(serverId);
      } else {
        resolveRealId(tempId);
      }

      if (rules.length > 0) {
        showToast(
          `Created "${name}". Rules are evaluated live — not saved (schema limitation).`,
          "info",
          3000
        );
      } else {
        showToast(`Created smart collection "${name}"`, "success", 1500);
      }
    } catch (err) {
      setUserCollections(snapshot);
      resolveRealId(tempId);
      console.error("Failed to create smart collection:", err);
      showToast("Failed to create smart collection.", "error");
    } finally {
      pendingTempIds.delete(tempId);
    }
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
    refreshCollections,
    removeVaultItemFromAllUserCollections,
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
