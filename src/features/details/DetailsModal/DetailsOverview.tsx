// src/features/details/DetailsModal/DetailsOverview.tsx
//
// Overview section — shows the synopsis/description for the title.
//
// For anime: prefers AniList description (richer, community-maintained)
// and falls back to TMDB overview only when AniList has none.
// Never shows both.
//
// For movies/TV: always uses TMDB overview (unchanged behavior).
import { Show, createMemo } from "solid-js";
import type { Accessor } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import type { TMDBDetails } from "~/shared/types";
import type { AniListMedia } from "~/lib/anilist";

export interface DetailsOverviewProps {
  details: Accessor<TMDBDetails | null>;
  /** AniList data — null for non-anime titles. */
  anilist?: Accessor<AniListMedia | null>;
}

/**
 * Strip basic HTML tags from AniList descriptions.
 * AniList returns descriptions with <i>, <b>, <br>, etc.
 * We convert <br> to newlines and strip the rest.
 */
function stripAniListHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .trim();
}

export default function DetailsOverview(props: DetailsOverviewProps) {
  const overviewText = createMemo(() => {
    const al = props.anilist?.();
    // Anime: prefer AniList description, fallback to TMDB
    if (al?.description) {
      const cleaned = stripAniListHtml(al.description);
      if (cleaned) return cleaned;
    }
    // Non-anime or AniList has no description: use TMDB
    return props.details()?.overview || null;
  });

  return (
    <Show when={overviewText()}>
      <DetailSection label="Overview" icon="description">
        <p
          class="type-body"
          style={{ color: "var(--text-soft)", "line-height": "1.65" }}
        >
          {overviewText()}
        </p>
      </DetailSection>
    </Show>
  );
}
