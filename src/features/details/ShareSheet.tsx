// src/features/details/ShareSheet.tsx
//
// ShareSheet — bottom-sheet modal that lets the user share the current
// title. Renders:
//
//   1. A live preview of the share card (the green card design)
//   2. Three action buttons:
//        - Share Image  (primary) — generates a PNG via html-to-image,
//          then uses the Web Share API to share it as a file (falls
//          back to download on desktop browsers)
//        - Copy Link    — copies the deep link URL to the clipboard
//        - Share Text   — uses the Web Share API to share a formatted
//          text message with the URL (or copies as fallback)
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
  type Accessor,
  type Component,
} from "solid-js";
import { Portal } from "solid-js/web";
import ShareCardPreview from "~/features/details/ShareCardPreview";
import {
  buildShareUrl,
  buildShareText,
  canWebShare,
  canShareFiles,
  dataUrlToFile,
  downloadDataUrl,
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
  const [message, setMessage] = createSignal<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  // Refs
  let offscreenCardRef: HTMLDivElement | undefined;
  let backdropRef: HTMLDivElement | undefined;

  // Derived values
  const shareUrl = createMemo(() =>
    buildShareUrl(props.mediaType(), props.tmdbId()),
  );
  const shareText = createMemo(() =>
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

  // ── Generate PNG from the offscreen card ─────────────────────────
  /**
   * Convert the offscreen ShareCardPreview element to a PNG data URL.
   *
   * Uses html-to-image's toPng(). We use the offscreen element (not
   * the visible preview) because the visible one may be CSS-scaled
   * on mobile, which would produce a low-res PNG.
   *
   * The offscreen element is rendered at exactly 500px wide so the
   * PNG is always 500x(N) pixels at 1x.
   *
   * TMDB poster images are loaded with crossorigin="anonymous" via
   * the background-image CSS property — but html-to-image handles
   * this by fetching the image with crossorigin and embedding it as
   * a data URL internally. As long as TMDB sends CORS headers (they
   * do), this works.
   */
  const generatePng = async (): Promise<string | null> => {
    if (!offscreenCardRef) {
      setMessage({ kind: "error", text: "Share card not ready. Please try again." });
      return null;
    }
    try {
      const { toPng } = await loadHtmlToImage();
      const dataUrl = await toPng(offscreenCardRef, {
        cacheBust: true,
        pixelRatio: 2, // 2x for retina-quality PNG
        backgroundColor: "#053d29",
        // Filter out any elements that shouldn't be in the image
        // (none currently, but kept here for future use).
        filter: () => true,
      });
      return dataUrl;
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
      const dataUrl = await generatePng();
      if (!dataUrl) {
        setIsGenerating(false);
        return;
      }

      // If the browser supports file sharing, share the PNG + URL text.
      // Otherwise, download the PNG to the user's device.
      if (webShareAvailable() && fileShareAvailable()) {
        try {
          const file = await dataUrlToFile(dataUrl, fileName());
          if (navigator.canShare!({ files: [file] })) {
            setIsSharing(true);
            await navigator.share({
              files: [file],
              text: shareText(),
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

      // Fallback: download the PNG.
      downloadDataUrl(dataUrl, fileName());
      setMessage({
        kind: "success",
        text: "Image downloaded! Attach it to your chat or post.",
      });
      showToast("Image downloaded", "success", 1500);
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

  // ── Share Text button (Web Share API or copy fallback) ───────────
  const handleShareText = async () => {
    if (isCopyingText()) return;
    setMessage(null);

    if (webShareAvailable()) {
      setIsCopyingText(true);
      try {
        await navigator.share({
          title: resolveTitle(props.details()),
          text: shareText(),
          url: shareUrl(),
        });
        showToast("Shared!", "success", 1500);
        handleClose();
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          // User cancelled — silently ignore.
          setIsCopyingText(false);
          return;
        }
        console.warn("[ShareSheet] Web Share failed, falling back to copy:", err);
        // Fall through to copy.
      }
    }

    // Fallback: copy the text to clipboard.
    setIsCopyingText(true);
    try {
      const ok = await copyToClipboard(shareText());
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
                  {fileShareAvailable() ? "via WhatsApp / SMS" : "download PNG"}
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
                disabled={isCopyingText() || !props.details()}
                aria-label="Share text and link"
              >
                <Show
                  when={!isCopyingText()}
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
                  {webShareAvailable() ? "Share Text" : "Copy Text"}
                </span>
                <span class="share-action-btn-sub">with details</span>
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

export default ShareSheet;
