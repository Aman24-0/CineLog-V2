// src/features/discover/useDiscoverActions.ts
import { normalizeGenres } from "~/shared/utils/genres";
import { getCurrentUid } from "~/shared/hooks/useAuth";

import { useToast } from "~/shared/hooks/useToast";

import { useModalState } from "~/shared/hooks/useModalState";

import { useAuthModal } from "~/shared/hooks/useAuthModal";

import { createVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";

import { defaultVaultStatus } from "~/core/preferences";

import type { Accessor } from "solid-js";

import type { TMDBTitle, WatchlistItem } from "~/shared/types";


/**
 * useDiscoverActions — action handlers for the Discover page.
 *
 * Extracted from DiscoverPage.tsx to keep that file under the 250-line
 * limit. Owns:
 *   - handleOpenTitle: open the Details modal for a TMDB title
 *   - addToVault: one-tap save as "Planned" (with guest → auth modal)
 *   - handleLogin: open the auth modal for the guest nudge
 */
export interface UseDiscoverActionsArgs {
  watchlist: Accessor<WatchlistItem[]>;
  isGuest: Accessor<boolean>;
}

export interface UseDiscoverActionsResult {
  handleOpenTitle: (title: TMDBTitle) => void;
  addToVault: (title: TMDBTitle) => Promise<void>;
  handleLogin: () => void;
}

export function useDiscoverActions(
  args: UseDiscoverActionsArgs,
): UseDiscoverActionsResult {
  const { showToast } = useToast();
  const { openTitle } = useModalState();
  const { openAuthModal } = useAuthModal();

  const handleOpenTitle = (title: TMDBTitle) => {
    const baseItem: WatchlistItem = {
      id: String(title.id),
      title: title.title,
      name: title.name,
      media_type: title.media_type,
      poster_path: title.poster_path,
      backdrop_path: title.backdrop_path,
      status: "Planned",
      release_date: title.release_date,
      first_air_date: title.first_air_date,
      genresList: normalizeGenres(title.genres as unknown[]),
      director: title.director,
    };
    openTitle(baseItem, args.watchlist());
  };

  const addToVault = async (title: TMDBTitle) => {
    const uid = getCurrentUid();
    if (!uid || args.isGuest()) {
      showToast("Sign in to save titles to your vault.", "error");
      openAuthModal();
      return;
    }
    try {
      const item: WatchlistItem = {
        id: String(title.id),
        title: title.title,
        name: title.name,
        media_type: title.media_type,
        poster_path: title.poster_path,
        backdrop_path: title.backdrop_path,
        status: defaultVaultStatus(),
        release_date: title.release_date,
        first_air_date: title.first_air_date,
        genresList: normalizeGenres(title.genres as unknown[]),
        director: title.director,
      };
      await createVaultItemInSupabase(uid, item);
      const name = title.title || title.name || "Title";
      showToast(`Added "${name}" to your vault`, "success", 1800);
    } catch (err) {
      console.error("Failed to add to vault:", err);
      showToast("Failed to save. Try again.", "error");
    }
  };

  const handleLogin = () => {
    openAuthModal();
  };

  return { handleOpenTitle, addToVault, handleLogin };
}
