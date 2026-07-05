// src/features/details/components/DetailsHeader.tsx
import { Show } from "solid-js";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

interface DetailsHeaderProps {
  baseItem: WatchlistItem | null;
  details: TMDBDetails | null;
}

export default function DetailsHeader(props: DetailsHeaderProps) {
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
    props.details?.runtime || props.details?.episode_run_time?.[0];

  const genres = () =>
    props.details?.genres?.map((g) => g.name).join(", ");

  const backdropUrl = () =>
    props.baseItem?.backdrop_path || props.details?.backdrop_path
      ? `https://image.tmdb.org/t/p/original${props.baseItem?.backdrop_path || props.details?.backdrop_path}`
      : "";

  return (
    <div class="relative">
      <div class="h-56 md:h-72 relative bg-black shrink-0 overflow-hidden">
        <Show when={backdropUrl()}>
          <img
            src={backdropUrl()}
            class="backdrop-img absolute inset-0"
            alt=""
            aria-hidden="true"
          />
        </Show>
        <div class="backdrop-gradient" aria-hidden="true" />
      </div>

      <div class="px-6 md:px-8 -mt-16 relative z-10 flex justify-between items-start mb-3">
        <div class="pr-3 flex-1 min-w-0">
          <h2
            class="type-modal-title text-white"
            style="text-shadow: 0 2px 16px rgba(0,0,0,0.9), 0 1px 4px rgba(0,0,0,1);"
          >
            {title()}
          </h2>
          <p class="type-subtitle mt-1.5">
            {year()}
            {year() ? " · " : ""}
            {props.baseItem?.media_type === "tv" || props.details?.media_type === "tv"
              ? "SERIES"
              : "MOVIE"}
            <Show when={runtime()}> {" · "}{runtime()}m</Show>
          </p>
          <Show when={genres()}>
            <p class="type-caption text-gray-400 mt-2">{genres()}</p>
          </Show>
        </div>
      </div>
    </div>
  );
}
