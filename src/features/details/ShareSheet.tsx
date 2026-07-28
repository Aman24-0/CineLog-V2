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
import { useMdbListRatings, type FrontendMediaType } from "~/features/details/useMdbListRatings";
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

  // ── MDBList ratings (IMDb / RT / Metacritic) ──────────────────────
  //
  // We fetch the same MDBList ratings payload that DetailsRatings uses
  // so the share text can include all three aggregator scores instead
  // of just the TMDB vote_average. The fetch is non-blocking — if it
  // hasn't resolved by the time the user taps Share, the share text
  // falls back to the TMDB rating gracefully.
  //
  // The server route (/api/media/ratings) sets Cache-Control headers
  // so the second fetch (DetailsRatings already fetched once) is
  // served from the CDN cache — no extra load on MDBList.
  const mdbTmdbId = createMemo(() => props.tmdbId() ?? null);
  const mdbMediaType = createMemo<FrontendMediaType | null>(() => {
    const mt = props.mediaType();
    return mt === "movie" || mt === "tv" ? mt : null;
  });
  const { ratings: mdbRatings } = useMdbListRatings(mdbTmdbId, mdbMediaType);

  // Derived values
  const shareUrl = createMemo(() =>
    buildShareUrl(props.mediaType(), props.tmdbId()),
  );
  // For navigator.share({ text }) — does NOT include the URL because
  // we pass `url` separately, otherwise the chat app renders it twice.
  // Passes the MDBList ratings so the share text shows IMDb / RT / MC.
  const shareTextBody = createMemo(() =>
    buildShareTextBody(props.details(), props.mediaType(), mdbRatings()),
  );
  // For clipboard copy — DOES include the URL.
  const shareTextFull = createMemo(() =>
    buildShareText(props.details(), props.mediaType(), props.tmdbId(), mdbRatings()),
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
   * clipboard if the Web Share API is unavailable OR if it throws a
   * non-AbortError (e.g., NotAllowedError on iOS Safari when the
   * share sheet is dismissed without a user gesture).
   *
   * BUG FIX (stuck "Sharing…" state):
   *   Previously, when the user dismissed the native share sheet,
   *   `navigator.share()` could throw an AbortError. The catch block
   *   handled AbortError but reset isSharing INSIDE the catch — which
   *   meant any other error path (NotAllowedError, DataError, etc.)
   *   left isSharing=true and the button stuck spinning forever.
   *
   *   Fix: wrap the entire Web Share call in try/catch/finally with
   *   `setIsSharing(false)` in the `finally`. This guarantees the
   *   spinner clears regardless of how the share sheet was dismissed
   *   (success, cancel, or unexpected error).
   */
  const handleShareViaApp = async () => {
    if (isSharing()) return;
    setMessage(null);

    // Path A: Web Share API (mobile browsers + Edge/Safari desktop)
    if (webShareAvailable()) {
      setIsSharing(true);
      // `cancelled` distinguishes AbortError (user dismissed the sheet)
      // from other errors (fall through to copy). `shareOk` tracks the
      // success path so we don't fall through to copy after sharing.
      let cancelled = false;
      let shareOk = false;
      try {
        await navigator.share({
          title: resolveTitle(props.details()),
          text: shareTextBody(),
          url: shareUrl(),
        });
        shareOk = true;
        showToast("Shared!", "success", 1500);
        handleClose();
      } catch (err) {
        const name = (err as DOMException)?.name;
        if (name === "AbortError") {
          // User cancelled the share sheet — silently ignore.
          cancelled = true;
        } else {
          // Unexpected error — log and fall through to copy below.
          console.warn("[ShareSheet] Web Share failed, falling back to copy:", err);
        }
      } finally {
        // ALWAYS reset the sharing state — this is the fix for the
        // stuck "Sharing…" spinner. Without `finally`, any error path
        // that doesn't explicitly reset isSharing leaves the button
        // stuck in the "Sharing…" state indefinitely.
        setIsSharing(false);
      }
      // If share succeeded OR user cancelled, do NOT fall through to
      // the copy fallback. Only fall through for unexpected errors.
      if (shareOk || cancelled) return;
    }

    // Path B: Fallback — copy full share text to clipboard.
    // Reached when: Web Share API unavailable, OR share threw a non-
    // AbortError (e.g., NotAllowedError on iOS Safari).
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
