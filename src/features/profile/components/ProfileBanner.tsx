// src/features/profile/components/ProfileBanner.tsx
import {
  Show,
  createSignal,
  createMemo,
  createEffect,
  on,
  type Component,
  type JSX
} from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { withImageCacheBust } from "~/shared/utils/imageUrl";
import {
  getProfileBannerSignature,
  readCachedProfileBanner
} from "~/core/theme/profileBannerCache";
import type { ProfileData } from "../useProfileData";
import type { BannerType } from "./BannerEditor";

interface ProfileBannerProps {
  data: ProfileData | null;
  isEditing: boolean;
  /**
   * Called when the user clicks the (now-removed) banner edit overlay.
   * Kept in the props interface for backwards compatibility — the
   * banner-edit entry point now lives exclusively inside the Edit
   * Profile modal (Banner section), so this handler is no longer
   * invoked from the banner itself. V3.1 cleanup.
   */
  onChooseBanner?: () => void;
  /** Optional content rendered above the image/gradient overlay. */
  children?: JSX.Element;
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
 * Image URLs are cache-busted at render time using the profile updated_at
 * timestamp because Storage uploads intentionally reuse one per-user path.
 * No cache-busting query is written to profiles.banner_url.
 */
const ProfileBanner: Component<ProfileBannerProps> = (props) => {
  const [imgLoaded, setImgLoaded] = createSignal(false);
  const [failedCandidateIndex, setFailedCandidateIndex] = createSignal(0);
  const [cachedImageFailed, setCachedImageFailed] = createSignal(false);

  // Determine the banner type from the profile data.
  // Legacy users (null banner_type) default to 'favorite_movie'.
  const bannerType = createMemo<BannerType>(() => {
    const type = props.data?.profile?.banner_type;
    if (type === "upload" || type === "url" || type === "default") return type;
    return "favorite_movie";
  });

  const bannerUrl = () => props.data?.profile?.banner_url ?? null;
  const profileId = () => props.data?.profile?.id ?? null;
  const profileSignature = () => {
    const profile = props.data?.profile;
    if (!profile) return undefined;
    return getProfileBannerSignature(profile);
  };
  const cachedBannerUrl = () => {
    const uid = profileId();
    const signature = profileSignature();
    if (!uid || !signature) return null;
    return readCachedProfileBanner(uid, signature)?.bannerUrl ?? null;
  };
  const hasCachedImage = () =>
    Boolean(cachedBannerUrl() && !cachedImageFailed());

  /**
   * Build an ordered candidate list. Custom banners get the first attempt,
   * followed by favorite artwork as a recovery path. Automatic banners try
   * movie artwork before series artwork. Default mode intentionally remains a
   * gradient and does not consult favorites.
   */
  const candidateUrls = createMemo(() => {
    const type = bannerType();
    const d = props.data;
    if (type === "default") return [] as string[];

    const candidates: string[] = [];
    if (cachedBannerUrl()) candidates.push(cachedBannerUrl()!);
    if ((type === "upload" || type === "url") && bannerUrl()) {
      const currentUrl = bannerUrl()!;
      if (!candidates.includes(currentUrl)) candidates.push(currentUrl);
    }

    const favoritePaths = [
      d?.favoriteMovie?.backdrop_path,
      d?.favoriteSeries?.backdrop_path
    ].filter((path): path is string => Boolean(path));

    for (const path of favoritePaths) {
      const url = tmdbImage(path, "w1280");
      if (!candidates.includes(url)) candidates.push(url);
    }
    return candidates;
  });

  const renderUrl = () => {
    const rawUrl = candidateUrls()[failedCandidateIndex()] ?? null;
    return withImageCacheBust(rawUrl, props.data?.profile?.updated_at);
  };

  // Reset image state when the selected source or its favorite artwork changes.
  createEffect(
    on(
      () =>
        [
          bannerType(),
          bannerUrl(),
          props.data?.profile?.updated_at,
          props.data?.favoriteMovie?.backdrop_path,
          props.data?.favoriteSeries?.backdrop_path
        ] as const,
      () => {
        setImgLoaded(false);
        setCachedImageFailed(false);
        setFailedCandidateIndex(0);
      },
      { defer: true }
    )
  );

  return (
    <div class="profile-banner">
      <Show
        when={renderUrl() !== null}
        fallback={<div class="profile-banner-gradient" aria-hidden="true" />}
      >
        <img
          src={renderUrl() as string}
          class={`profile-banner-img${imgLoaded() || hasCachedImage() ? " img-loaded" : ""}`}
          loading="eager"
          decoding="async"
          alt="Profile banner"
          width="1200"
          height="400"
          crossorigin="anonymous"
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgLoaded(false);
            if (cachedBannerUrl() && failedCandidateIndex() === 0) {
              setCachedImageFailed(true);
              setFailedCandidateIndex(0);
              return;
            }
            setFailedCandidateIndex((index) => index + 1);
          }}
        />
        {/* Skeleton shimmer while image loads */}
        <Show when={!imgLoaded() && !hasCachedImage()}>
          <div class="profile-banner-shimmer" aria-hidden="true" />
        </Show>
      </Show>

      {/* Multi-layer gradient overlay */}
      <div class="profile-banner-overlay" aria-hidden="true" />

      <div class="profile-banner-content">{props.children}</div>
    </div>
  );
};

export default ProfileBanner;
