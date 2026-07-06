// src/features/details/components/DetailsOverview.tsx
import { For, Show } from "solid-js";
import type { TMDBDetails, OMDbRatings } from "~/shared/types";

interface DetailsOverviewProps {
  details: TMDBDetails | null;
  omdb: OMDbRatings | null;
}

export default function DetailsOverview(props: DetailsOverviewProps) {
  const cast = () =>
    (props.omdb?.actors || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const director = () => props.omdb?.director?.trim();
  const writer = () => props.omdb?.writer?.trim();
  const rated = () => props.omdb?.rated?.trim();

  return (
    <div class="mt-6 space-y-6 animate-fade-in">
      {/* Overview */}
      <div>
        <h3 class="type-section-title mb-2">Overview</h3>
        <p class="type-metadata text-gray-400 leading-relaxed">
          {props.details?.overview || "No overview available."}
        </p>
      </div>

      {/* Cast & Crew */}
      <Show when={director() || writer() || cast().length > 0 || rated()}>
        <div class="space-y-3">
          <Show when={director()}>
            <div class="flex gap-3">
              <span class="type-label w-20 shrink-0" style="color: var(--muted)">Director</span>
              <span class="type-metadata text-gray-300 flex-1">{director()}</span>
            </div>
          </Show>
          <Show when={writer()}>
            <div class="flex gap-3">
              <span class="type-label w-20 shrink-0" style="color: var(--muted)">Writer</span>
              <span class="type-metadata text-gray-300 flex-1">{writer()}</span>
            </div>
          </Show>
          <Show when={cast().length > 0}>
            <div class="flex gap-3">
              <span class="type-label w-20 shrink-0" style="color: var(--muted)">Cast</span>
              <div class="flex-1 flex flex-wrap gap-1.5">
                <For each={cast()}>
                  {(name) => (
                    <span
                      class="type-caption px-2 py-1 rounded-md"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        color: "rgba(232,234,240,0.7)",
                        border: "1px solid var(--border)"
                      }}
                    >
                      {name}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <Show when={rated()}>
            <div class="flex gap-3">
              <span class="type-label w-20 shrink-0" style="color: var(--muted)">Rated</span>
              <span class="type-metadata text-gray-300 flex-1">{rated()}</span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
