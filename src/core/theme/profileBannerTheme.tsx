import { createEffect, on, onCleanup, type Component } from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useProfile } from "~/lib/supabase/hooks/useProfile";
import { fetchTmdbMetadata, tmdbImage } from "~/core/tmdb/tmdb";
import { extractBackdropProfile } from "~/shared/utils/colorExtractor";
import { withImageCacheBust } from "~/shared/utils/imageUrl";
import type { ProfileRow } from "~/lib/supabase/repositories";
import {
  DEFAULT_PROFILE_THEME,
  profileToTheme,
  type ProfileTheme
} from "./profileBannerThemeUtils";

export const PROFILE_BANNER_CHANGED_EVENT = "cinelog:profile-banner-changed";

type BannerProfile = Pick<
  ProfileRow,
  | "banner_type"
  | "banner_url"
  | "favorite_movie_id"
  | "favorite_series_id"
  | "updated_at"
>;

function toCssUrl(url: string | null): string {
  if (!url) return "none";
  return `url(${JSON.stringify(url)})`;
}

function setDocumentTheme(theme: ProfileTheme): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const active = theme.active ?? theme.primary;
  const values: Record<string, string> = {
    "--ambient-color-1": `rgb(${theme.primary})`,
    "--ambient-color-2": `rgb(${theme.secondary})`,
    "--ambient-color-3": `rgb(${theme.tertiary})`,
    "--profile-ambient-primary": theme.primary,
    "--profile-ambient-secondary": theme.secondary,
    "--profile-ambient-neutral": theme.neutral,
    "--profile-ambient-highlight": theme.highlight,
    "--profile-ambient-shell": theme.shell,
    "--profile-ambient-image": theme.image,
    "--profile-ambient-image-opacity": theme.imageOpacity,
    "--profile-ambient-image-brightness": theme.imageBrightness,
    "--profile-ambient-image-saturation": theme.imageSaturation,
    "--profile-ambient-ready": theme.profileReady,
    "--p": `rgb(${active})`,
    "--p2": `rgb(${theme.secondary})`,
    "--p-glow": `rgb(${active} / 0.24)`,
    "--p-dim": `rgb(${active} / 0.1)`,
    "--p-border": `rgb(${active} / 0.42)`,
    "--p-hover": `rgb(${active} / 0.14)`,
    "--active-bg": `rgb(${active})`,
    "--active-text": theme.activeText ?? "#ffffff",
    "--active-border": `rgb(${active})`,
    "--active-glow": `0 0 12px rgb(${active} / 0.24)`,
    "--void": `rgb(${theme.shell})`,
    "--deep": `rgb(${theme.shell})`,
    "--void-ambient": `rgb(${theme.shell} / 0.42)`,
    // These surface values keep glass cards and chrome subtly related to the
    // banner instead of leaving the app on a fixed blue-black tint.
    "--surface": `rgb(${theme.neutral} / 0.62)`,
    "--raised": `rgb(${theme.neutral} / 0.78)`,
    "--glass-tint": `rgb(${theme.shell})`
  };

  for (const [name, value] of Object.entries(values)) {
    root.style.setProperty(name, value);
  }
}

export function resetProfileBannerTheme(): void {
  setDocumentTheme({
    ...DEFAULT_PROFILE_THEME,
    image: toCssUrl(null)
  });
}

export function notifyProfileBannerChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROFILE_BANNER_CHANGED_EVENT));
  }
}

async function resolveFavoriteBackdrop(
  profile: Pick<ProfileRow, "favorite_movie_id" | "favorite_series_id">
): Promise<string | null> {
  try {
    if (profile.favorite_movie_id) {
      const movie = await fetchTmdbMetadata("movie", profile.favorite_movie_id);
      if (movie?.backdrop_path) {
        return tmdbImage(movie.backdrop_path, "w1280");
      }
    }

    if (profile.favorite_series_id) {
      const series = await fetchTmdbMetadata("tv", profile.favorite_series_id);
      if (series?.backdrop_path) {
        return tmdbImage(series.backdrop_path, "w1280");
      }
    }
  } catch (error) {
    console.warn(
      "[ProfileAmbientTheme] Failed to resolve favorite backdrop:",
      error
    );
  }
  return null;
}

