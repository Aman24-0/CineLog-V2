// src/shared/hooks/useModalState.ts
import { createSignal } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import { findInVault } from "~/shared/utils/vaultMatch";

/**
 * SelectedItem — the title currently open in the Details modal.
 *
 * OWNERSHIP BOUNDARY (Phase 2.x refactor):
 *   The Details modal can be opened from three places:
 *     1. The Vault        — the title IS in the user's vault → vaultItem is set
 *     2. Discover         — the title is NOT in the vault     → vaultItem is null
 *     3. Search           — same as Discover                  → vaultItem is null
 *
 *   `baseItem` is ALWAYS the TMDB identity (id, media_type, poster, etc.)
 *   and is used to fetch full TMDB details. `vaultItem` is the user-owned
 *   state (status, rating, season/episode, notes) and is ONLY present when
 *   the title is in the vault.
 *
 *   Components gate user-owned UI on `vaultItem` — never on a fake default
 *   status. This is what prevents non-vault titles from showing "Planned"
 *   badges, user ratings, episode progress controls, etc.
 *
 *   When the user adds a non-vault title from the Details modal, the
 *   caller updates `vaultItem` to the newly-created vault entry. The
 *   modal re-renders with user-owned UI enabled — no remount needed.
 *
 * TMDB ID NAMESPACES (critical):
 *   TMDB IDs are NOT globally unique — they're only unique within their
 *   media_type namespace. movie/1398 is "Stalker (1979)"; tv/1398 is
 *   "The Sopranos". The openTitle helper matches on BOTH id AND
 *   media_type (via findInVault) so a search for Stalker never
 *   accidentally opens The Sopranos just because they share ID 1398.
 *
 * HISTORY SYNC (BUG 3 fix):
 *   Opening the modal pushes a history entry so the browser Back button
 *   closes the modal (instead of navigating away). Closing via the X
 *   button or ESC pops the history entry. The popstate listener ensures
 *   the modal closes if the user presses Back.
 */
export interface SelectedItem {
  /** TMDB identity — always present */
  baseItem: WatchlistItem;
  /** User-owned state — null when the title is not in the vault */
  vaultItem: WatchlistItem | null;
}

const [selectedItem, setSelectedItem] = createSignal<SelectedItem | null>(null);
export { setSelectedItem };

// Track whether the current history entry is ours (so we don't pop twice).
let historyEntryOurs = false;

/**
 * Internal: push a history entry when the modal opens, and listen for
 * popstate to close the modal when the user presses Back.
 */
function pushHistoryForModal() {
  if (typeof window === "undefined") return;
  historyEntryOurs = true;
  window.history.pushState({ cinelogModal: true }, "");
  window.addEventListener("popstate", handlePopState);
}

function handlePopState() {
  // The user pressed Back — close the modal (don't re-push history).
  historyEntryOurs = false;
  setSelectedItem(null);
  if (typeof window !== "undefined") {
    window.removeEventListener("popstate", handlePopState);
  }
}

/**
 * openTitle — the single entry point for opening the Details modal.
 *
 * Callers pass a baseItem (TMDB identity) and the current vault. The
 * helper resolves whether the title is in the vault and constructs the
 * SelectedItem with the correct vaultItem (or null). This centralizes
 * the ownership-boundary logic so callers never construct fake
 * WatchlistItems with default statuses.
 *
 * Also pushes a browser history entry so the Back button closes the
 * modal instead of navigating away from the page.
 */
export function openTitle(baseItem: WatchlistItem, vault: WatchlistItem[]): void {
  const vaultItem = findInVault(vault, baseItem);
  // If the title is in the vault, use the vault item as BOTH baseItem and
  // vaultItem — the vault item is a superset of TMDB identity. This keeps
  // the baseItem's status/rating fields honest (they come from the vault,
  // not from a Discover-constructed fake).
  const finalBase = vaultItem ?? baseItem;
  setSelectedItem({ baseItem: finalBase, vaultItem });
  pushHistoryForModal();
}

/**
 * closeTitle — the single entry point for closing the Details modal.
 *
 * Pops the history entry we pushed in openTitle (if it's still ours),
 * and clears the selectedItem signal.
 */
export function closeTitle(): void {
  if (typeof window !== "undefined") {
    window.removeEventListener("popstate", handlePopState);
    if (historyEntryOurs) {
      historyEntryOurs = false;
      // Use history.back() so the URL bar stays clean. This triggers
      // popstate, but we've already removed the listener.
      window.history.back();
    }
  }
  setSelectedItem(null);
}

export function useModalState() {
  return {
    selectedItem,
    setSelectedItem,
    openTitle,
    closeTitle,
    /**
     * Base z-index for sheets opened from the Details modal.
     *
     * Consumers like ConfirmRemoveSheet add a small offset to this value
     * (e.g. `zIndexBase + 2` for the backdrop, `zIndexBase + 3` for the
     * sheet) so the confirmation sheet always paints above the Details
     * modal (which uses z-[999999]).
     *
     * Previously this was 999990, meaning zIndexBase + 3 = 999993 was
     * BELOW the modal's z-999999 — the sheet was invisible behind the
     * modal backdrop, causing "delete vibrates but does nothing" (the
     * sheet WAS rendering but stacked below the modal). Setting this to
     * 1000000 ensures zIndexBase + 3 = 1000003 is safely above 999999.
     */
    zIndexBase: 1000000,
  };
}
