// src/features/details/components/CinematicHero.tsx
import { Show, createSignal, createEffect, onCleanup, onMount } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

interface CinematicHeroProps {
  baseItem: WatchlistItem | null;
  details: TMDBDetails | null;
  /**
   * Close handler — kept in the interface for backwards compat with
   * DetailsHero, but the actual close BUTTON is no longer rendered here.
   * The close button is rendered once at the modal-container level
   * (DetailsModal.tsx) with position:fixed so it stays visible while
   * scrolling. Rendering it here too caused a double-button overlap.
   */
  onClose: () => void;
  /** Whether the trailer is currently active — replaces the backdrop with the iframe */
  trailerActive?: boolean;
  /** YouTube video key for the trailer (from pickTrailer) */
  trailerKey?: string | null;
  /** Called when the user closes the trailer (taps the close-trailer button) */
  onCloseTrailer?: () => void;
  /**
   * Whether a trailer is available at all. When true AND the trailer
   * isn't currently playing, a high-contrast "Watch Trailer" overlay
   * button is rendered on top of the backdrop image (Netflix-style).
   */
  hasTrailer?: boolean;
  /** Called when the user taps the "Watch Trailer" overlay button. */
  onPlayTrailer?: () => void;
}

/**
 * CinematicHero — the emotional centerpiece of the Details page.
 *
 * Signature interaction: "Adaptive Backdrop"
 *  - Full-bleed backdrop fills the top 50vh (max 480px)
 *  - Multi-layer gradients: bottom fade into content (no hard cut-off),
 *    top fade for status bar legibility, left fade for text legibility
 *  - Floating poster overlaps the hero/content boundary
 *  - Title + tagline + quick-meta pills sit below the poster
 *  - The backdrop visually continues into the content via the
 *    cinematic-ambient blurred layer (rendered in DetailsModal)
 *
 * TRAILER INTEGRATION:
 *  When `trailerActive` is true, the backdrop image is HIDDEN and the
 *  YouTube iframe is rendered in its place — filling the entire hero
 *  area. This is how Netflix / Apple TV+ handle trailers: the player
 *  replaces the artwork, not a separate section below.
 *
 *  The iframe uses position: absolute; inset: 0; z-index: 5 — above
 *  the backdrop (z-index: 0) and overlay (z-index: 1) but below the
 *  close button (z-index: 20). When the trailer is active, the overlay
 *  is hidden so the video is fully visible.
 *
 *  A "close trailer" button appears top-left when the trailer is active,
 *  so the user can return to the backdrop view.
 *
 * TRAILER CTA OVERLAY (v2.5):
 *  When `hasTrailer` is true AND the trailer is NOT currently playing,
 *  a high-contrast "Watch Trailer" overlay button is positioned
 *  center-bottom of the backdrop image. Clicking it calls `onPlayTrailer`
 *  which flips `trailerActive` to true (the orchestrator owns this
 *  state) and the iframe replaces the backdrop. Netflix-style discovery
 *  affordance: the trailer is one tap away without leaving the hero.
 *
 * SSR-safe: all data from props, no client-only APIs.
 */
