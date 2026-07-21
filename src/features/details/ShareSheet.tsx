// src/features/details/ShareSheet.tsx
//
// ShareSheet — a compact centered dialog for sharing the current title.
//
// DESIGN
// ------
// A small "mini box" dialog with just two actions:
//   • Copy Link     — copies the deep-link URL to the clipboard
//   • Share via App — opens the native Web Share sheet with the
//                     formatted text + URL (WhatsApp, Telegram, SMS,
//                     email, etc.)
//
// The old "Share Image" feature was removed because html-to-image's
// toBlob() was unreliable on mobile browsers (CORS issues with TMDB
// poster images, font-loading failures, blank captures). The two
// remaining options cover 100% of real-world sharing needs:
//   - Copy Link works in every browser and every chat app
//   - Share via App opens the native share sheet which renders a rich
//     link preview (poster + title) thanks to the server-rendered
//     OG tags on the /movie/{id} and /tv/{id} routes
//
// The dialog is rendered via Portal so it sits above everything else.
// It's a small centered box (not a bottom sheet) — quick to interact
// with and dismiss.

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
import {
  buildShareUrl,
  buildShareText,
  buildShareTextBody,
  canWebShare,
  copyToClipboard,
  resolveTitle,
} from "~/shared/utils/share";
import { useToast } from "~/shared/hooks/useToast";
import type { TMDBDetails } from "~/shared/types";

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
  const [isCopyingLink, setIsCopyingLink] = createSignal(false);
  const [isSharing, setIsSharing] = createSignal(false);
  const [message, setMessage] = createSignal<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  // Derived values
  const shareUrl = createMemo(() =>
    buildShareUrl(props.mediaType(), props.tmdbId()),
  );
  // For navigator.share({ text }) — does NOT include the URL because
  // we pass `url` separately, otherwise the chat app renders it twice.
  const shareTextBody = createMemo(() =>
    buildShareTextBody(props.details(), props.mediaType()),
  );
  // For clipboard copy — DOES include the URL.
  const shareTextFull = createMemo(() =>
    buildShareText(props.details(), props.mediaType(), props.tmdbId()),
  );

  const webShareAvailable = () => canWebShare();

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

  const handleClose = () => {
    setMessage(null);
    props.onClose();
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
          text: "Couldn't copy automatically. Long-press the link to copy.",
        });
      }
    } finally {
      setIsCopyingLink(false);
    }
  };

  // ── Share via App button ─────────────────────────────────────────
  /**
   * Opens the native Web Share sheet (WhatsApp, Telegram, SMS, email,
   * etc.) with the formatted text + URL. The chat app will render a
   * rich link preview (poster + title) thanks to the server-rendered
   * OG tags on the /movie/{id} and /tv/{id} routes.
   *
   * Falls back to copying the full share text (with URL) to the
   * clipboard if the Web Share API is unavailable (desktop browsers
   * without Web Share support).
   */
  const handleShareViaApp = async () => {
    if (isSharing()) return;
    setMessage(null);

    // Path A: Web Share API (mobile browsers + Edge/Safari desktop)
    if (webShareAvailable()) {
      setIsSharing(true);
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
          // User cancelled — silently ignore.
          setIsSharing(false);
          return;
        }
        console.warn("[ShareSheet] Web Share failed, falling back to copy:", err);
        // Fall through to copy.
      }
    }

    // Path B: Fallback — copy full share text to clipboard
    setIsSharing(true);
    try {
      const ok = await copyToClipboard(shareTextFull());
      if (ok) {
        setMessage({ kind: "success", text: "Share text copied to clipboard!" });
        showToast("Text copied", "success", 1500);
      } else {
        setMessage({
          kind: "error",
          text: "Couldn't share or copy. Your browser may not support sharing.",
        });
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Show when={props.show()}>
      <Portal>
        <div
          class="share-sheet-backdrop"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="Share this title"
        >
          <div
            class="share-mini-box"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button (X) — top-right corner */}
            <button
              type="button"
              class="share-mini-close"
              onClick={handleClose}
              aria-label="Close share dialog"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>

            {/* Header */}
            <div class="share-mini-header">
              <span class="material-symbols-outlined share-mini-icon" aria-hidden="true">
                share
              </span>
              <h2 class="share-mini-title">Share</h2>
              <p class="share-mini-subtitle">
                {props.details()?.title || props.details()?.name || "this title"}
              </p>
            </div>

            {/* Action buttons — two side by side */}
            <div class="share-mini-actions">
              <button
                type="button"
                class="share-mini-btn share-mini-btn-primary"
                onClick={handleShareViaApp}
                disabled={isSharing() || !props.details()}
                aria-label="Share via app"
              >
                <Show
                  when={!isSharing()}
                  fallback={
                    <span
                      class="material-symbols-outlined animate-soft-pulse"
                      aria-hidden="true"
                    >
                      progress_activity
                    </span>
                  }
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    {webShareAvailable() ? "share" : "content_copy"}
                  </span>
                </Show>
                <span class="share-mini-btn-label">
                  {isSharing() ? "Sharing…" : webShareAvailable() ? "Share via App" : "Copy Text"}
                </span>
              </button>

              <button
                type="button"
                class="share-mini-btn"
                onClick={handleCopyLink}
                disabled={isCopyingLink() || !props.details()}
                aria-label="Copy link to clipboard"
              >
                <Show
                  when={!isCopyingLink()}
                  fallback={
                    <span class="material-symbols-outlined" aria-hidden="true">
                      check
                    </span>
                  }
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    link
                  </span>
                </Show>
                <span class="share-mini-btn-label">Copy Link</span>
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
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default ShareSheet;
