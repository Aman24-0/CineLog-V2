// src/features/profile/components/EditProfileModal.tsx
//
// EditProfileModal — full-screen sheet for editing profile metadata.
//
// Sections (per spec):
//   • Profile Info: Display name (input) + Bio (textarea, 160 char limit)
//   • Avatar:       Current preview + "Upload" / "Use URL" / "Use Google Avatar" buttons
//   • Banner:       Reuses the existing BannerEditor (which already handles
//                   upload + URL + favorite-movie modes). Embedded inline.
//   • (Visibility removed — social features removed, profile is personal-only)
//
// On save, calls `updateProfileMetadata` (from the profile repository)
// with the changed fields, then calls `onClose`. The parent refetches
// the profile so the UI reflects the new state immediately.
//
// Image uploads go to Supabase Storage buckets `avatars` and `banners`.
// Storage failures are surfaced to the user; the UI never reports a local
// data URL as a successful durable upload.

import {
  Show,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  type Component
} from "solid-js";
import { Portal } from "solid-js/web";
import { GlassButton, GlassInput } from "~/shared/ui/glass";
import { useToast } from "~/shared/hooks/useToast";
import { getClient } from "~/lib/supabase/client";
import { tmdbImage } from "~/core/tmdb/tmdb";
import {
  compressBannerImage,
  uploadBannerToSupabase
} from "~/shared/utils/imageCompress";
import { updateProfileMetadata } from "~/lib/supabase/repositories/profile";
import type { ProfileRow } from "~/lib/supabase/repositories";
import { withImageCacheBust } from "~/shared/utils/imageUrl";
import type { ProfileData } from "../useProfileData";
import BannerEditor, { type BannerType } from "./BannerEditor";

export interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  /** The current profile row (used to seed the form fields). */
  profile: ProfileRow | null;
  /** Enriched profile data used by Automatic banner preview. */
  data?: ProfileData | null;
  /** The user's auth uid (used for storage upload paths). */
  userId: string;
  /** The OAuth avatar URL (Google profile photo). "Use Google Avatar"
   *  button resets avatar_url to null so the OAuth photo is used. */
  oauthAvatarUrl?: string | null;
  /** Called after a successful save — parent refetches the profile. */
  onSaved?: () => void | Promise<void>;
}

type AvatarSource = "google" | "url" | "upload";

const MAX_BIO_LENGTH = 160;
const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024;

