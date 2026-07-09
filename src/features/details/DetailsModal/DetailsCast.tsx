// src/features/details/DetailsModal/DetailsCast.tsx
import { Show, For } from "solid-js";
import type { Accessor } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import type { OMDbRatings } from "~/shared/types";

/**
 * DetailsCast — Cast & Crew section.
 *
 * Extracted from the inline CastCrewGrid that lived at the bottom of the
 * old DetailsModal.tsx. Uses the v2-meta-row system for editorial alignment.
 *
 * Renders only when at least one of director / writer / actors is present
 * in the OMDb payload.
 */
export interface DetailsCastProps {
  omdb: Accessor<OMDbRatings | null>;
}

export default function DetailsCast(props: DetailsCastProps) {
  const cast = () =>
    (props.omdb()?.actors || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

  const director = () => props.omdb()?.director?.trim();
  const writer = () => props.omdb()?.writer?.trim();

  return (
    <Show when={director() || writer() || cast().length > 0}>
      <DetailSection label="Cast & Crew" icon="groups">
        <div class="space-y-2.5">
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
                <For each={cast()}>{(name: string) => <span class="v2-pill">{name}</span>}</For>
              </div>
            </div>
          </Show>
        </div>
      </DetailSection>
    </Show>
  );
}
