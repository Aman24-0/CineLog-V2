// src/features/details/components/CinematicHero.tsx
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRuntime } from "~/shared/utils/format";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

interface CinematicHeroProps {
  baseItem: WatchlistItem | null;
  details: TMDBDetails | null;
  onClose: () => void;
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
 * The hero is mobile-first: poster is 100px on mobile, 120px on sm+.
 * Title uses Bebas Neue display at 2.25rem (mobile) / 3rem (desktop).
 *
 * SSR-safe: all data from props, no client-only APIs.
 */
export default function CinematicHero(props: CinematicHeroProps) {
  const [backdropLoaded, setBackdropLoaded] = createSignal(false);
  const [posterLoaded, setPosterLoaded] = createSignal(false);
  const [scrolled, setScrolled] = createSignal(false);

  const title = () =>
    props.baseItem?.title ||
    props.baseItem?.name ||
    props.details?.title ||
    props.details?.name ||
    "Untitled";

  const year = () =>
    (
      props.baseItem?.release_date ||
      props.details?.release_date ||
      props.baseItem?.first_air_date ||
      props.details?.first_air_date ||
      ""
    ).split("-")[0];

  const runtime = () =>
    props.details?.runtime || props.details?.episode_run_time?.[0] || props.baseItem?.runtime;

  const isTv = () =>
    props.baseItem?.media_type === "tv" || props.details?.media_type === "tv";

  const tagline = () => props.details?.tagline?.trim();

  const genres = () => props.details?.genres?.map((g) => g.name).slice(0, 3) ?? [];

  const backdropUrl = () => {
    const path = props.baseItem?.backdrop_path || props.details?.backdrop_path;
    return path ? tmdbImage(path, "w1280") : "";
  };

  const posterUrl = () => {
    const path = props.baseItem?.poster_path || props.details?.poster_path;
    return path ? tmdbImage(path, "w342") : "";
  };

  // Subtle scroll-based backdrop parallax (the "adaptive" part)
  let heroRef: HTMLDivElement | undefined;
  let scrollRef: HTMLElement | undefined;

  const onScroll = () => {
    if (!scrollRef || !heroRef) return;
    const scrollTop = scrollRef.scrollTop;
    const heroHeight = heroRef.offsetHeight;
    const progress = Math.min(1, scrollTop / heroHeight);
    setScrolled(progress > 0.1);

    // Parallax: backdrop moves up at 0.3x scroll speed
    const backdrop = heroRef.querySelector(".cinematic-backdrop") as HTMLElement;
    if (backdrop) {
      const offset = scrollTop * 0.3;
      backdrop.style.transform = `scale(1.08) translateY(${-offset}px)`;
      // Fade backdrop as it scrolls away
      backdrop.style.opacity = String(Math.max(0, 1 - progress * 1.2));
    }
  };

  onMount(() => {
    // Find the scroll container (parent .cinematic-scroll)
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
      {/* Backdrop layer */}
      <Show when={backdropUrl()}>
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

      {/* Multi-layer gradient overlay */}
      <div class="cinematic-hero-overlay" aria-hidden="true" />

      {/* Close button — top right, always visible */}
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
