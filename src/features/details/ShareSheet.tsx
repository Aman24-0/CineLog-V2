// src/features/details/ShareSheet.tsx
//
// Premium Share Sheet V2 — Dark Cinema Glass bottom sheet.
//
// DESIGN
// ------
// A premium bottom sheet using GlassSheet with:
//   • Header: poster thumbnail, title, year, media type badge, ratings
//   • 6 options: Share, Copy Link, Copy Rich Text, Save Poster,
//     Generate Share Card, QR Code
//
// Each option is a tappable row with icon + label + chevron.
// The sheet uses the existing GlassSheet component for the bottom
// sheet chrome (backdrop, handle, slide-up animation, focus trap).

import {
  Show,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  type Accessor,
  type Component
} from "solid-js";
import { Portal } from "solid-js/web";
// html2canvas is ~300KB. Loaded dynamically on first share-card
// generation to keep the DetailsModal chunk lean.
import QRCode from "qrcode";
import { GlassSheet } from "~/shared/ui/glass/GlassSheet";
import { useToast } from "~/shared/hooks/useToast";
import {
  useMdbListRatings,
  type FrontendMediaType
} from "~/features/details/useMdbListRatings";
import {
  buildShareUrl,
  buildShareText,
  buildShareTextBody,
  buildRichShareText,
  canWebShare,
  canShareFiles,
  copyToClipboard,
  downloadBlob,
  sanitizeFilename,
  dataUrlToFile,
  resolveTitle,
  formatReleaseDate,
  resolveReleaseDate,
  formatMdbRatingsLine
} from "~/shared/utils/share";
import type { TMDBDetails, WatchlistItem } from "~/shared/types";

// ─── TMDB image helper ────────────────────────────────────────

const tmdbImage = (path: string | null | undefined, size = "w500") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : "";

// ─── Props ────────────────────────────────────────────────────

export interface ShareSheetProps {
  show: Accessor<boolean>;
  onClose: () => void;
  details: Accessor<TMDBDetails | null>;
  mediaType: Accessor<"movie" | "tv">;
  tmdbId: Accessor<string | number>;
  vaultItem?: Accessor<WatchlistItem | null>;
}

// ─── Component ────────────────────────────────────────────────