const EditProfileModal: Component<EditProfileModalProps> = (props) => {
  const { showToast } = useToast();

  // ── Form state ────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = createSignal("");
  const [bio, setBio] = createSignal("");
  const [avatarUrl, setAvatarUrl] = createSignal<string | null>(null);
  const [_avatarSource, setAvatarSource] = createSignal<AvatarSource>("google");
  const [avatarUrlInput, setAvatarUrlInput] = createSignal("");
  const [bannerType, setBannerType] =
    createSignal<BannerType>("favorite_movie");
  const [bannerUrl, setBannerUrl] = createSignal<string | null>(null);
  // isPublic signal removed — social features removed
  const [saving, setSaving] = createSignal(false);
  const [uploadingAvatar, setUploadingAvatar] = createSignal(false);
  const [checkingAvatarUrl, setCheckingAvatarUrl] = createSignal(false);
  const [bannerEditorOpen, setBannerEditorOpen] = createSignal(false);
  // Version tokens are local render metadata only. They prevent a CDN/browser
  // from serving old bytes after a stable Storage object is overwritten.
  const [avatarVersion, setAvatarVersion] = createSignal<number | null>(null);
  const [bannerVersion, setBannerVersion] = createSignal<number | null>(null);

  const bannerPreviewUrl = () => {
    const type = bannerType();
    if (type === "upload" || type === "url") return bannerUrl();
    if (type === "favorite_movie") {
      const path =
        props.data?.favoriteMovie?.backdrop_path ??
        props.data?.favoriteSeries?.backdrop_path;
      return path ? tmdbImage(path, "w1280") : null;
    }
    return null;
  };

  // ── ESC key + body scroll lock ───────────────────────────────────────
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.open) {
      props.onClose();
    }
  };
  onMount(() => {
    document.addEventListener("keydown", handleEsc);
  });
  onCleanup(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", handleEsc);
    }
  });

  createEffect(() => {
    if (props.open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  });

  // ── Seed form fields from the current profile when opened ───────────
  createEffect(() => {
    if (props.open && props.profile) {
      const p = props.profile;
      setDisplayName(p.display_name ?? "");
      setBio(p.bio ?? "");
      setAvatarUrl(p.avatar_url ?? null);
      setAvatarUrlInput(p.avatar_url ?? "");
      setAvatarSource(p.avatar_url ? "url" : "google");
      setBannerType((p.banner_type as BannerType) ?? "favorite_movie");
      setBannerUrl(p.banner_url ?? null);
      setAvatarVersion(null);
      setBannerVersion(null);
      // is_public removed — social features removed
    }
  });

  // ── Avatar upload — file picker → compress → Supabase Storage ───────
  let avatarFileInput: HTMLInputElement | undefined;
  const handleAvatarFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file.", "error");
      return;
    }
    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      showToast("Image must be under 10MB.", "error");
      return;
    }
    setUploadingAvatar(true);
    try {
      // Compress to a small square avatar (200×200) using a canvas.
      const blob = await compressAvatarImage(file);
      const url = await uploadAvatarToSupabase(props.userId, blob);
      setAvatarUrl(url);
      setAvatarSource("upload");
      setAvatarUrlInput(url);
      setAvatarVersion(Date.now());
      showToast("Avatar uploaded. Save profile to apply it.", "success", 2200);
    } catch (err) {
      console.error("[EditProfileModal] Avatar upload failed:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Failed to upload avatar. Try a URL instead.";
      showToast(message, "error");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarUrlApply = async () => {
    const url = avatarUrlInput().trim();
    if (!url) {
      showToast("Enter an image URL.", "error");
      return;
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Use an http(s) image URL.");
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Enter a valid image URL.",
        "error"
      );
      return;
    }

    setCheckingAvatarUrl(true);
    try {
      await preloadImage(url);
      setAvatarUrl(url);
      setAvatarSource("url");
      setAvatarVersion(Date.now());
      showToast(
        "Avatar URL verified. Save profile to apply it.",
        "success",
        2200
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Avatar image could not be loaded.";
      showToast(message, "error");
    } finally {
      setCheckingAvatarUrl(false);
    }
  };

  const handleUseGoogleAvatar = () => {
    setAvatarUrl(null);
    setAvatarUrlInput("");
    setAvatarSource("google");
    setAvatarVersion(Date.now());
  };

  // ── Save ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const name = displayName().trim();
    if (!name) {
      showToast("Display name cannot be empty.", "error");
      return;
    }
    const trimmedBio = bio().trim();
    if (trimmedBio.length > MAX_BIO_LENGTH) {
      showToast(`Bio must be at most ${MAX_BIO_LENGTH} characters.`, "error");
      return;
    }

    setSaving(true);
    try {
      const supabase = getClient();
      const result = await updateProfileMetadata(supabase, props.userId, {
        displayName: name,
        bio: trimmedBio || null,
        avatarUrl: avatarUrl(),
        bannerType: bannerType(),
        bannerUrl: bannerUrl()
      });
      if (result.error) throw result.error;

      // is_public update removed — social features removed

      // Wait for the parent read to complete so the visible profile receives
      // the new row and updated_at cache version before closing.
      await props.onSaved?.();
      showToast("Profile saved and updated.", "success", 1800);
      props.onClose();
    } catch (err) {
      console.error("[EditProfileModal] Save failed:", err);
      const msg =
        err instanceof Error ? err.message : "Failed to save profile.";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── BannerEditor save handler ───────────────────────────────────────
  const handleBannerSave = async (
    type: BannerType,
    url: string | null
  ): Promise<boolean> => {
    setBannerType(type);
    setBannerUrl(url);
    setBannerVersion(Date.now());
    setBannerEditorOpen(false);
    showToast(
      type === "default" || type === "favorite_movie"
        ? "Banner selection ready. Save profile to apply it."
        : "Banner uploaded. Save profile to apply it.",
      "info",
      2600
    );
    return true;
  };

  return (
    <Show when={props.open}>
      {/* Portal so the modal renders at the document root, escaping any
          stacking context / overflow:hidden in the parent PageContainer.
          Without this, the modal can be clipped or hidden behind other
          elements (the "Edit Profile button feels dead" bug). */}
      <Portal>
        <div
          class="edit-profile-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Edit profile"
        >
        <div class="edit-profile-modal-sheet">
          {/* Header */}
          <div class="edit-profile-modal-header">
            <h2 class="edit-profile-modal-title">Edit Profile</h2>
            <button
              type="button"
              class="edit-profile-modal-close focus-ring"
              onClick={() => props.onClose()}
              aria-label="Close edit profile"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          {/* Body — scrollable */}
          <div class="edit-profile-modal-body">
            {/* ── Profile Info ──────────────────────────────────────── */}
            <section class="edit-profile-modal-section">
              <h3 class="edit-profile-modal-section-title">Profile Info</h3>
              <label class="edit-profile-modal-field">
                <span class="edit-profile-modal-field-label">Display name</span>
                <GlassInput
                  value={displayName()}
                  onInput={(e: Event) =>
                    setDisplayName((e.currentTarget as HTMLInputElement).value)
                  }
                  placeholder="Your display name"
                  aria-label="Display name"
                  maxlength={50}
                />
              </label>
              <label class="edit-profile-modal-field">
                <span class="edit-profile-modal-field-label">
                  Bio
                  <span class="edit-profile-modal-field-counter">
                    {bio().length}/{MAX_BIO_LENGTH}
                  </span>
                </span>
                <textarea
                  class="edit-profile-modal-bio-input focus-ring"
                  value={bio()}
                  onInput={(e) => setBio(e.currentTarget.value)}
                  placeholder="Write something about yourself..."
                  aria-label="Bio"
                  maxlength={MAX_BIO_LENGTH}
                  rows={3}
                />
              </label>
            </section>

            {/* ── Avatar ───────────────────────────────────────────── */}
            <section class="edit-profile-modal-section">
              <h3 class="edit-profile-modal-section-title">Avatar</h3>
              <div class="edit-profile-modal-avatar-row">
                <div class="edit-profile-modal-avatar-preview">
                  <Show
                    when={avatarUrl() || props.oauthAvatarUrl}
                    fallback={
                      <div class="edit-profile-modal-avatar-placeholder">
                        <span
                          class="material-symbols-outlined"
                          aria-hidden="true"
                        >
                          person
                        </span>
                      </div>
                    }
                  >
                    <img
                      src={
                        withImageCacheBust(
                          avatarUrl() ?? props.oauthAvatarUrl,
                          avatarVersion() ?? props.profile?.updated_at
                        ) ?? ""
                      }
                      alt="Avatar preview"
                      class="edit-profile-modal-avatar-img"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </Show>
                </div>
                <div class="edit-profile-modal-avatar-actions">
                  <input
                    ref={avatarFileInput}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0];
                      if (f) void handleAvatarFile(f);
                      e.currentTarget.value = "";
                    }}
                  />
                  <GlassButton
                    variant="secondary"
                    size="compact"
                    icon="upload"
                    loading={uploadingAvatar()}
                    onClick={() => avatarFileInput?.click()}
                    aria-label="Upload avatar"
                  >
                    Upload
                  </GlassButton>
                  <GlassButton
                    variant="ghost"
                    size="compact"
                    icon="link"
                    onClick={handleUseGoogleAvatar}
                    aria-label="Use Google avatar"
                  >
                    Use Google
                  </GlassButton>
                </div>
              </div>
              <label class="edit-profile-modal-field">
                <span class="edit-profile-modal-field-label">
                  Or paste an image URL
                </span>
                <div class="edit-profile-modal-url-row">
                  <GlassInput
                    value={avatarUrlInput()}
                    onInput={(e: Event) =>
                      setAvatarUrlInput(
                        (e.currentTarget as HTMLInputElement).value
                      )
                    }
                    placeholder="https://..."
                    aria-label="Avatar image URL"
                  />
                  <GlassButton
                    variant="secondary"
                    size="compact"
                    onClick={() => void handleAvatarUrlApply()}
                    loading={checkingAvatarUrl()}
                    disabled={checkingAvatarUrl()}
                    aria-label="Apply avatar URL"
                  >
                    Apply
                  </GlassButton>
                </div>
              </label>
            </section>

            {/* ── Banner ───────────────────────────────────────────── */}
            <section class="edit-profile-modal-section">
              <div class="edit-profile-modal-section-header-row">
                <h3 class="edit-profile-modal-section-title">Banner</h3>
                <Show when={bannerUrl()}>
                  <button
                    type="button"
                    class="edit-profile-modal-remove-banner focus-ring"
                    onClick={() => {
                                              setBannerType("default");
                        setBannerUrl(null);
                        setBannerVersion(Date.now());

                    }}
                    aria-label="Remove banner"
                  >
                    Remove
                  </button>
                </Show>
              </div>
              <div class="edit-profile-modal-banner-preview">
                                  <Show
                    when={bannerPreviewUrl()}
                    fallback={

                    <div class="edit-profile-modal-banner-placeholder">
                      <span
                        class="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        image
                      </span>
                      <span>Default gradient</span>
                    </div>
                  }
                >
                  <img
                    src={
                      withImageCacheBust(
                        bannerPreviewUrl(),
                        bannerVersion() ?? props.profile?.updated_at
                      ) ?? ""
                    }
                    alt="Banner preview"
                    class="edit-profile-modal-banner-img"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </Show>
              </div>
              <GlassButton
                variant="secondary"
                size="compact"
                icon="edit"
                onClick={() => setBannerEditorOpen(true)}
                aria-label="Customize banner"
              >
                Customize banner
              </GlassButton>
            </section>

            {/* Visibility section removed — social features removed */}
          </div>

          {/* Footer — Save / Cancel */}
          <div class="edit-profile-modal-footer">
            <GlassButton
              variant="ghost"
              size="default"
              onClick={() => props.onClose()}
              disabled={saving()}
              aria-label="Cancel"
            >
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              size="default"
              icon="check"
              loading={saving()}
              onClick={() => void handleSave()}
              aria-label="Save profile"
            >
              Save
            </GlassButton>
          </div>
        </div>
      </div>
      </Portal>

      {/* Banner editor — embedded as a sub-modal. Has its own <Portal>
          so it renders above this EditProfileModal. */}
      <Show when={bannerEditorOpen()}>
        <BannerEditor
          open={bannerEditorOpen()}
          data={props.data ?? null}
          currentBannerType={bannerType()}
          currentBannerUrl={bannerUrl()}
          currentBannerVersion={bannerVersion() ?? props.profile?.updated_at}
          userId={props.userId}
          onClose={() => setBannerEditorOpen(false)}
          onSave={handleBannerSave}
        />
      </Show>
    </Show>
  );
};

