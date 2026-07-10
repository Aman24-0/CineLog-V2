// src/features/profile/useProfileData.ts
//
// useProfileData — the single source of truth for the Profile page.
//
// Responsibilities:
//   • Load the user's profile row from Supabase (profiles table).
//   • Load the user's watchlist (via useUserLibrary) for the summary.
//   • Provide inline-edit save functionality (display name, bio,
//     favorites, banner override).
//   • Expose loading / error / saving signals for the UI.
//
// Architecture:
//   ProfilePage → useProfileData → useProfile (Supabase) + useUserLibrary (watchlist)
//                                 → fetchTmdbMetadata (favorite movie/series/director enrichment)
//
// SSR safety: all data fetching happens inside createResource on the
// client. The hook returns `loading` which is true until the first
// profile fetch resolves. This prevents SSR hydration mismatches.

import { createResource, createSignal, createMemo } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useProfile } from "~/lib/supabase/hooks/useProfile";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { fetchTmdbMetadata } from "~/core/tmdb/tmdb";
import type { ProfileRow } from "~/lib/supabase/repositories";
import type { TMDBTitle } from "~/shared/types";
import type { UpdateProfilePayload } from "~/lib/supabase/repositories/profile";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A TMDB person (director) — lightweight shape for the favorite director tile. */
export interface FavoriteDirector {
  id: string;
  name: string;
  profile_path: string | null;
}

/** The complete profile data consumed by the Profile page. */
export interface ProfileData {
  /** The raw Supabase profile row. */
  profile: ProfileRow | null;
  /** Enriched favorite movie (null if not set or fetch failed). */
  favoriteMovie: TMDBTitle | null;
  /** Enriched favorite series (null if not set or fetch failed). */
  favoriteSeries: TMDBTitle | null;
  /** Enriched favorite director (null if not set or fetch failed). */
  favoriteDirector: FavoriteDirector | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useProfileData — loads the profile + enriches favorites with TMDB data.
 *
 * Returns:
 *   • data()      — ProfileData | null (null while loading or on error)
 *   • loading()   — true until the first fetch resolves
 *   • error()     — Error | null
 *   • saving()    — true while a save is in flight
 *   • saveProfile(payload) — write profile fields to Supabase + refetch
 *   • refetch()   — re-run the loader
 */
export function useProfileData() {
  const { user, isSignedIn } = useAuth();
  const profileRepo = useProfile();
  const library = useUserLibrary();

  const [saving, setSaving] = createSignal(false);

  const uid = createMemo(() => user()?.uid ?? null);

  // The loader: fetch the profile row, then enrich favorites with TMDB.
  // createResource re-runs whenever uid() changes (sign-in / sign-out).
  // For manual refetch after a save, we call refetch() directly.
  const loader = async (): Promise<ProfileData | null> => {
    const id = uid();
    if (!id) return null;

    const { data: profile, error } = await profileRepo.getProfile(id);
    if (error) throw error;
    if (!profile) return { profile: null, favoriteMovie: null, favoriteSeries: null, favoriteDirector: null };

    // Enrich favorites in parallel — each is independent and may fail
    // silently (the tile shows an empty state if enrichment fails).
    const [movie, series, director] = await Promise.all([
      profile.favorite_movie_id
        ? fetchTmdbMetadata("movie", profile.favorite_movie_id).catch(() => null)
        : Promise.resolve(null),
      profile.favorite_series_id
        ? fetchTmdbMetadata("tv", profile.favorite_series_id).catch(() => null)
        : Promise.resolve(null),
      profile.favorite_director_id
        ? fetchFavoriteDirector(profile.favorite_director_id).catch(() => null)
        : Promise.resolve(null),
    ]);

    return {
      profile,
      favoriteMovie: movie,
      favoriteSeries: series,
      favoriteDirector: director,
    };
  };

  const [data, { refetch }] = createResource(uid, loader);

  const loading = createMemo(() => data.loading);
  const error = createMemo(() => data.error ?? null);

  /**
   * Save profile fields to Supabase, then refetch so the UI reflects
   * the new state immediately.
   */
  const saveProfile = async (payload: UpdateProfilePayload): Promise<boolean> => {
    const id = uid();
    if (!id) return false;

    setSaving(true);
    try {
      const { error: saveError } = await profileRepo.updateProfile(id, payload);
      if (saveError) throw saveError;
      await refetch();
      return true;
    } catch (err) {
      console.error("[useProfileData] Save failed:", err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    data,
    loading,
    error,
    saving,
    saveProfile,
    refetch,
    // Expose the watchlist for the summary section.
    watchlist: library.watchlist,
    isGuest: () => !isSignedIn(),
  };
}

// ---------------------------------------------------------------------------
// Helper: fetch a TMDB person (director) by id
// ---------------------------------------------------------------------------

async function fetchFavoriteDirector(personId: string): Promise<FavoriteDirector | null> {
  try {
    const API = "https://api.themoviedb.org/3";
    const key = import.meta.env.VITE_TMDB_API_KEY;
    const res = await fetch(`${API}/person/${personId}?api_key=${key}&language=en-US`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: String(data.id),
      name: data.name ?? "Unknown",
      profile_path: data.profile_path ?? null,
    };
  } catch {
    return null;
  }
}
