// src/features/details/components/TrailerSection.tsx
import { Show, createMemo, createSignal } from "solid-js";
import { pickTrailer } from "~/core/tmdb/tmdb";
import type { TMDBDetails } from "~/shared/types";

interface TrailerSectionProps {
  details: TMDBDetails | null;
  /** When true, renders without a section header (for inline expansion in ActionDock). */
  inline?: boolean;
}

/**
 * Trailer section — lazy-loaded YouTube trailer.
 *
 * Modes:
 *  - Default: renders with a "Trailer" section header
 *  - Inline: renders bare (no header) for expansion inside the ActionDock
 *
 * Click-to-play: the YouTube iframe is only mounted when the user clicks
 * the thumbnail, saving bandwidth and avoiding loading youtube.com on
 * every Details open.
 */
export default function TrailerSection(props: TrailerSectionProps) {
  const trailer = createMemo(() => pickTrailer(props.details));
  const [play, setPlay] = createSignal(false);

  const thumb = () =>
    trailer() ? `https://i.ytimg.com/vi/${trailer()!.key}/hqdefault.jpg` : "";

  return (
    <Show when={trailer()}>
      <div class={props.inline ? "" : "mt-6 animate-fade-in"}>
        <Show when={!props.inline}>
          <div class="detail-section-label" style={{ "margin-bottom": "0.75rem" }}>
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "12px", color: "var(--p)" }}
              aria-hidden="true"
            >
              play_circle
            </span>
            Trailer
          </div>
        </Show>

        <div
          class="trailer-inline"
          style={{ "aspect-ratio": "16 / 9" }}
        >
          <Show
            when={play()}
            fallback={
              <button
                type="button"
                onClick={() => setPlay(true)}
                class="absolute inset-0 w-full h-full flex items-center justify-center group"
                style={{ position: "relative" }}
                aria-label={`Play trailer: ${trailer()!.name}`}
              >
                <img
                  src={thumb()}
                  alt=""
                  class="absolute inset-0 w-full h-full object-cover"
                  style="filter: brightness(0.55)"
                  loading="lazy"
                  decoding="async"
                />
                <div
                  class="relative z-10 flex items-center justify-center w-16 h-16 rounded-full transition-transform group-hover:scale-110 group-active:scale-95"
                  style={{
                    background: "var(--p)",
                    "box-shadow": "0 0 24px var(--p-glow)"
                  }}
                  aria-hidden="true"
                >
                  <span
                    class="material-symbols-outlined"
                    style={{
                      "font-size": "32px",
                      color: "var(--active-text)",
                      "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                    }}
                    aria-hidden="true"
                  >
                    play_arrow
                  </span>
                </div>
                <span
                  class="absolute bottom-3 left-3 right-3 z-10 text-left type-micro truncate"
                  style={{ color: "rgba(255,255,255,0.85)", "text-shadow": "0 1px 4px rgba(0,0,0,0.9)" }}
                >
                  {trailer()!.name}
                </span>
              </button>
            }
          >
            <iframe
              class="absolute inset-0 w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${trailer()!.key}?autoplay=1&rel=0`}
              title={trailer()!.name}
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            />
          </Show>
        </div>
      </div>
    </Show>
  );
}
