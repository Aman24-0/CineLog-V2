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
 *
 * v2.1: Batch select mode — when selectMode is true, a checkbox
 * appears on the left and clicking toggles selection instead of
 * opening the entry. The outer element is a <div role="button">
 * (not a <button>) so it can contain the checkbox without nesting
 * interactive elements.
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
  /** When true, show the entry's `incidentYear` (in-universe year of
   *  incident) on the left instead of the 1-based index. Active when
   *  the user has selected the Storyline sort. */
  showIncidentYear?: boolean;
  onOpen: () => void;
  titleOf: (e: CollectionEntry) => string;
  yearOf: (e: CollectionEntry) => string;
  // ── Batch Select Mode (v2.1) ──
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Add-to-watchlist handler. When provided AND the entry isn't in
   *  the user's vault, the "+" missing badge becomes a clickable
   *  button that calls this handler. Lets users browsing a curated
   *  universe one-tap add a title they haven't watched yet. */
  onAddToWatchlist?: () => void;
}

export default function TimelineEntry(props: TimelineEntryProps) {
  const handleClick = () => {
    if (props.selectMode) {
      props.onToggleSelect?.();
    } else {
      props.onOpen();
    }
  };

  // The label shown inside the left node. For storyline sort this is
  // the entry's incident_year (e.g. 1943 for Captain America: The First
  // Avenger). For all other sorts it's the 1-based position in the list.
  // Falls back to the index when incident_year is missing.
  const nodeLabel = () => {
    if (props.showIncidentYear && props.item.entry.incidentYear !== undefined) {
      return String(props.item.entry.incidentYear);
    }
    return String(props.index);
  };

  return (
    <div
      class={`universe-timeline-item${!props.item.inVault ? " universe-timeline-missing" : ""}${props.item.entry.isPinned ? " universe-timeline-pinned" : ""}${props.selected ? " universe-timeline-selected" : ""}${props.selectMode ? " universe-timeline-select-mode" : ""}`}
      role={props.selectMode ? "listitem" : "button"}
      tabindex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`${props.titleOf(props.item.entry)}${props.yearOf(props.item.entry) ? `, ${props.yearOf(props.item.entry)}` : ""}${props.selectMode ? ` — ${props.selected ? "deselect" : "select"}` : " — open details"}`}
      aria-pressed={props.selectMode ? !!props.selected : undefined}
    >
      {/* Select-mode checkbox (left side, replaces the numbered node) */}
      <Show when={props.selectMode}>
        <div class={`universe-timeline-checkbox${props.selected ? " universe-timeline-checkbox-on" : ""}`} aria-hidden="true">
          <Show when={props.selected}>
            <span class="material-symbols-outlined" style={{"font-size":"14px"}} aria-hidden="true">check</span>
          </Show>
        </div>
      </Show>

      {/* Numbered node (hidden in select mode).
          For storyline sort we show the entry's incident_year (the
          in-universe year the movie takes place) instead of a 1-based
          index. For other sorts we show the index. The node may need
          to be a little wider for 4-digit years, so we add a modifier
          class for styling. */}
      <Show when={!props.selectMode}>
        <div
          class={`universe-timeline-node${props.item.status === "Completed" ? " universe-timeline-node-completed" : ""}${props.item.status === "Watching" ? " universe-timeline-node-watching" : ""}${props.showIncidentYear ? " universe-timeline-node-year" : ""}`}
        >
          {nodeLabel()}
        </div>
      </Show>

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

      <Show when={!props.item.inVault && !props.selectMode}>
        <Show
          when={props.onAddToWatchlist}
          fallback={
            // No handler — render as a static informational badge.
            <span class="universe-timeline-missing-badge" aria-label="Not in watchlist">
              <span class="material-symbols-outlined" style={{"font-size":"14px"}} aria-hidden="true">add</span>
            </span>
          }
        >
          <button
            type="button"
            class="universe-timeline-missing-badge universe-timeline-missing-btn focus-ring"
            onClick={(e) => {
              e.stopPropagation();
              props.onAddToWatchlist?.();
            }}
            aria-label={`Add ${props.titleOf(props.item.entry)} to your watchlist`}
            title="Add to watchlist"
          >
            <span class="material-symbols-outlined" style={{"font-size":"14px"}} aria-hidden="true">add</span>
          </button>
        </Show>
      </Show>
    </div>
  );
}
