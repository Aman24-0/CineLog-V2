// src/features/details/components/DetailsOverview.tsx
import { For, Show } from "solid-js";
import type { TMDBDetails, OMDbRatings } from "~/shared/types";

interface DetailsOverviewProps {
  details: TMDBDetails | null;
  omdb: OMDbRatings | null;
}

/**
 * Details overview — V2 information hierarchy.
 *
 * Layout:
 *  - Overview paragraph (primary reading content)
 *  - Cast & crew metadata rows (secondary, using v2-meta-row system)
 *
 * The v2-meta-row grid (5rem label / 1fr value) creates perfect alignment
 * across all key-value pairs, giving the details page a clean editorial feel.
 */
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
    <div class="space-y-5">
      {/* Overview — primary reading content */}
      <div>
        <div class="v2-info-group-label mb-2">Overview</div>
        <p class="type-body" style={{ color: "var(--text-soft)", "line-height": 1.6 }}>
          {props.details?.overview || "No overview available."}
        </p>
      </div>

      {/* Cast & crew — secondary metadata */}
      <Show when={director() || writer() || cast().length > 0 || rated()}>
        <div class="space-y-2.5">
          <div class="v2-info-group-label">Cast & Crew</div>
          <Show when={director()}>
            <div class="v2-meta-row">
              <span class="v2-meta-label">Director</span>
              <span class="v2-meta-value">{director()}</span>
            </div>
          </Show>
          <Show when={writer()}>
            <div class="v2-meta-row">
              <span class="v2-meta-label">Writer</span>
              <span class="v2-meta-value">{writer()}</span>
            </div>
          </Show>
          <Show when={cast().length > 0}>
            <div class="v2-meta-row">
              <span class="v2-meta-label">Cast</span>
              <div class="flex flex-wrap gap-1.5">
                <For each={cast()}>
                  {(name) => (
                    <span class="v2-pill">{name}</span>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <Show when={rated()}>
            <div class="v2-meta-row">
              <span class="v2-meta-label">Rated</span>
              <span class="v2-meta-value">{rated()}</span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
