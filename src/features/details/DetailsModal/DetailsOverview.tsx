// src/features/details/DetailsModal/DetailsOverview.tsx
import { Show } from "solid-js";
import type { Accessor } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import type { TMDBDetails } from "~/shared/types";

/**
 * DetailsOverview — the overview paragraph inside a DetailSection.
 *
 * Renders only when TMDB returns an overview. Pure TMDB data —
 * no ownership boundary concerns here.
 */
export interface DetailsOverviewProps {
  details: Accessor<TMDBDetails | null>;
}

export default function DetailsOverview(props: DetailsOverviewProps) {
  return (
    <Show when={props.details()?.overview}>
      <DetailSection label="Overview" icon="description">
        <p
          class="type-body"
          style={{ color: "var(--text-soft)", "line-height": 1.65 }}
        >
          {props.details()!.overview}
        </p>
      </DetailSection>
    </Show>
  );
}
