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
 *
 * HISTORY SYNC (Phase 4 Task 9c):
 *   Opening the modal pushes a history entry so the browser Back button
 *   closes the modal (instead of navigating away) — mirroring the pattern
 *   used by the Details modal (useModalState.ts). Closing via the X
 *   button or ESC pops the history entry. The popstate listener ensures
 *   the modal closes if the user presses Back.
 */
export interface CollectionSelectedItem {
  franchise: FranchiseDefinition;
  /** The title that triggered the collection view (for highlighting in the timeline) */
  triggerTitleId?: string;
}

const [collectionSelectedItem, setCollectionSelectedItem] =
  createSignal<CollectionSelectedItem | null>(null);

// Track whether the current history entry is ours (so we don't pop twice).
// Module-level — mirrors the pattern in useModalState.ts.
let collectionHistoryEntryOurs = false;

/**
 * Internal: push a history entry when the modal opens, and listen for
 * popstate to close the modal when the user presses Back.
 *
 * Phase 4 Task 9c — copied from useModalState.ts's pushHistoryForModal.
 * The two hooks maintain SEPARATE history flags so they don't interfere
 * (e.g. if both modals are open, each manages its own entry). In
 * practice the Collection modal is only opened from inside the Details
 * modal, so the Collection modal's entry stacks on top of the Details
 * modal's entry — pressing Back closes the Collection modal first,
 * pressing Back again closes the Details modal.
 */
function pushHistoryForCollectionModal() {
  if (typeof window === "undefined") return;
  collectionHistoryEntryOurs = true;
  window.history.pushState({ cinelogCollectionModal: true }, "");
  window.addEventListener("popstate", handleCollectionPopState);
}

function handleCollectionPopState() {
  // The user pressed Back — close the modal (don't re-push history).
  collectionHistoryEntryOurs = false;
  setCollectionSelectedItem(null);
  if (typeof window !== "undefined") {
    window.removeEventListener("popstate", handleCollectionPopState);
  }
}

/**
 * openCollection — the single entry point for opening the Collection modal.
 * Pass the franchise definition (from detectFranchise or findFranchiseByName).
 * The optional triggerTitleId is used to highlight the current title in the
 * timeline view.
 *
 * Phase 4 Task 9c: also pushes a browser history entry so the Back button
 * closes the modal instead of navigating away from the page.
 */
export function openCollection(
  franchise: FranchiseDefinition,
  triggerTitleId?: string
): void {
  setCollectionSelectedItem({ franchise, triggerTitleId });
  pushHistoryForCollectionModal();
}

/**
 * closeCollection — the single entry point for closing the Collection modal.
 *
 * Phase 4 Task 9c: pops the history entry we pushed in openCollection
 * (if it's still ours), and clears the selectedItem signal.
 */
export function closeCollection(): void {
  if (typeof window !== "undefined") {
    window.removeEventListener("popstate", handleCollectionPopState);
    if (collectionHistoryEntryOurs) {
      collectionHistoryEntryOurs = false;
      // Use history.back() so the URL bar stays clean. This triggers
      // popstate, but we've already removed the listener.
      window.history.back();
    }
  }
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