// ---------------------------------------------------------------------------
// Avatar compression + upload — mirrors the banner helper but for avatars.
// Avatars are smaller (200×200 square) and use the `avatars` bucket.
// ---------------------------------------------------------------------------

const AVATAR_SIZE = 200;
const AVATAR_QUALITY = 0.85;

async function compressAvatarImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        // Center-crop to a square
        const sourceSize = Math.min(img.width, img.height);
        const sx = (img.width - sourceSize) / 2;
        const sy = (img.height - sourceSize) / 2;
        ctx.drawImage(
          img,
          sx,
          sy,
          sourceSize,
          sourceSize,
          0,
          0,
          AVATAR_SIZE,
          AVATAR_SIZE
        );
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas toBlob returned null"));
          },
          "image/jpeg",
          AVATAR_QUALITY
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function uploadAvatarToSupabase(
  userId: string,
  blob: Blob
): Promise<string> {
  const { getBrowserClient } = await import("~/lib/supabase/browser");
  const supabase = getBrowserClient();
  const filePath = `${userId}/avatar.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    // Surface the real Storage failure instead of silently persisting a large
    // data URL that hides broken bucket or RLS configuration.
    console.error("[uploadAvatar] Storage upload failed:", uploadError);
    throw new Error(`Avatar upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(filePath);
  return urlData.publicUrl;
}

function preloadImage(url: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Avatar image timed out while loading."));
    }, timeoutMs);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };

    image.onload = () => finish();
    image.onerror = () =>
      finish(new Error("Avatar URL did not return a readable image."));
    image.src = url;
  });
}

// Reference compressBannerImage / uploadBannerToSupabase so the import
// isn't tree-shaken (we re-export via BannerEditor's path — keeping
// this alias here documents that the banner path uses the same util).
void compressBannerImage;
void uploadBannerToSupabase;

export default EditProfileModal;
