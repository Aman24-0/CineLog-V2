// src/features/profile/components/BannerEditor.tsx
import { Show, createSignal, createEffect, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { tmdbImage } from "~/core/tmdb/tmdb";
import {
  compressBannerImage,
  uploadBannerToSupabase
} from "~/shared/utils/imageCompress";
import { getAuthHeaders } from "~/lib/supabase/session";
import { withImageCacheBust } from "~/shared/utils/imageUrl";
import type { ProfileData } from "../useProfileData";

export type BannerType = "upload" | "url" | "favorite_movie" | "default";

interface BannerEditorProps {
  open: boolean;
  currentBannerType: BannerType;
  currentBannerUrl: string | null;
  /** Render-only version for stable Storage URLs overwritten via upsert. */
  currentBannerVersion?: string | number | null;
  data: ProfileData | null;
  userId: string;
  onClose: () => void;
  onSave: (type: BannerType, url: string | null) => Promise<boolean>;
}

type BannerSavePhase =
  "idle" | "processing" | "ready" | "fetching" | "uploading" | "applying";

/**
 * BannerEditor — a bottom sheet modal for customizing the profile banner.
 *
 * Three options:
 *   1. Upload from gallery — compress + crop to 16:5, upload to Supabase Storage
 *   2. Paste image URL — validate URL, preview, save
 *   3. Reset to automatic — uses favorite movie backdrop (or gradient if none)
 *
 * Live preview shows the selected banner before saving.
 */
const BannerEditor: Component<BannerEditorProps> = (props) => {
  const [tab, setTab] = createSignal<"upload" | "url" | "auto">("auto");
  const [urlInput, setUrlInput] = createSignal("");
  const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [phase, setPhase] = createSignal<BannerSavePhase>("idle");
  // Store the selected File so we can re-compress + upload on save
  // without re-reading from the DOM (which is fragile — the file input
  // might have been cleared or might not have the expected ID).
  let selectedFile: File | null = null;

  // Reset state when the editor mounts (props may change between opens
  // because the parent gates this component with <Show>, so it remounts
  // fresh each time — but the signal initializers above can't read props
  // at creation time, so we sync them here).
  createEffect(() => {
    setTab(
      props.currentBannerType === "url"
        ? "url"
        : props.currentBannerType === "upload"
          ? "upload"
          : "auto"
    );
    setUrlInput(props.currentBannerUrl ?? "");
  });

  // Current preview based on tab + selections
  const currentPreview = (): { url: string | null; type: BannerType } => {
    if (tab() === "upload") {
      if (previewUrl()) return { url: previewUrl(), type: "upload" };
      if (props.currentBannerType === "upload" && props.currentBannerUrl) {
        return { url: props.currentBannerUrl, type: "upload" };
      }
      return { url: null, type: "upload" };
    }
    if (tab() === "url" && urlInput().trim()) {
      return { url: urlInput().trim(), type: "url" };
    }
    // Auto — favorite movie backdrop or gradient
    const movieBackdrop = props.data?.favoriteMovie?.backdrop_path;
    const seriesBackdrop = props.data?.favoriteSeries?.backdrop_path;
    const backdrop = movieBackdrop ?? seriesBackdrop;
    return {
      url: backdrop ? tmdbImage(backdrop, "w1280") : null,
      type: "favorite_movie"
    };
  };

  const statusMessage = () => {
    switch (phase()) {
      case "processing":
        return "Preparing your image…";
      case "ready":
        return "Image ready. Press Save Banner to upload it.";
      case "fetching":
        return "Fetching image and checking the URL…";
      case "uploading":
        return "Uploading image to secure storage…";
      case "applying":
        return "Updating banner selection…";
      default:
        return null;
    }
  };

  const handleFileSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB.");
      return;
    }

    setError(null);
    setPhase("processing");
    setUploading(true);
    try {
      // Store the file for the save handler.
      selectedFile = file;
      // Generate a local preview URL using the compressed blob.
      const blob = await compressBannerImage(file);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(blob);
      });
      setPreviewUrl(dataUrl);
      setPhase("ready");
      // Switch to the "upload" tab so currentPreview() returns the
      // uploaded image (otherwise it stays on "auto" and the preview
      // doesn't update — the "banner preview doesn't change" bug).
      setTab("upload");
    } catch (err) {
      setPhase("idle");
      setError("Failed to process image. Try a different file.");
      console.error("[BannerEditor] Image processing failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleUrlInput = (value: string) => {
    setUrlInput(value);
    setError(null);
    setPhase("idle");
  };

  const validateUrl = (url: string): boolean => {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    const preview = currentPreview();
    setSaving(true);
    setError(null);
    setPhase("idle");

    try {
      if (preview.type === "url") {
        if (!validateUrl(preview.url!)) {
          setPhase("idle");
          setError("Please enter a valid image URL (https://...).");
          setSaving(false);
          return;
        }
      }

      if (preview.type === "upload") {
        // Upload the selected file to Supabase Storage.
        // We use the stored selectedFile (set in handleFileSelect) so
        // we don't have to re-read from the DOM (which is fragile).
        try {
          if (selectedFile) {
            setPhase("uploading");
            const blob = await compressBannerImage(selectedFile);
            const storageUrl = await uploadBannerToSupabase(props.userId, blob);
            setPhase("applying");
            const ok = await props.onSave("upload", storageUrl);
            if (!ok) {
              setPhase("idle");
              setError("Failed to save banner. Try again.");
              return;
            }
          } else if (
            props.currentBannerType === "upload" &&
            props.currentBannerUrl
          ) {
            // Re-saving an existing upload without selecting a new file is a
            // no-op for Storage; preserve its URL rather than falling through
            // to Automatic or attempting to persist a data URL.
            setPhase("applying");
            const ok = await props.onSave("upload", props.currentBannerUrl);
            if (!ok) {
              setPhase("idle");
              setError("Failed to save banner. Try again.");
              return;
            }
          } else {
            setPhase("idle");
            setError("Choose an image to upload first.");
            return;
          }
        } catch (err) {
          setPhase("idle");
          console.error("[BannerEditor] Upload failed:", err);
          setError(
            err instanceof Error
              ? `Upload failed: ${err.message}`
              : "Upload failed. Try again."
          );
          return;
        }
      } else if (preview.type === "url") {
        // Phase 18 deep fix: proxy the external image through our
        // server-side route, which fetches it server-side (no CORS /
        // CORB restrictions) and uploads it to Supabase Storage. The
        // resulting same-origin Storage URL is then stored in
        // profiles.banner_url, so the banner loads reliably in every
        // browser (Chrome, Lemur, Safari, Firefox) without being
        // blocked by the external host's response headers.
        //
        // The previous behavior (storing the raw external URL) caused
        // the banner to fail in browsers that enforce CORP/CORB on
        // cross-origin images — notably wallpaperflare.com URLs in the
        // Lemur browser.
        try {
          setPhase("fetching");
          const resp = await fetch("/api/profile/banner-from-url", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(await getAuthHeaders())
            },
            body: JSON.stringify({ url: preview.url })
          });
          if (!resp.ok) {
            setPhase("idle");
            const body = (await resp.json().catch(() => ({}))) as {
              error?: string;
              hint?: string;
            };
            setError(
              body.error ?? `Failed to fetch image (HTTP ${resp.status}).`
            );
            return;
          }
          const body = (await resp.json()) as { url?: string };
          if (!body.url) {
            setPhase("idle");
            setError("Image service did not return a saved image URL.");
            return;
          }
          setPhase("applying");
          const ok = await props.onSave("upload", body.url);
          if (!ok) {
            setPhase("idle");
            setError("Failed to save banner. Try again.");
            return;
          }
        } catch (err) {
          setPhase("idle");
          console.error("[BannerEditor] banner-from-url proxy failed:", err);
          setError(
            err instanceof Error
              ? `Image fetch failed: ${err.message}`
              : "Image fetch failed. Try again or upload the image directly."
          );
          return;
        }
      } else {
        // favorite_movie or default
        setPhase("applying");
        const ok = await props.onSave(preview.type, null);
        if (!ok) {
          setPhase("idle");
          setError("Failed to save banner. Try again.");
          return;
        }
      }
      props.onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="modal-backdrop profile-banner-editor-backdrop fixed inset-0 z-[999999] flex items-end justify-center p-0 sm:items-center sm:p-4"
          style={{
            background:
              "color-mix(in srgb, var(--bg-modal-backdrop) 94%, var(--void) 6%)",
            "backdrop-filter": "blur(18px) saturate(85%)",
            "-webkit-backdrop-filter": "blur(18px) saturate(85%)"
          }}
          onClick={() => !saving() && props.onClose()}
          role="dialog"
          aria-modal="true"
          aria-label="Customize banner"
        >
          <div
            class="modal-sheet-enter modal-surface profile-banner-editor-modal relative z-10 w-full max-w-md"
            style={{
              padding: "0",
              "max-height": "min(90dvh, 760px)",
              display: "flex",
              "flex-direction": "column",
              overflow: "hidden"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div class="profile-banner-editor-scroll">
              {/* Drag handle */}
              <div class="sheet-handle sm:hidden" aria-hidden="true" />

              {/* Close button */}
              <button
                type="button"
                onClick={() => !saving() && props.onClose()}
                class="focus-ring absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--hairline)",
                  color: "var(--text-soft)"
                }}
                aria-label="Close"
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "16px" }}
                  aria-hidden="true"
                >
                  close
                </span>
              </button>

              {/* Header */}
              <div
                class="profile-banner-editor-header"
                style={{ "margin-bottom": "var(--sp-4)" }}
              >
                <p
                  style={{
                    "font-family": "'Azeret Mono', monospace",
                    "font-size": "0.5625rem",
                    "font-weight": 700,
                    "letter-spacing": "0.14em",
                    "text-transform": "uppercase",
                    color: "var(--p)",
                    margin: "0 0 var(--sp-1)"
                  }}
                >
                  Customize
                </p>
                <h2
                  style={{
                    "font-family": "'Bebas Neue', sans-serif",
                    "font-size": "1.5rem",
                    "line-height": "1",
                    "letter-spacing": "0.03em",
                    color: "var(--text-strong)",
                    margin: "0"
                  }}
                >
                  Profile Banner
                </h2>
              </div>

              {/* Tabs */}
              <div
                class="quick-filter-bar profile-banner-editor-tabs"
                style={{ "margin-bottom": "var(--sp-4)" }}
              >
                <button
                  type="button"
                  class={`quick-filter-tab focus-ring${tab() === "auto" ? "" : ""}`}
                  data-active={tab() === "auto"}
                  onClick={() => {
                    setTab("auto");
                    setPhase("idle");
                  }}
                >
                  Automatic
                </button>
                <button
                  type="button"
                  class={`quick-filter-tab focus-ring${tab() === "upload" ? "" : ""}`}
                  data-active={tab() === "upload"}
                  onClick={() => {
                    setTab("upload");
                    setPhase(previewUrl() ? "ready" : "idle");
                  }}
                >
                  Upload
                </button>
                <button
                  type="button"
                  class={`quick-filter-tab focus-ring${tab() === "url" ? "" : ""}`}
                  data-active={tab() === "url"}
                  onClick={() => {
                    setTab("url");
                    setPhase("idle");
                  }}
                >
                  Image URL
                </button>
              </div>

              {/* Live preview */}
              <div
                class="profile-banner-editor-preview"
                style={{
                  width: "100%",
                  "aspect-ratio": "16 / 5",
                  "border-radius": "var(--radius-lg)",
                  overflow: "hidden",
                  border: "1px solid var(--hairline-2)",
                  "margin-bottom": "var(--sp-4)",
                  background: "var(--glass-bg)",
                  position: "relative"
                }}
              >
                <Show
                  when={currentPreview().url}
                  fallback={
                    <div
                      style={{
                        position: "absolute",
                        inset: "0",
                        background:
                          "radial-gradient(ellipse at 20% 30%, var(--p-glow) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, color-mix(in srgb, var(--p2) 18%, transparent) 0%, transparent 50%), linear-gradient(145deg, var(--glass-bg), var(--glass-bg-strong))"
                      }}
                    />
                  }
                >
                  <img
                    src={
                      withImageCacheBust(
                        currentPreview().url,
                        props.currentBannerVersion
                      ) ?? ""
                    }
                    style={{
                      width: "100%",
                      height: "100%",
                      "object-fit": "cover"
                    }}
                    alt="Banner preview"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: "0",
                      background:
                        "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)",
                      "pointer-events": "none"
                    }}
                  />
                </Show>
                <Show when={uploading()}>
                  <div
                    style={{
                      position: "absolute",
                      inset: "0",
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "center",
                      background: "rgba(0,0,0,0.6)",
                      "backdrop-filter": "blur(4px)"
                    }}
                  >
                    <span
                      class="material-symbols-outlined animate-soft-pulse"
                      style={{ "font-size": "24px", color: "var(--p)" }}
                      aria-hidden="true"
                    >
                      progress_activity
                    </span>
                  </div>
                </Show>
              </div>

              {/* Tab content */}
              <Show when={tab() === "auto"}>
                <p
                  style={{
                    "font-family": "'Outfit', sans-serif",
                    "font-size": "0.8125rem",
                    color: "var(--text-soft)",
                    margin: "0 0 var(--sp-3)",
                    "line-height": "1.5"
                  }}
                >
                  Your banner automatically uses your favorite movie's backdrop.
                  Set a favorite movie to customize it, or reset to the CineLog
                  gradient.
                </p>
              </Show>

              <Show when={tab() === "upload"}>
                <input
                  id="banner-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  class="glass-input focus-ring"
                  style={{ "margin-bottom": "var(--sp-2)" }}
                  aria-label="Upload banner image"
                />
                <p
                  style={{
                    "font-family": "'Azeret Mono', monospace",
                    "font-size": "0.5rem",
                    color: "var(--text-muted)",
                    margin: "0",
                    "letter-spacing": "0.06em"
                  }}
                >
                  JPG, PNG, or WebP · Max 10MB · Auto-cropped to 16:5
                </p>
              </Show>

              <Show when={tab() === "url"}>
                <input
                  type="url"
                  placeholder="https://example.com/banner.jpg"
                  value={urlInput()}
                  onInput={(e) => handleUrlInput(e.currentTarget.value)}
                  class="glass-input focus-ring"
                  style={{ "margin-bottom": "var(--sp-2)" }}
                  aria-label="Banner image URL"
                  autocomplete="off"
                  spellcheck={false}
                />
                <p
                  style={{
                    "font-family": "'Azeret Mono', monospace",
                    "font-size": "0.5rem",
                    color: "var(--text-muted)",
                    margin: "0",
                    "letter-spacing": "0.06em"
                  }}
                >
                  Paste a direct image URL (https://...)
                </p>
              </Show>

              <Show when={statusMessage()}>
                <p
                  role="status"
                  aria-live="polite"
                  style={{
                    color: "var(--p)",
                    "font-size": "0.75rem",
                    "text-align": "center",
                    margin: "0 0 var(--sp-2)",
                    "font-family": "'Outfit', sans-serif",
                    "font-weight": 600
                  }}
                >
                  {statusMessage()}
                </p>
              </Show>

              {/* Error */}
              <Show when={error()}>
                <p
                  role="alert"
                  style={{
                    color: "#f87171",
                    "font-size": "0.8125rem",
                    "text-align": "center",
                    margin: "var(--sp-3) 0 0",
                    "font-family": "'Outfit', sans-serif",
                    "font-weight": 500,
                    padding: "0.5rem 0.75rem",
                    "border-radius": "var(--radius-sm)",
                    background: "rgba(248,113,113,0.08)",
                    border: "1px solid rgba(248,113,113,0.2)"
                  }}
                >
                  {error()}
                </p>
              </Show>
            </div>

            {/* Actions */}
            <div class="profile-banner-editor-footer">
              <button
                type="button"
                class="btn-ghost focus-ring"
                onClick={() => !saving() && props.onClose()}
                disabled={saving()}
                style={{ flex: "1" }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn-primary focus-ring"
                onClick={handleSave}
                disabled={saving() || uploading()}
                style={{ flex: "1" }}
              >
                <Show
                  when={!saving()}
                  fallback={
                    <span
                      style={{
                        display: "inline-flex",
                        "align-items": "center",
                        gap: "0.5rem"
                      }}
                    >
                      <span
                        class="material-symbols-outlined animate-soft-pulse"
                        style={{ "font-size": "16px" }}
                        aria-hidden="true"
                      >
                        progress_activity
                      </span>
                      Saving…
                    </span>
                  }
                >
                  Save Banner
                </Show>
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default BannerEditor;
