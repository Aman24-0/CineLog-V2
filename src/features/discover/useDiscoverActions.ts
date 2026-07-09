// src/features/discover/useDiscoverActions.ts
import { getClient } from "~/lib/supabase/client";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import { createVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";
import type { Accessor } from "solid-js";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";

/**
 * useDiscoverActions — action handlers for the Discover page.
 *
 * Extracted from DiscoverPage.tsx to keep that file under the 250-line
 * limit. Owns:
 *   - handleOpenTitle: open the Details modal for a TMDB title
 *   - addToVault: one-tap save as "Planned" (with guest → OAuth sign-in flow)
 *   - handleLogin: Google OAuth sign-in for the guest nudge
 */
export interface UseDiscoverActionsArgs {
  watchlist: Accessor<WatchlistItem[]>;
  isGuest: Accessor<boolean>;
}

export interface UseDiscoverActionsResult {
  handleOpenTitle: (title: TMDBTitle) => void;
  addToVault: (title: TMDBTitle) => Promise<void>;
  handleLogin: () => Promise<void>;
}

export function useDiscoverActions(
  args: UseDiscoverActionsArgs,
): UseDiscoverActionsResult {
  const { showToast } = useToast();
  const { openTitle } = useModalState();

  const handleOpenTitle = (title: TMDBTitle) => {
    const baseItem: WatchlistItem = {
      id: String(title.id),
      title: title.title,
      name: title.name,
      media_type: title.media_type,
      poster_path: title.poster_path,
      backdrop_path: title.backdrop_path,
      status: "Planned", // placeholder — openTitle ignores this for non-vault titles
      release_date: title.release_date,
      first_air_date: title.first_air_date,
      genresList: title.genres,
      director: title.director,
    };
    openTitle(baseItem, args.watchlist());
  };

  const addToVault = async (title: TMDBTitle) => {
    const uid = getCurrentUid();
    if (!uid) {
      showToast("Sign in to save titles to your vault.", "error");
      return;
    }
    if (args.isGuest()) {
      try {
        const supabase = getClient();
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo:
              typeof window !== "undefined" ? window.location.origin : undefined,
          },
        });
        if (oauthError) throw oauthError;
        showToast("Signed in — try saving again.", "success");
      } catch {
        showToast("Sign in failed. Please try again.", "error");
      }
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
        status: "Planned",
        release_date: title.release_date,
        first_air_date: title.first_air_date,
        genresList: title.genres,
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

  const handleLogin = async () => {
    try {
      const supabase = getClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) throw error;
      showToast("Signed in to CineLog", "success");
    } catch {
      showToast("Sign in failed. Please try again.", "error");
    }
  };

  return { handleOpenTitle, addToVault, handleLogin };
}
