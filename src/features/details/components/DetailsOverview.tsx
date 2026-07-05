// src/features/details/components/DetailsOverview.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";
import type { TMDBDetails, OMDbRatings } from "~/shared/types";

interface DetailsOverviewProps {
  details: TMDBDetails | null;
  omdb: OMDbRatings | null;
}

export default function DetailsOverview(props: DetailsOverviewProps) {
  const tmdbRating = () =>
    props.details?.vote_average
      ? props.details.vote_average.toFixed(1)
      : "-";

  const imdbRating = () => props.omdb?.imdb || "-";

  return (
    <div class="mt-4 space-y-6 animate-fade-in">
      <div class="grid grid-cols-2 gap-4 w-full max-w-xs">
        <div
          class="bg-black/40 backdrop-blur-md border border-white/10 py-3 rounded-xl flex flex-col items-center justify-center text-center shadow-md"
          role="img"
          aria-label={`IMDb score: ${imdbRating()}`}
        >
          <div class="flex items-center gap-1.5 mb-1.5">
            <span style="font-size: 13px; line-height: 1" aria-hidden="true">🍅</span>
            <span class="type-metadata font-black text-white">{imdbRating()}</span>
          </div>
          <span class="type-caption text-gray-500">IMDb</span>
        </div>

        <div
          class="bg-black/40 backdrop-blur-md border border-white/10 py-3 rounded-xl flex flex-col items-center justify-center text-center shadow-md"
          role="img"
          aria-label={`TMDB score: ${tmdbRating()}`}
        >
          <div class="flex items-center gap-1.5 mb-1.5">
            <Icon name="star" fill class="text-[13px] text-[#f5c518]" aria-hidden="true" />
            <span class="type-metadata font-black text-white">{tmdbRating()}</span>
          </div>
          <span class="type-caption text-gray-500">TMDB</span>
        </div>
      </div>

      <div>
        <h3 class="type-section-title mb-2">Overview</h3>
        <p class="type-metadata text-gray-400 leading-relaxed">
          {props.details?.overview || "No overview available."}
        </p>
      </div>
    </div>
  );
}
