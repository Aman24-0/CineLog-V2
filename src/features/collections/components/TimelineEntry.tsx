// src/features/collections/components/TimelineEntry.tsx
import { Show } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { CollectionEntry } from "~/shared/types";

/**
 * TimelineEntry — a single row in the TimelineEngine.
 *
 * Extracted from TimelineEngine.tsx to keep that file under the
 * 250-line limit. Renders:
 *   - Numbered node (status-colored: completed/Watching/default)
 *   - Poster (with status badge overlay)
 *   - Title + year + type + entry-type + pinned badge
 *   - User rating (if rated)
 *   - User note (if present)
 *   - "+" missing badge for non-vault titles
 */
export interface TimelineEntryItem {
  entry: CollectionEntry;
  inVault: boolean;
  status: string | null;
  rating: number | null;
}

export interface TimelineEntryProps {
  item: TimelineEntryItem;
  index: number;
  onOpen: () => void;
  titleOf: (e: CollectionEntry) => string;
  yearOf: (e: CollectionEntry) => string;
}

export default function TimelineEntry(props: TimelineEntryProps) {
  return (
    <button
      type="button"
      class={`universe-timeline-item${!props.item.inVault ? " universe-timeline-missing" : ""}${props.item.entry.isPinned ? " universe-timeline-pinned" : ""}`}
      role="listitem"
      onClick={() => props.onOpen()}
      aria-label={`${props.titleOf(props.item.entry)}${props.yearOf(props.item.entry) ? `, ${props.yearOf(props.item.entry)}` : ""} — open details`}
    >
      <div class={`universe-timeline-node${props.item.status === "Completed" ? " universe-timeline-node-completed" : ""}${props.item.status === "Watching" ? " universe-timeline-node-watching" : ""}`}>
        {props.index}
      </div>

      <div class="universe-timeline-poster">
        <Show
          when={props.item.entry.poster_path}
          fallback={
            <div class="universe-timeline-poster-fallback" aria-hidden="true">
              <span class="material-symbols-outlined" style={{"font-size":"20px","color":"var(--text-dim)"}} aria-hidden="true">movie</span>
            </div>
          }
        >
          <img
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            src={tmdbImage(props.item.entry.poster_path, "w185")}
            class="universe-timeline-poster-img"
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
          />
        </Show>
        <Show when={props.item.status === "Completed"}>
          <span class="universe-timeline-status universe-timeline-status-completed" aria-label="Completed">
            <span class="material-symbols-outlined" style={{"font-size":"10px"}} aria-hidden="true">check</span>
          </span>
        </Show>
        <Show when={props.item.status === "Watching"}>
          <span class="universe-timeline-status universe-timeline-status-watching" aria-label="Watching" />
        </Show>
      </div>

      <div class="universe-timeline-info">
        <p class="universe-timeline-title">{props.titleOf(props.item.entry)}</p>
        <div class="universe-timeline-meta-row">
          <span class="universe-timeline-meta">
            {props.yearOf(props.item.entry) ? `${props.yearOf(props.item.entry)} · ` : ""}
            {props.item.entry.media_type === "tv" ? "Series" : "Movie"}
          </span>
          <Show when={props.item.entry.entryType}>
            <span class="universe-timeline-entry-type">{props.item.entry.entryType}</span>
          </Show>
          <Show when={props.item.entry.isPinned}>
            <span class="universe-timeline-pinned-badge" aria-label="Pinned">
              <span class="material-symbols-outlined" style={{"font-size":"12px","color":"var(--p)"}} aria-hidden="true">push_pin</span>
            </span>
          </Show>
        </div>
        <Show when={props.item.rating && props.item.rating > 0}>
          <p class="universe-timeline-user-rating">
            <span style={{"color":"var(--p)"}}>★ Your {props.item.rating}</span>
          </p>
        </Show>
        <Show when={props.item.entry.userNote}>
          <p class="universe-timeline-note">{props.item.entry.userNote}</p>
        </Show>
      </div>

      <Show when={!props.item.inVault}>
        <span class="universe-timeline-missing-badge" aria-label="Not in watchlist">
          <span class="material-symbols-outlined" style={{"font-size":"14px"}} aria-hidden="true">add</span>
        </span>
      </Show>
    </button>
  );
}
