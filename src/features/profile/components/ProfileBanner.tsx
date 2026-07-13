// src/features/profile/components/ProfileBanner.tsx
import { Show, createSignal, createMemo, createEffect, on, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { ProfileData } from "../useProfileData";
import type { BannerType } from "./BannerEditor";

interface ProfileBannerProps {
  data: ProfileData | null;
  isEditing: boolean;
  onChooseBanner: () => void;
}

/**
 * ProfileBanner — the dynamic cinematic backdrop at the top of the Profile.
 *
 * Banner source priority (per the banner system spec):
 *   1. banner_type === 'upload'  → banner_url (user-uploaded image)
 *   2. banner_type === 'url'     → banner_url (user-pasted URL)
 *   3. banner_type === 'favorite_movie' → favorite movie backdrop →
 *      favorite series backdrop → gradient fallback
 *   4. banner_type === 'default' → CineLog gradient
 *
 * If banner_type is null/missing (legacy users), defaults to
 * 'favorite_movie' behavior for backward compatibility.
 *
 * Error handling:
 *   If a custom image URL fails to load, the banner automatically
 *   falls back to the favorite movie backdrop, then to the gradient.
 *
 * UI:
 *   A camera/edit icon appears on the banner in edit mode, opening
 *   the BannerEditor. Images fade in smoothly on load.
 */
const ProfileBanner: Component<ProfileBannerProps> = (props) => {
  const [imgLoaded, setImgLoaded] = createSignal(false);
  const [imgError, setImgError] = createSignal(false);

  // Determine the banner type from the profile data.
  // Legacy users (null banner_type) default to 'favorite_movie'.
  const bannerType = createMemo<BannerType>(() => {
    const type = props.data?.profile?.banner_type;
    if (type === "upload" || type === "url" || type === "default") return type;
    return "favorite_movie"; // default + legacy fallback
  });

  const bannerUrl = (): string | null => {
    return props.data?.profile?.banner_url ?? null;
  };

  // Resolve the primary image URL based on banner_type.
  const primaryUrl = (): string | null => {
    if (imgError()) return null; // fallback path after error

    const type = bannerType();
    const d = props.data;

    if (type === "upload" || type === "url") {
      const url = bannerUrl();
      return url || null; // if URL is missing, fall through to fallback
    }

    if (type === "favorite_movie") {
      // Try favorite movie backdrop, then series backdrop
      const path = d?.favoriteMovie?.backdrop_path ?? d?.favoriteSeries?.backdrop_path;
      return path ? tmdbImage(path, "w1280") : null;
    }

    // 'default' → no image, just gradient
    return null;
  };

  // Fallback URL — used when the primary image fails to load.
  // Falls back to favorite movie backdrop (even if banner_type is
  // 'upload' or 'url'), then to gradient.
  const fallbackUrl = (): string | null => {
    const d = props.data;
    const path = d?.favoriteMovie?.backdrop_path ?? d?.favoriteSeries?.backdrop_path;
    return path ? tmdbImage(path, "w1280") : null;
  };

  // The URL to actually render — primary, or fallback if primary failed.
  const renderUrl = (): string | null => {
    const primary = primaryUrl();
    if (primary) return primary;
    // If primary failed (imgError), try fallback
    if (imgError()) return fallbackUrl();
    return null;
  };

  // Whether to show the gradient (no image at all)
  const showGradient = createMemo(() => renderUrl() === null);

  // Reset error state when the banner type or URL changes
  // (e.g., user saves a new banner in the editor).
  // IMPORTANT: This MUST be a createEffect, not a createMemo. Writing to
  // signals inside a memo is a Solid anti-pattern that breaks DOM
  // reconciliation and causes "Cannot read properties of null (reading
  // 'nextSibling')" errors when the banner image / fallback swaps.
  const resetState = () => {
    setImgLoaded(false);
    setImgError(false);
  };

  // Track changes to banner type/url to reset error state. Using on() so
  // the effect only fires when one of these dependencies actually changes,
  // not on every render of the parent.
  createEffect(
    on(
      () => [bannerType(), bannerUrl()] as const,
      () => {
        resetState();
      },
      { defer: true }
    )
  );

  return (
    <div class="profile-banner">
      <Show
        when={!showGradient() && renderUrl() !== null}
        fallback={
          /* Abstract gradient — on-brand, NOT a gray box.
             Also used as the final fallback if renderUrl somehow
             becomes null mid-render (defensive — prevents <img src="null">). */
          <div class="profile-banner-gradient" aria-hidden="true" />
        }
      >
        <img
          src={renderUrl() as string}
          class={`profile-banner-img${imgLoaded() ? " img-loaded" : ""}`}
          loading="eager"
          decoding="async"
          alt=""
          aria-hidden="true"
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            if (!imgError()) {
              // First error — try fallback
              setImgError(true);
              setImgLoaded(false);
            } else {
              // Fallback also failed — hide image, show gradient
              setImgLoaded(false);
            }
          }}
        />
        {/* Skeleton shimmer while image loads */}
        <Show when={!imgLoaded()}>
          <div class="profile-banner-shimmer" aria-hidden="true" />
        </Show>
      </Show>

      {/* Multi-layer gradient overlay */}
      <div class="profile-banner-overlay" aria-hidden="true" />

      {/* Camera/edit icon — always visible so users can discover customization */}
      <button
        type="button"
        class="profile-banner-edit-btn focus-ring"
        onClick={() => props.onChooseBanner()}
        aria-label="Customize banner"
      >
        <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
          photo_camera
        </span>
        <span class="profile-banner-edit-label">Banner</span>
      </button>
    </div>
  );
};

export default ProfileBanner;
