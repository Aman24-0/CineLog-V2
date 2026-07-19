// src/features/details/ShareSheet.tsx
//
// ShareSheet — bottom-sheet modal that lets the user share the current
// title. Renders:
//
//   1. A live preview of the share card (the green card design)
//   2. Three action buttons:
//        - Share Image  (primary) — generates a PNG via html-to-image's
//          toBlob(), then uses the Web Share API to share it as a file
//          (falls back to downloadBlob on desktop browsers, which uses
//          an object URL instead of a data URL — mobile Chrome blocks
//          data-URL downloads above ~2MB).
//        - Copy Link    — copies the deep link URL to the clipboard
//        - Share Text   — uses the Web Share API with text + URL AND
//          attaches the poster PNG as a file (when supported). This
//          means recipients in WhatsApp / Telegram see the green card
//          image inline, even if their chat app doesn't render link
//          previews.
//
// The sheet is rendered via Portal so it sits above everything else.
// It owns its own state (busy flags, error/success messages).
//
// The parent passes:
//   - show: Accessor<boolean>     — whether the sheet is open
//   - onClose: () => void         — closes the sheet
//   - details: TMDBDetails | null — the rich details payload
//   - mediaType: "movie" | "tv"
//   - tmdbId: string | number
//
// The deep-link URL is computed inside the sheet via buildShareUrl().

import {
  Show,
  createSignal,
  onMount,
  onCleanup,
  createMemo,
  createEffect,
  type Accessor,
  type Component,
} from "solid-js";
import { Portal } from "solid-js/web";
import ShareCardPreview from "~/features/details/ShareCardPreview";
import {
  buildShareUrl,
  buildShareText,
  buildShareTextBody,
  canWebShare,
  canShareFiles,
  downloadBlob,
  copyToClipboard,
  sanitizeFilename,
  resolveTitle,
} from "~/shared/utils/share";
import { useToast } from "~/shared/hooks/useToast";
import type { TMDBDetails } from "~/shared/types";

// Dynamically import html-to-image so it's only loaded when the user
// actually opens the share sheet (code-splitting — keeps the main
// bundle small).
type HtmlToImageModule = typeof import("html-to-image");
let htmlToImagePromise: Promise<HtmlToImageModule> | null = null;
function loadHtmlToImage(): Promise<HtmlToImageModule> {
  if (!htmlToImagePromise) {
    htmlToImagePromise = import("html-to-image");
  }
  return htmlToImagePromise;
}

export interface ShareSheetProps {
  show: Accessor<boolean>;
  onClose: () => void;
  details: Accessor<TMDBDetails | null>;
  mediaType: Accessor<"movie" | "tv">;
  tmdbId: Accessor<string | number>;
}