function canLoadBannerImage(url: string): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(loaded);
    };
    const timeoutId = setTimeout(() => finish(false), 10_000);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

/**
 * Resolve the same visible image ProfileBanner renders. A broken custom URL
 * falls back to the favourite movie/series artwork before the neutral state.
 */
async function resolveVisibleBanner(
  profile: BannerProfile,
  cacheVersion: string
): Promise<string | null> {
  const type = profile.banner_type ?? "favorite_movie";
  const primary =
    type === "upload" || type === "url"
      ? profile.banner_url
      : type === "default"
        ? null
        : await resolveFavoriteBackdrop(profile);
  const versionedPrimary = withImageCacheBust(primary, cacheVersion);

  if (versionedPrimary && (await canLoadBannerImage(versionedPrimary))) {
    return versionedPrimary;
  }

  // ProfileBanner deliberately falls back to favourite artwork after a custom
  // image error, so the global environment must do the same.
  if (type === "upload" || type === "url") {
    const fallback = await resolveFavoriteBackdrop(profile);
    const versionedFallback = withImageCacheBust(fallback, cacheVersion);
    if (
      versionedFallback &&
      versionedFallback !== versionedPrimary &&
      (await canLoadBannerImage(versionedFallback))
    ) {
      return versionedFallback;
    }
  }

  return null;
}

/**
 * Mount once in the consumer AppShell. Detail pages do not mount this
 * controller and keep their own title-backdrop ambient stack untouched.
 */
const ProfileAmbientTheme: Component = () => {
  const { user, authReady } = useAuth();
  const profileRepo = useProfile();
  let requestId = 0;

  const loadAndApply = async (uid: string, currentRequest: number) => {
    const result = await profileRepo.getProfile(uid);
    if (currentRequest !== requestId) return;
    if (result.error || !result.data) {
      resetProfileBannerTheme();
      return;
    }

    // The Storage object path is intentionally stable and may be overwritten
    // repeatedly. Include this refresh request in the render-only URL token so
    // both the browser/CDN and extractBackdropProfile() see fresh bytes even
    // when Supabase updated_at has the same visible precision.
    const cacheVersion = `${result.data.updated_at ?? "unknown"}-${currentRequest}`;
    const imageUrl = await resolveVisibleBanner(result.data, cacheVersion);
    if (currentRequest !== requestId) return;
    if (!imageUrl) {
      resetProfileBannerTheme();
      return;
    }

    const profile = await extractBackdropProfile(imageUrl);
    if (currentRequest !== requestId) return;
    setDocumentTheme(profileToTheme({ ...profile, imageUrl }));
  };

  createEffect(
    on(
      () => [authReady(), user()?.uid] as const,
      () => {
        const currentRequest = ++requestId;
        const uid = user()?.uid;
        if (!authReady() || !uid) {
          resetProfileBannerTheme();
          return;
        }
        void loadAndApply(uid, currentRequest);
      }
    )
  );

  createEffect(() => {
    if (typeof window === "undefined") return;
    const handleBannerChange = () => {
      const uid = user()?.uid;
      if (!authReady() || !uid) return;
      const currentRequest = ++requestId;
      void loadAndApply(uid, currentRequest);
    };
    window.addEventListener(PROFILE_BANNER_CHANGED_EVENT, handleBannerChange);
    onCleanup(() =>
      window.removeEventListener(
        PROFILE_BANNER_CHANGED_EVENT,
        handleBannerChange
      )
    );
  });

  onCleanup(() => {
    requestId += 1;
  });

  return null;
};

export default ProfileAmbientTheme;
