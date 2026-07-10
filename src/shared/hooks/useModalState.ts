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
 */
export interface SelectedItem {
  /** TMDB identity — always present */
  baseItem: WatchlistItem;
  /** User-owned state — null when the title is not in the vault */
  vaultItem: WatchlistItem | null;
}

const [selectedItem, setSelectedItem] = createSignal<SelectedItem | null>(null);

/**
 * openTitle — the single entry point for opening the Details modal.
 *
 * Callers pass a baseItem (TMDB identity) and the current vault. The
 * helper resolves whether the title is in the vault and constructs the
 * SelectedItem with the correct vaultItem (or null). This centralizes
 * the ownership-boundary logic so callers never construct fake
 * WatchlistItems with default statuses.
 *
 * The baseItem may be a real WatchlistItem (from the vault) or a
 * TMDB-derived shape (from Discover / Search). Either way, the helper
 * checks the vault by id AND media_type (via findInVault) and uses the
 * REAL vault item as vaultItem when present — never the passed-in
 * baseItem's status/rating.
 */
export function openTitle(baseItem: WatchlistItem, vault: WatchlistItem[]): void {
  const vaultItem = findInVault(vault, baseItem);
  // If the title is in the vault, use the vault item as BOTH baseItem and
  // vaultItem — the vault item is a superset of TMDB identity. This keeps
  // the baseItem's status/rating fields honest (they come from the vault,
  // not from a Discover-constructed fake).
  const finalBase = vaultItem ?? baseItem;
  setSelectedItem({ baseItem: finalBase, vaultItem });
}

export function useModalState() {
  return {
    selectedItem,
    setSelectedItem,
    openTitle
  };
}
