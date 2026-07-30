/**
 * CineLog V2 — Collection Queries (internal)
 * ---------------------------------------------------------------------
 * Phase 8.1 — extracted from useCollections.tsx to keep file sizes
 * under 250 lines. Pure query functions that operate on the
 * userCollections signal + vault.
 */

import type { Accessor } from "solid-js";
import { evaluateSmartRules } from "~/features/collections/utils/evaluateSmartRules";
import type {
  Collection,
  CollectionEntry,
  WatchlistItem
} from "~/shared/types";

/**
 * Create the query methods that operate on the userCollections signal.
 * Returns the methods that `useCollectionsLogic` merges into its
 * public return value.
 */
export function createCollectionQueries(
  userCollections: Accessor<Collection[]>
) {
  /** Check if a title is in a specific user collection */
  const isInCollection = (
    collectionId: string,
    titleId: string,
    mediaType: string
  ): boolean => {
    const col = userCollections().find((c) => c.id === collectionId);
    if (!col) return false;
    return (col.entries ?? []).some(
      (e) => e.id === titleId && e.media_type === mediaType
    );
  };

  /** Get all user collections a title belongs to */
  const collectionsForTitle = (
    titleId: string,
    mediaType: string
  ): Collection[] =>
    userCollections().filter((c) =>
      (c.entries ?? []).some(
        (e) => e.id === titleId && e.media_type === mediaType
      )
    );

  /** Compute progress for a collection against the vault */
  const getCollectionProgress = (col: Collection, vault: WatchlistItem[]) => {
    let entries = (col.entries ?? []).filter(
      (e): e is CollectionEntry => e != null && typeof e === "object"
    );
    if (
      col.isSmart &&
      Array.isArray(col.smartRules) &&
      col.smartRules.length > 0
    ) {
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

    // Build a Map for O(1) vault lookups instead of O(n) vault.find() per entry.
    // Previously: 3x vault.find() per entry = O(entries * vault) comparisons.
    // Now: one Map build pass + O(1) per entry = O(entries + vault).
    const vaultMap = new Map<string, WatchlistItem>(
      vault.map((v) => [`${v.media_type}/${String(v.id)}`, v])
    );
    const getVaultItem = (e: CollectionEntry) =>
      vaultMap.get(`${e.media_type}/${String(e.id)}`) ?? null;

    let owned = 0,
      completed = 0,
      watching = 0;
    let totalRuntime = 0;
    for (const e of entries) {
      const v = getVaultItem(e);
      if (v) {
        owned++;
        if (v.status === "Completed") completed++;
        if (v.status === "Watching") watching++;
      }
      totalRuntime += e.runtime ?? 0;
    }
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    return {
      owned,
      total,
      pct,
      completed,
      watching,
      missing: total - owned,
      totalRuntime
    };
  };

  /** Resolve a smart collection's entries against the vault */
  const resolveSmartCollection = (
    col: Collection,
    vault: WatchlistItem[]
  ): CollectionEntry[] => {
    if (!col.isSmart || !col.smartRules) return col.entries ?? [];
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
    isInCollection,
    collectionsForTitle,
    getCollectionProgress,
    resolveSmartCollection
  };
}
