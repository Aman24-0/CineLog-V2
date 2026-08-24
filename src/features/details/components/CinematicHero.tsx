// src/features/details/components/CinematicHero.tsx
import { Show, createSignal, createEffect, onCleanup, onMount } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

interface CinematicHeroProps {
  baseItem: WatchlistItem | null;
  details: TMDBDetails | null;
  /** Close handler retained for the shared DetailsHero contract. */
  onClose: () => void;
  /** Whether the trailer is currently active — replaces the backdrop with the iframe */
  trailerActive?: boolean;
  /** YouTube video key for the trailer (from pickTrailer) */
  trailerKey?: string | null;
  /** Called when the user turns the trailer off. */
  onCloseTrailer?: () => void;
  /** Whether a trailer is available for this title. */
  hasTrailer?: boolean;
  /** Called when the user turns the trailer on. */
  onPlayTrailer?: () => void;
  /** Dedicated page mode places Back in the hero safe area. */
  pageMode?: boolean;
}

/**
 * CinematicHero — the emotional centerpiece of the Details page.
 *
 * Signature interaction: "Adaptive Backdrop"
 *  - Full-bleed backdrop fills the top 50vh (max 480px)
 *  - Multi-layer gradients: bottom fade into content (no hard cut-off),
 *    top fade for status bar legibility, left fade for text legibility
 *  - Poster and title metadata follow the hero in a stable document-flow cluster
 *  - Title + tagline + quick-meta pills sit beside the poster
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
 *  The dedicated page uses an artwork-integrated Watch Trailer CTA. When the
 *  player is active, a compact exit control unmounts the iframe and restores
 *  the same hero artwork without changing the hero dimensions.
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
  let cachedHeroHeight = 0;

  const onScroll = () => {
    if (!scrollRef || !heroRef) return;
    if (props.trailerActive) return; // no parallax during trailer playback
    const scrollTop = scrollRef.scrollTop;
    // Cache heroHeight to avoid forced reflow on every scroll frame.
    // Only recompute on first call (0) — height doesn't change during scroll.
    const heroHeight =
      cachedHeroHeight || (cachedHeroHeight = heroRef.offsetHeight);
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
    // Modal mode scrolls inside `.cinematic-scroll`; page mode intentionally
    // removes that nested overflow trap, so walk upward to the app content
    // scroll surface instead.
    let parent = heroRef?.parentElement;
    while (parent && parent !== document.body) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") break;
      parent = parent.parentElement;
    }
    scrollRef = parent ?? document.getElementById("main-content") ?? undefined;
    scrollRef?.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => {
      scrollRef?.removeEventListener("scroll", onScroll);
    });
  });

  return (
    <div class="cinematic-hero" ref={heroRef}>
      <div class="cinematic-hero-media">
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
            alt={
              props.baseItem?.title ||
              props.baseItem?.name ||
              props.details?.name ||
              "Movie backdrop"
            }
          />
        </Show>

        {/* Multi-layer gradient overlay — HIDDEN when trailer is active */}
        <Show when={!props.trailerActive}>
          <div class="cinematic-hero-overlay" aria-hidden="true" />
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
        </Show>
      </div>

      <Show when={props.pageMode}>
        <button
          type="button"
          class="cinematic-hero-back focus-ring"
          onClick={() => props.onClose()}
          aria-label="Back to previous page"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            arrow_back
          </span>
          <span>Back</span>
        </button>
      </Show>

      {/* Trailer entry belongs to the artwork. It is intentionally absent
          when no trailer is available and disappears into the same hero box
          when the native player is active. */}
      <Show
        when={props.hasTrailer && !!props.onPlayTrailer && !props.trailerActive}
      >
        <button
          type="button"
          class="cinematic-hero-watch-cta focus-ring"
          onClick={() => props.onPlayTrailer?.()}
          aria-label="Watch trailer"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            play_arrow
          </span>
          <span>Watch Trailer</span>
        </button>
      </Show>

      {/* The player needs a way back to the artwork, but this is a secondary
          player control rather than the former Trailer On/Off toggle. */}
      <Show when={props.trailerActive && props.onCloseTrailer}>
        <button
          type="button"
          class="cinematic-hero-player-close focus-ring"
          onClick={() => props.onCloseTrailer?.()}
          aria-label="Close trailer"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            close
          </span>
          <span>Close trailer</span>
        </button>
      </Show>
    </div>
  );
}