const ShareSheet: Component<ShareSheetProps> = (props) => {
  const { showToast } = useToast();

  // State
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [isSharing, setIsSharing] = createSignal(false);
  const [isCopyingLink, setIsCopyingLink] = createSignal(false);
  const [isCopyingText, setIsCopyingText] = createSignal(false);
  const [isSharingText, setIsSharingText] = createSignal(false);
  const [message, setMessage] = createSignal<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  // Refs
  let offscreenCardRef: HTMLDivElement | undefined;
  let backdropRef: HTMLDivElement | undefined;

  // Derived values
  const shareUrl = createMemo(() =>
    buildShareUrl(props.mediaType(), props.tmdbId()),
  );
  // For navigator.share({ text }) — does NOT include the URL because
  // we pass `url` separately, otherwise WhatsApp renders it twice.
  const shareTextBody = createMemo(() =>
    buildShareTextBody(props.details(), props.mediaType()),
  );
  // For clipboard copy — DOES include the URL because the clipboard
  // has no separate URL field.
  const shareTextFull = createMemo(() =>
    buildShareText(props.details(), props.mediaType(), props.tmdbId()),
  );
  const fileName = createMemo(() => {
    const title = sanitizeFilename(resolveTitle(props.details()));
    return `${title || "title"} — CineLog.png`;
  });

  const webShareAvailable = () => canWebShare();
  const fileShareAvailable = () => canShareFiles();

  // ── ESC to close ─────────────────────────────────────────────────
  onMount(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && props.show()) {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    onCleanup(() => window.removeEventListener("keydown", handleEsc));
  });

  // Clear message whenever the sheet closes
  const handleClose = () => {
    setMessage(null);
    props.onClose();
  };

  // ── Pre-warm the html-to-image module on sheet open ──────────────
  // This shaves ~100ms off the first "Share Image" tap by starting the
  // dynamic import as soon as the sheet is visible (instead of waiting
  // for the user to tap the button). Uses createEffect so the reactive
  // dependency on `props.show()` is tracked properly.
  createEffect(() => {
    if (props.show()) {
      void loadHtmlToImage();
    }
  });

  // ── Generate PNG Blob from the offscreen card ────────────────────
  /**
   * Convert the offscreen ShareCardPreview element to a PNG Blob.
   *
   * WHY BLOB (not data URL):
   *   The first iteration used `toPng()` which returns a data URL.
   *   Mobile Chrome silently blocks data-URL downloads above ~2MB, so
   *   the "Image downloaded!" toast fired but Chrome's notification
   *   showed "Failed - Download error" (see screenshot D).
   *
   *   `toBlob()` returns a Blob, which we then download via an object
   *   URL (`URL.createObjectURL(blob)`). Object URLs have no size
   *   limit, so the download always succeeds on mobile Chrome.
   *
   *   The Blob is also directly usable as a File for the Web Share
   *   API — no need for a separate dataUrlToFile conversion.
   *
   * OFFSCREEN ELEMENT:
   *   We use the offscreen card (not the visible preview) because the
   *   visible one may be CSS-scaled on mobile, which would produce a
   *   low-res PNG. The offscreen element is rendered at exactly 500px
   *   wide so the PNG is always 500x(N) pixels at 2x pixel ratio.
   *
   * CORS:
   *   TMDB poster images are loaded with crossorigin="anonymous" via
   *   the background-image CSS property. html-to-image handles CORS
   *   by fetching the image with crossorigin and embedding it as a
   *   data URL internally — as long as TMDB sends CORS headers (they
   *   do), this works without tainting the canvas.
   */
  const generatePngBlob = async (): Promise<Blob | null> => {
    if (!offscreenCardRef) {
      setMessage({ kind: "error", text: "Share card not ready. Please try again." });
      return null;
    }
    try {
      const { toBlob } = await loadHtmlToImage();

      // Pre-load the poster image before snapshotting. html-to-image
      // has its own image-loading logic but it can race with the
      // background-image CSS — explicitly waiting for the image to
      // decode ensures the poster is in the captured PNG.
      const posterUrl = props.details()?.poster_path
        ? `https://image.tmdb.org/t/p/w500${props.details()!.poster_path}`
        : null;
      if (posterUrl) {
        try {
          await preloadImage(posterUrl);
        } catch {
          // Non-fatal — html-to-image will still try to embed it.
        }
      }

      const blob = await toBlob(offscreenCardRef, {
        cacheBust: true,
        pixelRatio: 2, // 2x for retina-quality PNG
        backgroundColor: "#053d29",
        // Slightly higher quality for the JPEG-style poster image
        quality: 0.92,
      });
      if (!blob) {
        throw new Error("toBlob returned null");
      }
      return blob;
    } catch (err) {
      console.error("[ShareSheet] PNG generation failed:", err);
      setMessage({
        kind: "error",
        text: "Couldn't generate the share image. Try the Copy Link option instead.",
      });
      return null;
    }
  };

  // ── Share Image button ───────────────────────────────────────────
  const handleShareImage = async () => {
    if (isGenerating() || isSharing()) return;
    setMessage(null);
    setIsGenerating(true);
    try {
      const blob = await generatePngBlob();
      if (!blob) {
        setIsGenerating(false);
        return;
      }

      // If the browser supports file sharing, share the PNG + URL text.
      // Otherwise, download the PNG to the user's device via object URL.
      if (webShareAvailable() && fileShareAvailable()) {
        try {
          const file = new File([blob], fileName(), { type: "image/png" });
          if (navigator.canShare!({ files: [file] })) {
            setIsSharing(true);
            await navigator.share({
              files: [file],
              text: shareTextFull(),
              title: resolveTitle(props.details()),
            });
            showToast("Shared!", "success", 1500);
            handleClose();
            return;
          }
        } catch (err) {
          // If the share is cancelled or fails, fall through to download.
          if ((err as DOMException)?.name !== "AbortError") {
            console.warn("[ShareSheet] Web Share failed, falling back to download:", err);
          } else {
            // User cancelled — don't fall through to download.
            setIsGenerating(false);
            setIsSharing(false);
            return;
          }
        }
      }

      // Fallback: download the PNG via object URL (NOT data URL —
      // mobile Chrome blocks data URLs above ~2MB).
      downloadBlob(blob, fileName());
      setMessage({
        kind: "success",
        text: "Image saved to your device. Attach it to your chat or post.",
      });
      showToast("Image saved", "success", 1500);
    } finally {
      setIsGenerating(false);
      setIsSharing(false);
    }
  };

  // ── Copy Link button ─────────────────────────────────────────────
  const handleCopyLink = async () => {
    if (isCopyingLink()) return;
    setMessage(null);
    setIsCopyingLink(true);
    try {
      const ok = await copyToClipboard(shareUrl());
      if (ok) {
        setMessage({ kind: "success", text: "Link copied to clipboard!" });
        showToast("Link copied", "success", 1500);
      } else {
        setMessage({
          kind: "error",
          text: "Couldn't copy automatically. Long-press the link below to copy.",
        });
      }
    } finally {
      setIsCopyingLink(false);
    }
  };

  // ── Share Text button (with poster image attached) ───────────────
  /**
   * This is the key fix for Issue 3: "Share Text should show poster of
   * the title if possible".
   *
   * Strategy:
   *   1. Generate the PNG blob (same as Share Image)
   *   2. If the browser supports file sharing, attach the PNG as a
   *      File alongside the text + URL. Recipients in WhatsApp /
   *      Telegram will see the green card image inline.
   *   3. If file sharing is NOT supported, fall back to text-only
   *      share (the URL alone will trigger WhatsApp's link preview
   *      — which now works because we fixed the OG tags).
   *   4. If Web Share API is unavailable entirely, copy the text to
   *      the clipboard.
   */
  const handleShareText = async () => {
    if (isSharingText() || isCopyingText()) return;
    setMessage(null);

    // ── Path A: Web Share API with file (best — image + text) ────
    if (webShareAvailable() && fileShareAvailable()) {
      setIsSharingText(true);
      try {
        // Generate the PNG first so we can attach it.
        const blob = await generatePngBlob();
        if (blob) {
          const file = new File([blob], fileName(), { type: "image/png" });
          if (navigator.canShare!({ files: [file] })) {
            await navigator.share({
              files: [file],
              text: shareTextBody(),
              title: resolveTitle(props.details()),
              url: shareUrl(),
            });
            showToast("Shared!", "success", 1500);
            handleClose();
            return;
          }
        }
        // If file share isn't actually supported (canShare returned
        // false), fall through to text-only share.
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          // User cancelled — silently ignore, don't fall through.
          setIsSharingText(false);
          return;
        }
        console.warn("[ShareSheet] File share failed, trying text-only:", err);
        // Fall through to text-only share.
      }
    }

    // ── Path B: Web Share API text-only (still gets OG preview) ──
    if (webShareAvailable()) {
      setIsSharingText(true);
      try {
        await navigator.share({
          title: resolveTitle(props.details()),
          text: shareTextBody(),
          url: shareUrl(),
        });
        showToast("Shared!", "success", 1500);
        handleClose();
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          setIsSharingText(false);
          return;
        }
        console.warn("[ShareSheet] Web Share failed, falling back to copy:", err);
        // Fall through to copy.
      }
    }

    // ── Path C: Fallback — copy text to clipboard ────────────────
    setIsCopyingText(true);
    try {
      const ok = await copyToClipboard(shareTextFull());
      if (ok) {
        setMessage({ kind: "success", text: "Share text copied to clipboard!" });
        showToast("Text copied", "success", 1500);
      } else {
        setMessage({
          kind: "error",
          text: "Couldn't copy automatically. Your browser may not support sharing.",
        });
      }
    } finally {
      setIsCopyingText(false);
      setIsSharingText(false);
    }
  };

  return (
    <Show when={props.show()}>
      <Portal>
        <div
          ref={backdropRef}
          class="share-sheet-backdrop"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="Share this title"
        >
          <div
            class="share-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="share-sheet-handle" aria-hidden="true" />
            <h2 class="share-sheet-title">Share</h2>
            <p class="share-sheet-subtitle">
              Send this {props.mediaType() === "tv" ? "series" : "movie"} to a friend
            </p>

            {/* Live preview of the share card */}
            <Show
              when={props.details()}
              fallback={
                <div
                  style={{
                    padding: "2rem",
                    "text-align": "center",
                    color: "var(--text-muted)",
                    "font-size": "0.875rem",
                  }}
                >
                  Loading share card…
                </div>
              }
            >
              <div class="share-card-preview-wrap">
                <ShareCardPreview
                  details={props.details}
                  mediaType={props.mediaType}
                  tmdbId={props.tmdbId}
                  shareUrl={shareUrl}
                />
              </div>

              {/* Offscreen 1:1 card for PNG capture */}
              <div ref={offscreenCardRef} aria-hidden="true">
                <ShareCardPreview
                  details={props.details}
                  mediaType={props.mediaType}
                  tmdbId={props.tmdbId}
                  shareUrl={shareUrl}
                  forCapture
                />
              </div>
            </Show>

            {/* Action buttons */}
            <div class="share-actions">
              <button
                type="button"
                class="share-action-btn share-action-btn-primary"
                onClick={handleShareImage}
                disabled={isGenerating() || isSharing() || !props.details()}
                aria-label="Share as image"
              >
                <Show
                  when={!isGenerating() && !isSharing()}
                  fallback={
                    <span
                      class="material-symbols-outlined share-action-btn-icon animate-soft-pulse"
                      aria-hidden="true"
                    >
                      progress_activity
                    </span>
                  }
                >
                  <span class="material-symbols-outlined share-action-btn-icon" aria-hidden="true">
                    image
                  </span>
                </Show>
                <span class="share-action-btn-label">
                  {isGenerating() ? "Generating…" : isSharing() ? "Sharing…" : "Share Image"}
                </span>
                <span class="share-action-btn-sub">
                  {fileShareAvailable() ? "via WhatsApp / SMS" : "save PNG"}
                </span>
              </button>

              <button
                type="button"
                class="share-action-btn"
                onClick={handleCopyLink}
                disabled={isCopyingLink() || !props.details()}
                aria-label="Copy link to clipboard"
              >
                <Show
                  when={!isCopyingLink()}
                  fallback={
                    <span
                      class="material-symbols-outlined share-action-btn-icon"
                      aria-hidden="true"
                    >
                      check
                    </span>
                  }
                >
                  <span class="material-symbols-outlined share-action-btn-icon" aria-hidden="true">
                    link
                  </span>
                </Show>
                <span class="share-action-btn-label">Copy Link</span>
                <span class="share-action-btn-sub">share anywhere</span>
              </button>

              <button
                type="button"
                class="share-action-btn"
                onClick={handleShareText}
                disabled={isSharingText() || isCopyingText() || !props.details()}
                aria-label="Share text and poster"
              >
                <Show
                  when={!isSharingText() && !isCopyingText()}
                  fallback={
                    <span
                      class="material-symbols-outlined share-action-btn-icon animate-soft-pulse"
                      aria-hidden="true"
                    >
                      progress_activity
                    </span>
                  }
                >
                  <span class="material-symbols-outlined share-action-btn-icon" aria-hidden="true">
                    {webShareAvailable() ? "share" : "content_copy"}
                  </span>
                </Show>
                <span class="share-action-btn-label">
                  {isSharingText() ? "Sharing…" : webShareAvailable() ? "Share Text" : "Copy Text"}
                </span>
                <span class="share-action-btn-sub">
                  {fileShareAvailable() ? "with poster" : "with details"}
                </span>
              </button>
            </div>

            {/* Status message */}
            <Show when={message()}>
              {(m) => (
                <div class={`share-sheet-message share-sheet-message-${m().kind}`}>
                  {m().text}
                </div>
              )}
            </Show>

            {/* Close button */}
            <button
              type="button"
              class="share-sheet-close"
              onClick={handleClose}
            >
              Close
            </button>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

/**
 * Preload an image by creating a temporary <img> element and waiting
 * for it to decode. Used by `generatePngBlob` to ensure the poster
 * is fully loaded before html-to-image captures the card.
 *
 * Returns a promise that resolves when the image is decoded, or
 * rejects on error (caller should swallow the rejection — it's
 * non-fatal because html-to-image has its own image-loading logic).
 */
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Use decode() if available for better error handling.
      if (typeof img.decode === "function") {
        img.decode().then(() => resolve()).catch(reject);
      } else {
        resolve();
      }
    };
    img.onerror = reject;
    img.src = src;
  });
}

export default ShareSheet;
