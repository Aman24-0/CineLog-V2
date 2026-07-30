// src/shared/hooks/useCollectionModal.ts
import { createSignal } from "solid-js";
import type { FranchiseDefinition } from "~/shared/data/franchises";

/**
 * CollectionSelectedItem — the franchise currently open in the Collection modal.
 *
 * The Collection modal is opened from:
 *   1. Details page — FranchiseInfo detects the franchise and shows a trigger
 *   2. Discover — "Continue the Franchise" trajectory (future)
 *   3. Vault — Collections shelf (future)
 *
 * The modal fetches the full collection from TMDB (if tmdbCollectionId exists)
 * or falls back to keyword-based search. The franchise definition is passed
 * so the modal knows the name, keywords, and optional sagas.
 */
export interface CollectionSelectedItem {
  franchise: FranchiseDefinition;
  /** The title that triggered the collection view (for highlighting in the timeline) */
  triggerTitleId?: string;
}

const [collectionSelectedItem, setCollectionSelectedItem] =
  createSignal<CollectionSelectedItem | null>(null);

/**
 * openCollection — the single entry point for opening the Collection modal.
 * Pass the franchise definition (from detectFranchise or findFranchiseByName).
 * The optional triggerTitleId is used to highlight the current title in the
 * timeline view.
 */
export function openCollection(
  franchise: FranchiseDefinition,
  triggerTitleId?: string
): void {
  setCollectionSelectedItem({ franchise, triggerTitleId });
}

export function closeCollection(): void {
  setCollectionSelectedItem(null);
}

export function useCollectionModal() {
  return {
    collectionSelectedItem,
    setCollectionSelectedItem,
    openCollection,
    closeCollection
  };
}
