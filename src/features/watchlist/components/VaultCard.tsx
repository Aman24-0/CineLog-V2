// src/features/watchlist/components/VaultCard.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";
import type { WatchlistItem } from "~/shared/types";

interface VaultCardProps {
  item: WatchlistItem;
  date: Date | null;
  onOpenMovie: (id: string) => void;
}

export default function VaultCard(props: VaultCardProps) {
  const day = () => (props.date ? props.date.getDate() : "—");

  return (
    <div
      class="relative flex items-center group cursor-pointer pl-10 pr-2 animate-timeline-in"
      onClick={() => props.onOpenMovie(props.item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onOpenMovie(props.item.id);
      }}
      role="article"
      tabindex={0}
      aria-label={`${props.item.title || props.item.name}, ${props.date ? props.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "date unknown"}`}
    >
      <div
        class="absolute left-[1.25rem] -translate-x-1/2 w-8 h-8 rounded-full bg-[#08090b] border-2 flex items-center justify-center shadow-lg z-10 transition-transform duration-200"
        style="border-color: var(--p)"
        aria-hidden="true"
      >
        <span style="color: #fff; font-size: 11px; font-weight: 800; font-family: 'Outfit', sans-serif">{day()}</span>
      </div>
      <div class="upcoming-card w-full p-3 rounded-[1.5rem] flex gap-4">
        <Show
          when={props.item.poster_path}
          fallback={
            <div class="w-14 h-20 sm:w-16 sm:h-24 bg-[#171921] rounded-xl flex items-center justify-center shrink-0 border border-white/5" aria-hidden="true">
              <Icon name="movie" class="text-gray-600" />
            </div>
          }
        >
          <div class="w-14 h-20 sm:w-16 sm:h-24 rounded-xl overflow-hidden relative shrink-0" style="background: #141414; box-shadow: var(--shadow-raised)">
            <div class="poster-loading" aria-hidden="true" />
            <img
              src={`https://image.tmdb.org/t/p/w200${props.item.poster_path}`}
              class="poster-img absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onLoad={(e) => {
                e.currentTarget.classList.add("img-loaded");
                e.currentTarget.previousElementSibling?.classList.add("hidden");
              }}
              alt=""
              aria-hidden="true"
            />
          </div>
        </Show>
        <div class="flex-1 flex flex-col justify-center py-1 min-w-0 pr-2">
          <p class="type-metadata font-bold text-gray-100 group-hover:text-white truncate">{props.item.title || props.item.name}</p>
          <div class="flex items-center gap-2 mt-1.5 flex-wrap">
            <span class="type-caption bg-white/10 text-gray-300 px-2 py-0.5 rounded border border-white/5 shrink-0">{props.item.media_type === "tv" ? "Series" : "Movie"}</span>
            <Show when={props.item.status}>
              <span class="type-caption px-2 py-0.5 rounded shrink-0" style="color: var(--p); background: var(--p-dim); border: 1px solid color-mix(in srgb, var(--p) 20%, transparent)">
                {props.item.status === "Plan to Watch" ? "Planned" : props.item.status}
              </span>
            </Show>
          </div>
          <Show when={props.item.rating || props.item.imdbRating}>
            <div class="flex items-center gap-3 mt-2.5">
              <Show when={props.item.rating}>
                <span class="type-metadata font-black flex items-center gap-1" style="color: var(--p)">
                  <Icon name="star" fill class="text-[12px]" aria-hidden="true" /> {props.item.rating}/10
                </span>
              </Show>
            </div>
          </Show>
        </div>
        <div class="hidden sm:flex self-center pr-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200" aria-hidden="true">
          <Icon name="chevron_right" class="text-2xl" style="color: var(--p)" />
        </div>
      </div>
    </div>
  );
}
