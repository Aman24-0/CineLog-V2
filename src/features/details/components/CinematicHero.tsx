// src/features/details/components/CinematicHero.tsx
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

interface CinematicHeroProps {
  baseItem: WatchlistItem | null;
  details: TMDBDetails | null;
  onClose: () => void;
  /** Whether the trailer is currently active — replaces the backdrop with the iframe */
  trailerActive?: boolean;
  /** YouTube video key for the trailer (from pickTrailer) */
  trailerKey?: string | null;
  /** Called when the user closes the trailer (taps the close-trailer button) */
  onCloseTrailer?: () => void;
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
 * SSR-safe: all data from props, no client-only APIs.
 */
export default function CinematicHero(props: CinematicHeroProps) {
  const [backdropLoaded, setBackdropLoaded] = createSignal(false);
  const [scrolled, setScrolled] = createSignal(false);

  const backdropUrl = () => {
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

    const backdrop = heroRef.querySelector(".cinematic-backdrop") as HTMLElement;
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
      {/* Backdrop layer — HIDDEN when trailer is active */}
      <Show when={backdropUrl() && !props.trailerActive}>
        <img
          src={backdropUrl()}
          class={`cinematic-backdrop${backdropLoaded() ? " img-loaded" : ""}`}
          loading="eager"
          decoding="async"
          {...{ fetchpriority: "high" } as any}
          onLoad={() => setBackdropLoaded(true)}
          alt=""
          aria-hidden="true"
        />
      </Show>

      {/* Multi-layer gradient overlay — HIDDEN when trailer is active */}
      <Show when={!props.trailerActive}>
        <div class="cinematic-hero-overlay" aria-hidden="true" />
      </Show>

      {/* Trailer iframe — replaces the backdrop when active.
          z-index: 5 ensures it paints above the backdrop/overlay layers
          but below the close button (z-index: 20). */}
      <Show when={props.trailerActive && props.trailerKey}>
        <div class="cinematic-trailer-player" aria-label="Trailer player">
          <iframe
            class="cinematic-trailer-iframe"
            src={`https://www.youtube-nocookie.com/embed/${props.trailerKey}?autoplay=1&rel=0`}
            title="Trailer"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          />
        </div>
        {/* Close trailer button — top left, restores the backdrop */}
        <button
          onClick={() => props.onCloseTrailer?.()}
          class="cinematic-trailer-close"
          aria-label="Close trailer"
        >
          <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
            close
          </span>
        </button>
      </Show>

      {/* Close button — top right, always visible (closes the whole modal) */}
      <button
        onClick={props.onClose}
        class="absolute top-4 right-4 z-20 flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-95"
        style={{
          background: "rgba(0,0,0,0.50)",
          "backdrop-filter": "blur(12px)",
          "-webkit-backdrop-filter": "blur(12px)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "var(--text-strong)"
        }}
        aria-label="Close details"
      >
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "18px" }}
          aria-hidden="true"
        >
          close
        </span>
      </button>
    </div>
  );
}