const ShareSheet: Component<ShareSheetProps> = (props) => {
  const { showToast } = useToast();

  // ── State ──────────────────────────────────────────────────
  const [isCopyingLink, setIsCopyingLink] = createSignal(false);
  const [isCopyingRich, setIsCopyingRich] = createSignal(false);
  const [isSavingPoster, setIsSavingPoster] = createSignal(false);
  const [isGeneratingCard, setIsGeneratingCard] = createSignal(false);
  const [isGeneratingQR, setIsGeneratingQR] = createSignal(false);
  const [shareCardUrl, setShareCardUrl] = createSignal<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = createSignal<string | null>(null);
  const [showQrFullscreen, setShowQrFullscreen] = createSignal(false);

  // ── MDBList ratings ────────────────────────────────────────
  const mdbTmdbId = createMemo(() => props.tmdbId() ?? null);
  const mdbMediaType = createMemo<FrontendMediaType | null>(() => {
    const mt = props.mediaType();
    return mt === "movie" || mt === "tv" ? mt : null;
  });
  // eslint-disable-next-line solid/reactivity
  const { ratings: mdbRatings } = useMdbListRatings(mdbTmdbId, mdbMediaType);

  // ── Derived values ─────────────────────────────────────────
  const shareUrl = createMemo(() =>
    buildShareUrl(props.mediaType(), props.tmdbId())
  );
  const shareTextBody = createMemo(() =>
    buildShareTextBody(props.details(), props.mediaType(), mdbRatings())
  );
  const shareTextFull = createMemo(() =>
    buildShareText(
      props.details(),
      props.mediaType(),
      props.tmdbId(),
      mdbRatings()
    )
  );
  const richShareText = createMemo(() =>
    buildRichShareText(
      props.details(),
      props.mediaType(),
      props.tmdbId(),
      mdbRatings()
    )
  );

  const title = createMemo(() =>
    resolveTitle(props.details())
  );

  const year = createMemo(() => {
    const d = props.details();
    if (!d) return "";
    const dateStr = d.release_date || d.first_air_date || "";
    return dateStr.slice(0, 4);
  });

  const ratingsLine = createMemo(() =>
    formatMdbRatingsLine(mdbRatings())
  );

  const webShareAvailable = () => canWebShare();
  const fileShareAvailable = () => canShareFiles();

  const posterUrl = createMemo(() =>
    tmdbImage(props.details()?.poster_path, "w92")
  );

  const filename = createMemo(() =>
    sanitizeFilename(title())
  );

  // ── Reset state on close ───────────────────────────────────
  const handleClose = () => {
    setShareCardUrl(null);
    setQrDataUrl(null);
    setShowQrFullscreen(false);
    props.onClose();
  };

  // ── 1. Share (Native Web Share API) ────────────────────────
  const handleShare = async () => {
    if (!webShareAvailable()) {
      // Fallback: copy full text
      const ok = await copyToClipboard(shareTextFull());
      if (ok) {
        showToast("Text copied", "success", 1500);
      } else {
        showToast("Couldn't share or copy", "error", 2500);
      }
      return;
    }

    try {
      await navigator.share({
        title: title(),
        text: shareTextBody(),
        url: shareUrl()
      });
      showToast("Shared!", "success", 1500);
      handleClose();
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "AbortError") return; // User cancelled
      // Fallback: copy to clipboard
      const ok = await copyToClipboard(shareTextFull());
      if (ok) {
        showToast("Text copied", "success", 1500);
      }
    }
  };

  // ── 2. Copy Link ───────────────────────────────────────────
  const handleCopyLink = async () => {
    if (isCopyingLink()) return;
    setIsCopyingLink(true);
    try {
      const ok = await copyToClipboard(shareUrl());
      if (ok) {
        showToast("Link copied", "success", 1500);
      } else {
        showToast("Couldn't copy link", "error", 2500);
      }
    } finally {
      setIsCopyingLink(false);
    }
  };

  // ── 3. Copy Rich Text ──────────────────────────────────────
  const handleCopyRichText = async () => {
    if (isCopyingRich()) return;
    setIsCopyingRich(true);
    try {
      const ok = await copyToClipboard(richShareText());
      if (ok) {
        showToast("Rich text copied", "success", 1500);
      } else {
        showToast("Couldn't copy text", "error", 2500);
      }
    } finally {
      setIsCopyingRich(false);
    }
  };

  // ── 4. Save Poster ─────────────────────────────────────────
  const handleSavePoster = async () => {
    if (isSavingPoster()) return;
    const d = props.details();
    if (!d?.poster_path) {
      showToast("No poster available", "error", 2000);
      return;
    }
    setIsSavingPoster(true);
    try {
      const posterUrlFull = tmdbImage(d.poster_path, "w780");
      const response = await fetch(posterUrlFull);
      if (!response.ok) throw new Error("Failed to fetch poster");
      const blob = await response.blob();

      // Try Clipboard API with image support
      if (
        typeof navigator.clipboard !== "undefined" &&
        typeof navigator.clipboard.write === "function" &&
        typeof ClipboardItem !== "undefined"
      ) {
        try {
          const pngBlob = new Blob([blob], { type: "image/png" });
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": pngBlob })
          ]);
          showToast("Poster copied to clipboard", "success", 1500);
          return;
        } catch {
          // Clipboard API failed — fall through to download
        }
      }

      // Download
      downloadBlob(blob, `${filename()}-poster.png`);
      showToast("Poster downloading", "success", 1500);
    } catch {
      showToast("Couldn't save poster", "error", 2500);
    } finally {
      setIsSavingPoster(false);
    }
  };

  // ── 5. Generate Share Card ─────────────────────────────────
  const handleGenerateShareCard = async () => {
    if (isGeneratingCard()) return;
    setIsGeneratingCard(true);
    try {
      const el = document.getElementById("share-card-render");
      if (!el) throw new Error("Card element not found");

      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(el, {
        backgroundColor: "#0a0a0a",
        useCORS: true,
        scale: 2,
        logging: false
      });

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b: Blob | null) => {
          resolve(b ?? new Blob());
        }, "image/png");
      });

      const url = URL.createObjectURL(blob);
      setShareCardUrl(url);
    } catch {
      showToast("Couldn't generate card", "error", 2500);
    } finally {
      setIsGeneratingCard(false);
    }
  };

  const handleDownloadCard = () => {
    const url = shareCardUrl();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename()}-cinelog.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("Card downloading", "success", 1500);
  };

  const handleShareCard = async () => {
    const url = shareCardUrl();
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `${filename()}-cinelog.png`, {
        type: "image/png"
      });

      if (webShareAvailable() && fileShareAvailable()) {
        const nav = navigator as Navigator & {
          canShare?: (data: { files: File[] }) => boolean;
        };
        const shareData = { files: [file], text: shareTextBody(), url: shareUrl() };
        if (nav.canShare?.(shareData)) {
          await navigator.share(shareData);
          showToast("Card shared!", "success", 1500);
          return;
        }
      }

      // Fallback: download
      downloadBlob(blob, `${filename()}-cinelog.png`);
      showToast("Card downloading", "success", 1500);
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "AbortError") return;
      showToast("Couldn't share card", "error", 2500);
    }
  };

  // ── 6. QR Code ─────────────────────────────────────────────
  const handleGenerateQR = async () => {
    if (isGeneratingQR()) return;
    setIsGeneratingQR(true);
    try {
      const url = await QRCode.toDataURL(shareUrl(), {
        width: 256,
        margin: 2,
        color: { dark: "#E8B74A", light: "#0a0a0a" }
      });
      setQrDataUrl(url);
    } catch {
      showToast("Couldn't generate QR code", "error", 2500);
    } finally {
      setIsGeneratingQR(false);
    }
  };

  const handleDownloadQR = () => {
    const url = qrDataUrl();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename()}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("QR downloading", "success", 1500);
  };

  const handleShareQR = async () => {
    const url = qrDataUrl();
    if (!url) return;
    try {
      const file = await dataUrlToFile(url, `${filename()}-qr.png`);
      if (webShareAvailable() && fileShareAvailable()) {
        const nav = navigator as Navigator & {
          canShare?: (data: { files: File[] }) => boolean;
        };
        const shareData = { files: [file] };
        if (nav.canShare?.(shareData)) {
          await navigator.share(shareData);
          showToast("QR shared!", "success", 1500);
          return;
        }
      }
      downloadBlob(await (await fetch(url)).blob(), `${filename()}-qr.png`);
      showToast("QR downloading", "success", 1500);
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "AbortError") return;
      showToast("Couldn't share QR", "error", 2500);
    }
  };

  // ── Watch status display helper ────────────────────────────
  const watchStatusLabel = createMemo(() => {
    const vi = props.vaultItem?.();
    if (!vi) return null;
    return vi.status;
  });

  const userRatingDisplay = createMemo(() => {
    const vi = props.vaultItem?.();
    if (!vi || vi.rating === undefined || vi.rating === null) return null;
    return `★ ${vi.rating}/10`;
  });

  // ── Genres for share card ──────────────────────────────────
  const genresText = createMemo(() => {
    const d = props.details();
    return d?.genres?.map((g) => g.name).join(", ") ?? "";
  });

  const runtimeText = createMemo(() => {
    const d = props.details();
    if (!d?.runtime) return "";
    return `${d.runtime} min`;
  });

  // ── Cleanup ────────────────────────────────────────────────
  onCleanup(() => {
    const cardUrl = shareCardUrl();
    if (cardUrl) URL.revokeObjectURL(cardUrl);
  });

  // ── Render ─────────────────────────────────────────────────
  return (
    <>
      <GlassSheet
        open={props.show()}
        onClose={handleClose}
        strength="strong"
        snap="tall"
        title="Share"
        icon="share"
        zIndexBase={1000000}
      >
        {/* Header Section */}
        <div class="share-premium-header">
          <Show
            when={posterUrl()}
            fallback={
              <div class="share-premium-poster-fallback">
                <span class="material-symbols-outlined" aria-hidden="true">
                  movie
                </span>
              </div>
            }
          >
            {(url) => (
              <img
                src={url()}
                alt=""
                class="share-premium-poster"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
          </Show>

          <div class="share-premium-meta">
            <h3 class="share-premium-title">{title()}</h3>
            <div class="share-premium-subtitle">
              <Show when={year()}>
                <span class="share-premium-year">{year()}</span>
              </Show>
              <span class="share-premium-type-badge">
                {props.mediaType() === "tv" ? "TV" : "Movie"}
              </span>
            </div>

            {/* Rating badges */}
            <Show when={ratingsLine()}>
              <div class="share-premium-ratings">
                <Show when={mdbRatings()?.imdb?.score && mdbRatings()?.imdb?.score !== "NR"}>
                  <span class="share-premium-rating-badge">
                    <span class="share-premium-rating-label">IMDb</span>
                    {mdbRatings()?.imdb?.score}
                  </span>
                </Show>
                <Show when={mdbRatings()?.rottenTomatoes?.score && mdbRatings()?.rottenTomatoes?.score !== "NR"}>
                  <span class="share-premium-rating-badge">
                    <span class="share-premium-rating-label">RT</span>
                    {mdbRatings()?.rottenTomatoes?.score}
                  </span>
                </Show>
                <Show when={mdbRatings()?.metacritic?.score && mdbRatings()?.metacritic?.score !== "NR"}>
                  <span class="share-premium-rating-badge">
                    <span class="share-premium-rating-label">MC</span>
                    {mdbRatings()?.metacritic?.score}
                  </span>
                </Show>
              </div>
            </Show>

            <div class="share-premium-share-label">Share this title</div>
          </div>
        </div>

        {/* 6 Options */}
        <div class="share-premium-options">
          {/* 1. Share */}
          <button
            type="button"
            class="share-premium-option"
            onClick={handleShare}
            disabled={!props.details()}
            aria-label="Share via app"
          >
            <div class="share-premium-option-icon">
              <span class="material-symbols-outlined" aria-hidden="true">
                share
              </span>
            </div>
            <div class="share-premium-option-text">
              <span class="share-premium-option-title">
                {webShareAvailable() ? "Share" : "Copy Text"}
              </span>
              <span class="share-premium-option-desc">
                {webShareAvailable()
                  ? "Share via apps, messages, or email"
                  : "Copy share text to clipboard"}
              </span>
            </div>
            <span class="material-symbols-outlined share-premium-option-chevron" aria-hidden="true">
              chevron_right
            </span>
          </button>

          {/* 2. Copy Link */}
          <button
            type="button"
            class="share-premium-option"
            onClick={handleCopyLink}
            disabled={isCopyingLink() || !props.details()}
            aria-label="Copy link"
          >
            <div class="share-premium-option-icon">
              <Show
                when={!isCopyingLink()}
                fallback={
                  <span class="material-symbols-outlined" aria-hidden="true" style="color: var(--p);">
                    check
                  </span>
                }
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  link
                </span>
              </Show>
            </div>
            <div class="share-premium-option-text">
              <span class="share-premium-option-title">Copy Link</span>
              <span class="share-premium-option-desc">
                {shareUrl().length > 40
                  ? shareUrl().slice(0, 40) + "…"
                  : shareUrl()}
              </span>
            </div>
            <span class="material-symbols-outlined share-premium-option-chevron" aria-hidden="true">
              chevron_right
            </span>
          </button>

          {/* 3. Copy Rich Text */}
          <button
            type="button"
            class="share-premium-option"
            onClick={handleCopyRichText}
            disabled={isCopyingRich() || !props.details()}
            aria-label="Copy rich text"
          >
            <div class="share-premium-option-icon">
              <Show
                when={!isCopyingRich()}
                fallback={
                  <span class="material-symbols-outlined" aria-hidden="true" style="color: var(--p);">
                    check
                  </span>
                }
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  content_copy
                </span>
              </Show>
            </div>
            <div class="share-premium-option-text">
              <span class="share-premium-option-title">Copy Rich Text</span>
              <span class="share-premium-option-desc">
                Formatted with ratings, genres & overview
              </span>
            </div>
            <span class="material-symbols-outlined share-premium-option-chevron" aria-hidden="true">
              chevron_right
            </span>
          </button>

          {/* 4. Save Poster */}
          <button
            type="button"
            class="share-premium-option"
            onClick={handleSavePoster}
            disabled={isSavingPoster() || !props.details()?.poster_path}
            aria-label="Save poster"
          >
            <div class="share-premium-option-icon">
              <Show
                when={!isSavingPoster()}
                fallback={<div class="share-premium-spinner" />}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  image
                </span>
              </Show>
            </div>
            <div class="share-premium-option-text">
              <span class="share-premium-option-title">Save Poster</span>
              <span class="share-premium-option-desc">
                {typeof navigator.clipboard !== "undefined" &&
                typeof navigator.clipboard.write === "function" &&
                typeof ClipboardItem !== "undefined"
                  ? "Copy or download poster image"
                  : "Download poster image"}
              </span>
            </div>
            <span class="material-symbols-outlined share-premium-option-chevron" aria-hidden="true">
              chevron_right
            </span>
          </button>

          {/* 5. Generate Share Card */}
          <button
            type="button"
            class="share-premium-option"
            onClick={handleGenerateShareCard}
            disabled={isGeneratingCard() || !props.details()}
            aria-label="Generate share card"
          >
            <div class="share-premium-option-icon">
              <Show
                when={!isGeneratingCard()}
                fallback={<div class="share-premium-spinner" />}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  photo_library
                </span>
              </Show>
            </div>
            <div class="share-premium-option-text">
              <span class="share-premium-option-title">Generate Share Card</span>
              <span class="share-premium-option-desc">
                Premium CineLog card with poster & ratings
              </span>
            </div>
            <span class="material-symbols-outlined share-premium-option-chevron" aria-hidden="true">
              chevron_right
            </span>
          </button>

          {/* 6. QR Code */}
          <button
            type="button"
            class="share-premium-option"
            onClick={handleGenerateQR}
            disabled={isGeneratingQR() || !props.details()}
            aria-label="Generate QR code"
          >
            <div class="share-premium-option-icon">
              <Show
                when={!isGeneratingQR()}
                fallback={<div class="share-premium-spinner" />}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  qr_code_2
                </span>
              </Show>
            </div>
            <div class="share-premium-option-text">
              <span class="share-premium-option-title">QR Code</span>
              <span class="share-premium-option-desc">
                Scan to open this title on any device
              </span>
            </div>
            <span class="material-symbols-outlined share-premium-option-chevron" aria-hidden="true">
              chevron_right
            </span>
          </button>
        </div>

        {/* Share Card Preview (after generation) */}
        <Show when={shareCardUrl()}>
          <div class="share-premium-card-preview">
            <img
              src={shareCardUrl()!}
              alt="CineLog share card"
              class="share-premium-card-preview-img"
            />
            <div class="share-premium-card-actions">
              <button
                type="button"
                class="share-premium-qr-action-btn"
                onClick={handleDownloadCard}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  download
                </span>
                Save
              </button>
              <button
                type="button"
                class="share-premium-qr-action-btn"
                onClick={handleShareCard}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  share
                </span>
                Share
              </button>
            </div>
          </div>
        </Show>

        {/* QR Code Preview (after generation) */}
        <Show when={qrDataUrl()}>
          <div class="share-premium-qr-section">
            <img
              src={qrDataUrl()!}
              alt="QR Code for this title"
              class="share-premium-qr-image"
            />
            <span class="share-premium-qr-url">{shareUrl()}</span>
            <div class="share-premium-qr-actions">
              <button
                type="button"
                class="share-premium-qr-action-btn"
                onClick={() => setShowQrFullscreen(true)}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  fullscreen
                </span>
                Fullscreen
              </button>
              <button
                type="button"
                class="share-premium-qr-action-btn"
                onClick={handleDownloadQR}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  download
                </span>
                Download
              </button>
              <button
                type="button"
                class="share-premium-qr-action-btn"
                onClick={handleShareQR}
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  share
                </span>
                Share
              </button>
            </div>
          </div>
        </Show>
      </GlassSheet>

      {/* Hidden Share Card for html2canvas capture */}
      <Show when={props.show() && props.details()}>
        <div class="share-card-wrapper">
          <div id="share-card-render" class="share-card-canvas">
            {/* Backdrop */}
            <Show when={props.details()?.backdrop_path}>
              <img
                src={tmdbImage(props.details()!.backdrop_path, "w780")}
                alt=""
                class="share-card-backdrop"
                crossorigin="anonymous"
              />
              <div class="share-card-backdrop-overlay" />
            </Show>

            <div class="share-card-content">
              {/* Top: Poster + Info */}
              <div class="share-card-top">
                <Show when={props.details()?.poster_path}>
                  <img
                    src={tmdbImage(props.details()!.poster_path, "w342")}
                    alt=""
                    class="share-card-poster"
                    crossorigin="anonymous"
                  />
                </Show>
                <div class="share-card-info">
                  <h2 class="share-card-title">{title()}</h2>
                  <Show when={year()}>
                    <p class="share-card-year">{year()}</p>
                  </Show>
                  <Show when={genresText()}>
                    <p class="share-card-genres">{genresText()}</p>
                  </Show>
                  <Show when={runtimeText()}>
                    <p class="share-card-runtime">⏱ {runtimeText()}</p>
                  </Show>
                </div>
              </div>

              {/* Ratings */}
              <Show when={ratingsLine()}>
                <div class="share-card-ratings-row">
                  <Show when={mdbRatings()?.imdb?.score && mdbRatings()?.imdb?.score !== "NR"}>
                    <span class="share-card-rating-chip">
                      <span class="share-card-rating-chip-label">IMDb</span>
                      {mdbRatings()?.imdb?.score}
                    </span>
                  </Show>
                  <Show when={mdbRatings()?.rottenTomatoes?.score && mdbRatings()?.rottenTomatoes?.score !== "NR"}>
                    <span class="share-card-rating-chip">
                      <span class="share-card-rating-chip-label">RT</span>
                      {mdbRatings()?.rottenTomatoes?.score}
                    </span>
                  </Show>
                  <Show when={mdbRatings()?.metacritic?.score && mdbRatings()?.metacritic?.score !== "NR"}>
                    <span class="share-card-rating-chip">
                      <span class="share-card-rating-chip-label">MC</span>
                      {mdbRatings()?.metacritic?.score}
                    </span>
                  </Show>
                </div>
              </Show>

              {/* Watch Status & User Rating */}
              <Show when={watchStatusLabel()}>
                <div class="share-card-status-row">
                  <span class="share-card-status-chip">
                    {watchStatusLabel()}
                  </span>
                  <Show when={userRatingDisplay()}>
                    <span class="share-card-status-chip gold">
                      {userRatingDisplay()}
                    </span>
                  </Show>
                </div>
              </Show>

              {/* Footer: Branding + QR */}
              <div class="share-card-footer">
                <div class="share-card-branding">
                  <p class="share-card-branding-name">CINELOG</p>
                  <p class="share-card-branding-url">cinelogv2.vercel.app</p>
                </div>
                <img
                  src={(() => {
                    // Inline QR generation — we use the qrDataUrl if available,
                    // otherwise a placeholder. This is rendered in a hidden div,
                    // so the QR is typically generated by the time the user
                    // clicks "Generate Share Card".
                    return (
                      qrDataUrl() ||
                      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                    );
                  })()}
                  alt="QR Code"
                  class="share-card-qr"
                />
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* QR Code Fullscreen Overlay */}
      <Show when={showQrFullscreen() && qrDataUrl()}>
        <Portal>
          <div class="share-premium-qr-fullscreen">
            <button
              type="button"
              class="share-premium-qr-fullscreen-close"
              onClick={() => setShowQrFullscreen(false)}
              aria-label="Close QR fullscreen"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
            <img src={qrDataUrl()!} alt="QR Code" />
            <p style="color: var(--text-soft); font-size: 0.875rem; text-align: center; word-break: break-all;">
              {shareUrl()}
            </p>
          </div>
        </Portal>
      </Show>
    </>
  );
};

export default ShareSheet;
