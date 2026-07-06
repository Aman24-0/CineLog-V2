// src/features/details/components/TrailerSection.tsx
import { Show, createMemo, createSignal } from "solid-js";
import Icon from "~/shared/ui/Icon";
import { pickTrailer } from "~/core/tmdb/tmdb";
import type { TMDBDetails } from "~/shared/types";

interface TrailerSectionProps {
  details: TMDBDetails | null;
}

/**
 * Lazy-loaded trailer section. Renders a YouTube thumbnail with a play button;
 * the iframe is only mounted when the user clicks (saves bandwidth + avoids
 * loading youtube.com on every Details open).
 */
export default function TrailerSection(props: TrailerSectionProps) {
  const trailer = createMemo(() => pickTrailer(props.details));
  const [play, setPlay] = createSignal(false);

  const thumb = () =>
    trailer() ? `https://i.ytimg.com/vi/${trailer()!.key}/hqdefault.jpg` : "";

  return (
    <Show when={trailer()}>
      <div class="mt-6 animate-fade-in">
        <h3 class="type-section-title mb-4 flex items-center gap-2">
          <Icon name="play_circle" style="color: var(--p); font-size: 14px" aria-hidden="true" />
          Trailer
        </h3>

        <div
          class="relative w-full rounded-2xl overflow-hidden border"
          style={{
            "aspect-ratio": "16 / 9",
            "border-color": "var(--border)",
            background: "#000"
          }}
        >
          <Show
            when={play()}
            fallback={
              <button
                type="button"
                onClick={() => setPlay(true)}
                class="absolute inset-0 w-full h-full flex items-center justify-center group"
                aria-label={`Play trailer: ${trailer()!.name}`}
              >
                <img
                  src={thumb()}
                  alt=""
                  class="absolute inset-0 w-full h-full object-cover"
                  style="filter: brightness(0.55)"
                  loading="lazy"
                />
                <div
                  class="relative z-10 flex items-center justify-center w-16 h-16 rounded-full transition-transform group-hover:scale-110 group-active:scale-95"
                  style={{
                    background: "var(--p)",
                    "box-shadow": "0 0 24px var(--p-glow)"
                  }}
                  aria-hidden="true"
                >
                  <Icon name="play_arrow" fill style="color: #05060a; font-size: 32px" />
                </div>
                <span
                  class="absolute bottom-3 left-3 right-3 z-10 text-left type-caption truncate"
                  style="color: rgba(255,255,255,0.85); text-shadow: 0 1px 4px rgba(0,0,0,0.9)"
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