export default function CinematicHero(props: CinematicHeroProps) {
  const [backdropLoaded, setBackdropLoaded] = createSignal(false);
  const [backdropError, setBackdropError] = createSignal(false);
  const [iframeError, setIframeError] = createSignal(false);
  const [_scrolled, setScrolled] = createSignal(false);

  // Reset iframe error state when trailer key changes so retry works
  createEffect(() => {
    const key = props.trailerKey;
    const active = props.trailerActive;
    if (key && active) setIframeError(false);
  });

  const backdropUrl = () => {
    if (backdropError()) return "";
    const path = props.baseItem?.backdrop_path || props.details?.backdrop_path;
    return path ? tmdbImage(path, "w1280") : "";
  };

  // Subtle scroll-based backdrop parallax (the "adaptive" part)
  // Disabled when trailer is active — the iframe shouldn't parallax.
  let heroRef: HTMLDivElement | undefined;
  let scrollRef: HTMLElement | undefined;

  const onScroll = () => {
    if (!scrollRef || !heroRef) return;
    if (props.trailerActive) return; // no parallax during trailer playback
    const scrollTop = scrollRef.scrollTop;
    const heroHeight = heroRef.offsetHeight;
    const progress = Math.min(1, scrollTop / heroHeight);
    setScrolled(progress > 0.1);

    const backdrop = heroRef.querySelector(
      ".cinematic-backdrop"
    ) as HTMLElement;
    if (backdrop) {
      const offset = scrollTop * 0.3;
      backdrop.style.transform = `scale(1.08) translateY(${-offset}px)`;
      backdrop.style.opacity = String(Math.max(0, 1 - progress * 1.2));
    }
  };

  onMount(() => {
    const parent = heroRef?.parentElement;
    if (parent) {
      scrollRef = parent;
      parent.addEventListener("scroll", onScroll, { passive: true });
    }
    onCleanup(() => {
      scrollRef?.removeEventListener("scroll", onScroll);
    });
  });

  return (
    <div class="cinematic-hero" ref={heroRef}>
      {/* Backdrop layer — HIDDEN when trailer is active.
          Falls back to the gradient overlay if the image URL fails
          to load (broken TMDB path, CDN hiccup, etc.) so the user
          never sees a broken-image glyph behind the hero. */}
      <Show when={backdropUrl() && !props.trailerActive}>
        <img
          src={backdropUrl()}
          class={`cinematic-backdrop${backdropLoaded() ? " img-loaded" : ""}`}
          loading="eager"
          decoding="async"
          {...({ fetchpriority: "high" } as Record<string, string>)}
          onLoad={() => setBackdropLoaded(true)}
          onError={() => setBackdropError(true)}
          alt=""
          aria-hidden="true"
        />
      </Show>

      {/* Multi-layer gradient overlay — HIDDEN when trailer is active */}
      <Show when={!props.trailerActive}>
        <div class="cinematic-hero-overlay" aria-hidden="true" />
      </Show>

      {/* "Watch Trailer" overlay button — Netflix-style CTA on the backdrop.
          Only renders when:
            - A trailer is available (hasTrailer=true)
            - The trailer is NOT currently playing (trailerActive=false)
            - A backdrop URL exists (so the button has something to sit on)
            - onPlayTrailer is wired (defensive — always true in DetailsModal)
          The button is positioned center-bottom of the hero, above the
          gradient overlay (z-index: 3) so it stays visible against any
          backdrop. High-contrast white-on-black with backdrop blur so it
          pops against both bright and dark backdrop images. */}
      <Show
        when={
          props.hasTrailer &&
          !props.trailerActive &&
          !!backdropUrl() &&
          !!props.onPlayTrailer
        }
      >
        <button
          type="button"
          class="cinematic-hero-trailer-cta"
          onClick={() => props.onPlayTrailer?.()}
          aria-label="Watch trailer"
        >
          <span
            class="material-symbols-outlined"
            style={{
              "font-size": "20px",
              "font-variation-settings":
                "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
            }}
            aria-hidden="true"
          >
            play_circle
          </span>
          <span>Watch Trailer</span>
        </button>
      </Show>

      {/* Trailer iframe — replaces the backdrop when active.
          z-index: 5 ensures it paints above the backdrop/overlay layers
          but below the close button (z-index: 20).
          
          Uses youtube-nocookie.com for privacy-enhanced mode.
          referrerpolicy="strict-origin-when-cross-origin" prevents
          full URL leakage to YouTube.
          
          Fallback: if the embed is blocked (CSP, YouTube restrictions,
          network errors), an error state is shown with a "Watch on
          YouTube" link that opens the video directly on youtube.com. */}
      <Show when={props.trailerActive && props.trailerKey}>
        <div class="cinematic-trailer-player" aria-label="Trailer player">
          <Show
            when={!iframeError()}
            fallback={
              <div class="cinematic-trailer-fallback">
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "48px", color: "var(--text-soft)" }}
                  aria-hidden="true"
                >
                  play_circle
                </span>
                <p class="cinematic-trailer-fallback-text">
                  Trailer embed unavailable
                </p>
                <a
                  class="cinematic-trailer-fallback-link"
                  href={`https://www.youtube.com/watch?v=${props.trailerKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Watch on YouTube
                </a>
              </div>
            }
          >
            <iframe
              class="cinematic-trailer-iframe"
              src={`https://www.youtube-nocookie.com/embed/${props.trailerKey}?autoplay=1&rel=0`}
              title="Trailer"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
              onError={() => setIframeError(true)}
            />
          </Show>
        </div>
        {/* Close trailer button — top left, restores the backdrop */}
        <button
          onClick={() => props.onCloseTrailer?.()}
          class="cinematic-trailer-close"
          aria-label="Close trailer"
        >
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "18px" }}
            aria-hidden="true"
          >
            close
          </span>
        </button>
      </Show>
    </div>
  );
}
