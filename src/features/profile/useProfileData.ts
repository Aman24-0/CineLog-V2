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
// SSR safety: createResource is NOT used during SSR because it can cause
// the component to suspend indefinitely when the source (uid) is null.
// Instead, we use a client-only fetch triggered by createEffect. During
// SSR, loading is true (from authReady being false), so the skeleton
// renders. On the client, the effect fetches the profile data.

import { createSignal, createMemo, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { useAuth } from "~/shared/hooks/useAuth";
import { useProfile } from "~/lib/supabase/hooks/useProfile";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { fetchTmdbMetadata, fetchPersonDetails } from "~/core/tmdb/tmdb";
import { getAuthHeaders } from "~/lib/supabase/session";
import type { ProfileRow } from "~/lib/supabase/repositories";
import type { TMDBTitle } from "~/shared/types";
import type { UpdateProfilePayload } from "~/lib/supabase/repositories/profile";
import { notifyProfileBannerChanged } from "~/core/theme/profileBannerTheme";

// ---------------------------------------------------------------------------
// Banner self-healing helpers (Phase 18 deep-fix v2)
// ---------------------------------------------------------------------------

/**
 * Detect whether a banner URL points to our own Supabase Storage bucket
 * (the CORS-permissive, same-origin CDN we control) vs. an arbitrary
 * external host (wallpaperflare, etc.).
 *
 * Supabase Storage public URLs look like:
 *   https://<project-ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *
 * We accept either the canonical `/storage/v1/object/public/` path or
 * the legacy `/storage/v1/render/image/public/` (signed image-rendering
 * endpoint). Anything else is treated as an external URL that must be
 * proxied through our server before being handed to an <img> tag —
 * otherwise browsers that enforce CORP/CORB (Lemur, hardened Safari)
 * block the image with `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`.
 */
function isSupabaseStorageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".supabase.co")) {
      const p = parsed.pathname;
      return (
        p.includes("/storage/v1/object/public/") ||
        p.includes("/storage/v1/render/image/public/")
      );
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Phase 18 deep-fix v2: transparently migrate a legacy external banner
 * URL to a same-origin Supabase Storage URL.
 *
 * BEFORE this fix, the BannerEditor saved `banner_type='url'` with the
 * raw external URL stored in `profiles.banner_url`. The <img> tag then
 * loaded the URL directly from the external host. In browsers that
 * enforce Cross-Origin-Resource-Policy / CORB (Lemur, hardened Safari,
 * some Chrome enterprise configs), the image host's response headers
 * cause `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` and the banner
 * renders blank.
 *
 * The previous deep fix (commit f81bbfb) updated the BannerEditor to
 * proxy NEW URL saves through `/api/profile/banner-from-url` and store
 * the resulting Storage URL as `banner_type='upload'`. But that fix
 * did NOT migrate users who had ALREADY saved an external URL before
 * the fix was deployed — those users still have `banner_type='url'`
 * with the blocked external URL, and the banner still doesn't render.
 *
 * THIS fix self-heals those legacy profiles: when the profile is
 * loaded and we detect `banner_type='url'` with a non-Supabase
 * Storage URL, we transparently:
 *   1. Call `/api/profile/banner-from-url` to fetch the image
 *      server-side and upload it to Supabase Storage.
 *   2. Update the profile to `banner_type='upload'` with the
 *      resulting same-origin Storage URL.
 *   3. Return the updated profile so the UI renders the proxied URL.
 *
 * This migration runs ONCE per legacy user — after the first
 * successful migration, the profile has `banner_type='upload'` and the
 * self-heal check is a no-op. Failures are logged but non-fatal: the
 * UI still shows the external URL (which may work in some browsers).
 */
async function selfHealLegacyBannerUrl(
  userId: string,
  profile: ProfileRow,
  updateProfile: (
    id: string,
    payload: UpdateProfilePayload
  ) => Promise<{ error: Error | null }>
): Promise<ProfileRow> {
  if (profile.banner_type !== "url" || !profile.banner_url) {
    return profile;
  }
  if (isSupabaseStorageUrl(profile.banner_url)) {
    // Already migrated — someone else (another browser) may have
    // already self-healed this profile. Patch the type to 'upload'
    // so the BannerEditor treats it as a Storage URL going forward,
    // but don't re-proxy.
    return profile;
  }

  // External URL detected — proxy it through our server-side route.
  try {
    const resp = await fetch("/api/profile/banner-from-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getAuthHeaders())
      },
      body: JSON.stringify({ url: profile.banner_url })
    });
    if (!resp.ok) {
      console.warn(
        `[useProfileData] banner self-heal: proxy returned HTTP ${resp.status} for`,
        profile.banner_url
      );
      return profile;
    }
    const body = (await resp.json()) as { url?: string };
    if (!body.url || !isSupabaseStorageUrl(body.url)) {
      console.warn(
        "[useProfileData] banner self-heal: proxy returned an unexpected URL:",
        body.url
      );
      return profile;
    }

    // Persist the migration so every future load (and every other
    // browser) sees the same Storage URL.
    const { error: updateError } = await updateProfile(userId, {
      bannerType: "upload",
      bannerUrl: body.url
    });
    if (updateError) {
      console.warn(
        "[useProfileData] banner self-heal: profile update failed:",
        updateError.message
      );
      // Return the migrated profile anyway — the local UI can render
      // the proxied URL even if the DB write failed (it'll retry on
      // the next load).
      return { ...profile, banner_type: "upload", banner_url: body.url };
    }

    return { ...profile, banner_type: "upload", banner_url: body.url };
  } catch (err) {
    console.warn(
      "[useProfileData] banner self-heal failed (non-fatal):",
      err instanceof Error ? err.message : String(err)
    );
    return profile;
  }
}

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
  const { user, isSignedIn, authReady } = useAuth();
  const profileRepo = useProfile();
  const library = useUserLibrary();

  const [saving, setSaving] = createSignal(false);
  const [data, setData] = createSignal<ProfileData | null>(null);
  const [fetching, setFetching] = createSignal(false);
  const [fetchError, setFetchError] = createSignal<Error | null>(null);
  // `loaded` tracks whether the first successful fetch has completed.
  // Used to distinguish initial loading (show skeleton) from refreshing
  // (show RefreshingIndicator while keeping existing content visible).
  const [loaded, setLoaded] = createSignal(false);

  const uid = createMemo(() => user()?.uid ?? null);

  // The loader: fetch the profile row, then enrich favorites with TMDB.
  const loader = async (): Promise<ProfileData | null> => {
    const id = uid();
    if (!id) return null;

    const { data: profile, error } = await profileRepo.getProfile(id);
    if (error) throw error;
    if (!profile)
      return {
        profile: null,
        favoriteMovie: null,
        favoriteSeries: null,
        favoriteDirector: null
      };

    // Phase 18 deep-fix v2: self-heal legacy external banner URLs.
    // Runs BEFORE the favorites enrichment so the returned profile has
    // the migrated Storage URL — the ProfileBanner renders immediately
    // with the proxied URL instead of flashing the broken external
    // URL first. The migration is a no-op for profiles that already
    // have `banner_type='upload'` or a Supabase Storage URL.
    const healedProfile = await selfHealLegacyBannerUrl(
      id,
      profile,
      profileRepo.updateProfile
    );

    // Enrich favorites in parallel — each is independent and may fail
    // silently (the tile shows an empty state if enrichment fails).
    const [movie, series, director] = await Promise.all([
      healedProfile.favorite_movie_id
        ? fetchTmdbMetadata("movie", healedProfile.favorite_movie_id).catch(
            () => null
          )
        : Promise.resolve(null),
      healedProfile.favorite_series_id
        ? fetchTmdbMetadata("tv", healedProfile.favorite_series_id).catch(
            () => null
          )
        : Promise.resolve(null),
      healedProfile.favorite_director_id
        ? fetchFavoriteDirector(healedProfile.favorite_director_id).catch(
            () => null
          )
        : Promise.resolve(null)
    ]);

    return {
      profile: healedProfile,
      favoriteMovie: movie,
      favoriteSeries: series,
      favoriteDirector: director
    };
  };

  // Client-only fetch. During SSR, this effect does not run, so data
  // stays null and loading stays true (from authReady being false),
  // which causes the skeleton to render.
  let fetchingUid: string | null = null; // guard against concurrent doFetch calls
  const doFetch = async () => {
    if (isServer) return;
    const id = uid();
    if (!id) {
      // No user signed in — clear any stale data and ensure fetching is false
      setData(null);
      setFetchError(null);
      return;
    }
    // Guard: if already fetching for this uid, skip to avoid double-fetch
    if (fetchingUid === id) return;
    fetchingUid = id;

    setFetching(true);
    setFetchError(null);
    try {
      // 8-second timeout: Supabase queries should resolve quickly. If not,
      // release the skeleton so the page doesn't stay blank forever.
      const result = await Promise.race([
        loader(),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("Profile load timed out")), 8000)
        )
      ]);
      // Discard stale result if user changed while fetch was in-flight
      if (uid() !== id) return;
      setData(result);
      notifyProfileBannerChanged();
      setLoaded(true);
    } catch (err) {
      console.error("[useProfileData] Fetch failed:", err);
      // Discard stale error if user changed while fetch was in-flight
      if (uid() !== id) return;
      setFetchError(err instanceof Error ? err : new Error(String(err)));
      setData(null);
    } finally {
      fetchingUid = null;
      setFetching(false);
    }
  };

  // Trigger fetch when uid changes (sign-in / sign-out / auth ready).
  createEffect(() => {
    if (authReady()) {
      if (uid()) {
        doFetch();
      } else {
        // Signed out — clear profile data and ensure loading is false
        setData(null);
        notifyProfileBannerChanged();
        setFetchError(null);
        setFetching(false);
      }
    }
  });

  // loading is true while auth is resolving OR while the initial fetch is in flight.
  // Once loaded, subsequent fetches are "refreshes" — the existing content
  // stays visible and a RefreshingIndicator is shown instead of a skeleton.
  const loading = createMemo(() => !authReady() || (fetching() && !loaded()));
  const refreshing = createMemo(() => fetching() && loaded());
  const error = createMemo(() => fetchError());

  /**
   * Save profile fields to Supabase, then refetch so the UI reflects
   * the new state immediately.
   */
  const saveProfile = async (
    payload: UpdateProfilePayload
  ): Promise<boolean> => {
    const id = uid();
    if (!id) return false;

    setSaving(true);
    try {
      const { error: saveError } = await profileRepo.updateProfile(id, payload);
      if (saveError) throw saveError;
      await doFetch();
      return true;
    } catch (err) {
      console.error("[useProfileData] Save failed:", err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const refetch = () => doFetch();

  return {
    data,
    loading,
    refreshing,
    error,
    saving,
    saveProfile,
    refetch,
    // Expose the watchlist for the summary section.
    watchlist: library.watchlist,
    isGuest: () => authReady() && !isSignedIn()
  };
}

// ---------------------------------------------------------------------------
// Helper: fetch a TMDB person (director) by id
// ---------------------------------------------------------------------------

async function fetchFavoriteDirector(
  personId: string
): Promise<FavoriteDirector | null> {
  // Uses fetchPersonDetails which goes through cachedFetch (10-min TTL),
  // so repeated profile visits don't re-fetch the same person data.
  const data = await fetchPersonDetails(personId);
  if (!data) return null;
  return {
    id: String(data.id),
    name: data.name ?? "Unknown",
    profile_path: data.profile_path ?? null
  };
}
