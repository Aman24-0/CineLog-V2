// src/features/discover/useDiscoverActions.ts
import { normalizeGenres } from "~/shared/utils/genres";
import { getCurrentUid } from "~/shared/hooks/useAuth";

import { useToast } from "~/shared/hooks/useToast";

import { useAuthModal } from "~/shared/hooks/useAuthModal";

import { createVaultItemInSupabase } from "~/features/watchlist/vaultAdapter";

import { defaultVaultStatus } from "~/core/preferences";

import { cacheMetadataEntries, buildCacheKey } from "~/shared/utils/tmdbCache";

import { resolveTmdbIdentity } from "~/shared/utils/tmdbIdentity";

import type { Accessor } from "solid-js";
import { useNavigate } from "@solidjs/router";

import type { TMDBTitle, WatchlistItem } from "~/shared/types";
import { titleDetailPath } from "~/shared/utils/titleRoutes";

/**
 * useDiscoverActions — action handlers for the Discover page.
 *
 * Extracted from DiscoverPage.tsx to keep that file under the 250-line
 * limit. Owns:
 *   - handleOpenTitle: navigate to the dedicated detail page for a TMDB title
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
  args: UseDiscoverActionsArgs
): UseDiscoverActionsResult {
  const { showToast } = useToast();
  const navigate = useNavigate();
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
      director: title.director
    };
    navigate(titleDetailPath(baseItem));
  };

  const addToVault = async (title: TMDBTitle) => {
    const uid = getCurrentUid();
    if (!uid || args.isGuest()) {
      showToast("Sign in to save titles to your vault.", "error");
      openAuthModal();
      return;
    }
    try {
      // ── Verify the entry still exists before writing it ──────────
      // TMDB search can return dead duplicates (movie-typed twins of a
      // series that get deleted later). Saving one creates an orphan
      // vault row that 404s forever. Probe the id first:
      //   • ok + corrected → the title only exists as the other media
      //     type; save it correctly instead of refusing.
      //   • missing → refuse (nothing to save).
      //   • unknown → TMDB hiccup; fail open and save what we have.
      const identity = await resolveTmdbIdentity(title.media_type, title.id);
      if (identity.status === "missing") {
        showToast(
          "This title no longer exists on TMDB. Pick another search result.",
          "error",
          2600
        );
        return;
      }

      const resolvedMediaType =
        identity.status === "ok" ? identity.mediaType : title.media_type;
      const resolved = identity.status === "ok" ? identity.metadata : null;
      const corrected = identity.status === "ok" && identity.corrected;

      const item: WatchlistItem = {
        id: String(title.id),
        title: resolved?.title ?? title.title,
        name: resolved?.name ?? title.name,
        media_type: resolvedMediaType,
        poster_path: resolved?.poster_path ?? title.poster_path,
        backdrop_path: resolved?.backdrop_path ?? title.backdrop_path,
        status: defaultVaultStatus(),
        release_date: resolved?.release_date ?? title.release_date,
        first_air_date: resolved?.first_air_date ?? title.first_air_date,
        genresList: normalizeGenres(
          (resolved?.genres ?? title.genres) as unknown[]
        ),
        director: resolved?.director ?? title.director
      };
      await createVaultItemInSupabase(uid, item);
      // Cache TMDB metadata for this title so the watchlist loads faster
      const cachePayload = resolved ?? title;
      cacheMetadataEntries([
        {
          key: buildCacheKey(resolvedMediaType, title.id),
          tmdb_id: Number(title.id),
          media_type: resolvedMediaType,
          data: { ...cachePayload, media_type: resolvedMediaType }
        }
      ]).catch((err) => {
        if (import.meta.env.DEV)
          console.warn("[discover] cache write failed:", err);
      });
      const name =
        resolved?.title || resolved?.name || title.title || title.name || "Title";
      if (corrected) {
        // TMDB listed this series as a movie — say so instead of silently
        // adding a different type than the row the user tapped.
        showToast(
          `Added "${name}" as a ${resolvedMediaType === "tv" ? "series" : "movie"}`,
          "success",
          2200
        );
      } else {
        showToast(`Added "${name}" to your vault`, "success", 1800);
      }
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
