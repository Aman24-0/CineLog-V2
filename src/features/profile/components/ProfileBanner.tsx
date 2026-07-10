// src/features/profile/components/ProfileBanner.tsx
import { Show, createSignal, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { ProfileData } from "../useProfileData";

interface ProfileBannerProps {
  data: ProfileData | null;
  isEditing: boolean;
  onChooseBanner: () => void;
}

/**
 * ProfileBanner — the dynamic cinematic backdrop at the top of the Profile.
 *
 * Banner source priority:
 *   1. banner_override_path (user-chosen custom image)
 *   2. favorite movie's backdrop_path
 *   3. favorite series' backdrop_path
 *   4. abstract gradient fallback
 *
 * The banner is the user's taste rendered as a movie poster — it
 * changes when they change their favorite film.
 */
const ProfileBanner: Component<ProfileBannerProps> = (props) => {
  const [imgLoaded, setImgLoaded] = createSignal(false);

  const bannerPath = (): string | null => {
    const d = props.data;
    if (!d?.profile) return null;
    // Priority: override → favorite movie backdrop → favorite series backdrop
    return (
      d.profile.banner_override_path ??
      d.favoriteMovie?.backdrop_path ??
      d.favoriteSeries?.backdrop_path ??
      null
    );
  };

  return (
    <div class="profile-banner">
      <Show
        when={bannerPath()}
        fallback={
          /* Abstract gradient — on-brand, NOT a gray box */
          <div class="profile-banner-gradient" aria-hidden="true" />
        }
      >
        <img
          src={tmdbImage(bannerPath(), "w1280")}
          class={`profile-banner-img${imgLoaded() ? " img-loaded" : ""}`}
          loading="eager"
          decoding="async"
          alt=""
          aria-hidden="true"
          onLoad={() => setImgLoaded(true)}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </Show>

      {/* Multi-layer gradient overlay */}
      <div class="profile-banner-overlay" aria-hidden="true" />

      {/* Edit-mode banner swap button */}
      <Show when={props.isEditing}>
        <button
          type="button"
          class="focus-ring"
          onClick={() => props.onChooseBanner()}
          style={{
            position: "absolute",
            top: "var(--sp-3)",
            right: "var(--sp-3)",
            "z-index": "2",
            display: "inline-flex",
            "align-items": "center",
            gap: "0.375rem",
            padding: "0.5rem 0.875rem",
            "border-radius": "var(--radius-pill)",
            background: "rgba(0,0,0,0.60)",
            "backdrop-filter": "blur(12px)",
            "-webkit-backdrop-filter": "blur(12px)",
            border: "1px solid var(--hairline-2)",
            color: "var(--text-strong)",
            "font-family": "'Azeret Mono', monospace",
            "font-size": "0.5625rem",
            "font-weight": 700,
            "letter-spacing": "0.12em",
            "text-transform": "uppercase",
            cursor: "pointer",
          }}
          aria-label="Change banner"
        >
          <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
            swap_horiz
          </span>
          Banner
        </button>
      </Show>
    </div>
  );
};

export default ProfileBanner;
