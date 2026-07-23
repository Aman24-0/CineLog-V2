// src/features/discover/components/DiscoverRail.tsx
// Dulo.tv-inspired numbered rail — large rank numbers behind each poster.
import { For, Show, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBTitle } from "~/shared/types";
import DiscoverEmptyState from "./DiscoverEmptyState";

interface DiscoverRailProps {
  titles: TMDBTitle[];
  onSelect: (title: TMDBTitle) => void;
  emptyText?: string;
  emptyIcon?: string;
  emptyHint?: string;
  onRetry?: () => void;
  /** Show large ranking numbers behind posters (Dulo.tv style). Default: false */
  numbered?: boolean;
}

const DiscoverRail: Component<DiscoverRailProps> = (props) => {
  return (
    <Show
      when={props.titles.length > 0}
      fallback={
        <DiscoverEmptyState
          icon={props.emptyIcon ?? "movie"}
          message={props.emptyText ?? "No titles available."}
          hint={props.emptyHint}
          onRetry={props.onRetry}
        />
      }
    >
      <div class={props.numbered ? "dulo-rail dulo-rail-numbered" : "dulo-rail"} role="list">
        <For each={props.titles.slice(0, 20)}>
          {(title, i) => (
            <button
              type="button"
              class="dulo-rail-card focus-ring"
              onClick={() => props.onSelect(title)}
              role="listitem"
              aria-label={`${title.title || title.name || "Untitled"}${title.release_date || title.first_air_date ? `, ${(title.release_date || title.first_air_date || "").split("-")[0]}` : ""}`}
            >
              {/* Numbered rank backdrop */}
              <Show when={props.numbered}>
                <span class="dulo-rail-rank" aria-hidden="true">{i() + 1}</span>
              </Show>

              <div class="dulo-rail-poster">
                <Show
                  when={title.poster_path}
                  fallback={
                    <div class="dulo-rail-poster-fallback">
                      <span class="material-symbols-outlined" style={{ "font-size": "24px", color: "var(--text-dim)" }} aria-hidden="true">
                        movie
                      </span>
                    </div>
                  }
                >
                  <img
                    src={tmdbImage(title.poster_path, "w185")}
                    class="dulo-rail-poster-img"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                </Show>
              </div>

              <p class="dulo-rail-title">{title.title || title.name || "Untitled"}</p>
              <p class="dulo-rail-meta">
                {(title.release_date || title.first_air_date || "").split("-")[0] || ""}
              </p>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
};

export default DiscoverRail;
