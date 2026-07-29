// src/features/collections/components/EntryListRow.tsx
import { Show, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { CollectionEntry } from "~/shared/types";

/**
 * EntryListRow — a single row in the user-collection detail page's
 * entry list (the manual-order list view, used when the user picks
 * "Manual Order" sort).
 *
 * Layout
 * ------
 *   [drag handle] [poster] [title + meta] [rating] [status] [actions]
 *
 * Drag handle is only rendered when `draggable` is true. The actual
 * drag is wired up by the parent (TimelineEngine / EntryList) which
 * wraps rows in <DragDropProvider> + <DragDropSortable> from
 * @thisbeyond/solid-dnd. This component just renders the visual
 * handle icon — the parent attaches the drag listeners.
 *
 * Hover actions
 * -------------
 *   - Change Status (cycle through Planned → Watching → Completed → On Hold → Dropped → Planned)
 *   - Change Rating (opens a small star picker — out of scope here, parent handles)
 *   - Remove from Collection (user collections only — hidden for universes)
 *
 * For universes, `draggable` is always false and `showRemove` is false.
 */
export interface EntryListRowProps {
  entry: CollectionEntry;
  index: number;
  /** Status string from the user's vault ("planned" | "watching" |
   *  "completed" | "on_hold" | "dropped"). Undefined when not in vault. */
  status?: string;
  /** User's 0..10 numeric rating. Undefined when unrated. */
  rating?: number;
  /** Show the drag handle (manual sort mode + user collection). */
  draggable?: boolean;
  /** Show the "Remove from collection" action. True for user collections. */
  showRemove?: boolean;
  /** True while this row is being dragged (visual feedback). */
  isDragging?: boolean;
  /** Click on the row body (opens the title detail modal). */
  onOpen?: () => void;
  /** Click on the status badge (cycle status). */
  onCycleStatus?: () => void;
  /** Click on the rating (open the rating picker). */
  onCycleRating?: () => void;
  /** Click on the remove button. */
  onRemove?: () => void;
}

const EntryListRow: Component<EntryListRowProps> = (props) => {
  const title = () => props.entry.title ?? props.entry.name ?? "Untitled";
  const year = () => {
    const d = props.entry.release_date ?? props.entry.first_air_date;
    if (!d) return "";
    return d.slice(0, 4);
  };

  const statusClass = () => {
    const s = (props.status ?? "planned").toLowerCase();
    if (s === "watching") return "watching";
    if (s === "completed") return "completed";
    if (s === "planned") return "planned";
    if (s === "on_hold") return "on_hold";
    if (s === "dropped") return "dropped";
    return "planned";
  };

  const statusLabel = () => {
    const s = (props.status ?? "").toLowerCase();
    if (!s) return "Add";
    if (s === "on_hold") return "On Hold";
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const ratingDisplay = () => {
    if (props.rating == null) return null;
    // 0..10 → display as 1..5 stars (divide by 2, round to 1 decimal).
    const stars = (props.rating / 2).toFixed(1);
    return stars;
  };

  return (
    <div
      class={`entry-list-row${props.isDragging ? " is-dragging" : ""}`}
      role="button"
      tabindex={0}
      aria-label={`${title()} ${year()}`}
      onClick={() => props.onOpen?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpen?.();
        }
      }}
    >
      <Show when={props.draggable}>
        <div
          class="entry-list-row-drag-handle"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          // The actual drag is wired by the parent DragDropSortable wrapper.
          // We just render the handle here.
          data-dnd-handle
        >
          <span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span>
        </div>
      </Show>

      <Show
        when={props.entry.poster_path}
        fallback={
          <div class="entry-list-row-poster-fallback" aria-hidden="true">
            <span class="material-symbols-outlined" aria-hidden="true">movie</span>
          </div>
        }
      >
        <img
          src={tmdbImage(props.entry.poster_path!, "w92")}
          class="entry-list-row-poster"
          loading="lazy"
          decoding="async"
          alt=""
          aria-hidden="true"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      </Show>

      <div class="entry-list-row-main">
        <p class="entry-list-row-title">{title()}</p>
        <div class="entry-list-row-meta">
          <Show when={year()}>
            <span class="entry-list-row-year">{year()}</span>
          </Show>
          <Show when={props.entry.entryType}>
            <span>·</span>
            <span>{props.entry.entryType}</span>
          </Show>
          <Show when={props.entry.franchise}>
            <span>·</span>
            <span>{props.entry.franchise}</span>
          </Show>
        </div>
      </div>

      <Show when={ratingDisplay()}>
        <button
          type="button"
          class="entry-list-row-rating"
          onClick={(e) => {
            e.stopPropagation();
            props.onCycleRating?.();
          }}
          aria-label="Change rating"
          title="Your rating"
        >
          <span class="material-symbols-outlined" aria-hidden="true">star</span>
          {ratingDisplay()}
        </button>
      </Show>

      <button
        type="button"
        class={`entry-list-row-status ${statusClass()}`}
        onClick={(e) => {
          e.stopPropagation();
          props.onCycleStatus?.();
        }}
        aria-label="Change status"
      >
        {statusLabel()}
      </button>

      <div class="entry-list-row-actions">
        <Show when={props.showRemove}>
          <button
            type="button"
            class="entry-list-row-action danger"
            onClick={(e) => {
              e.stopPropagation();
              props.onRemove?.();
            }}
            aria-label="Remove from collection"
            title="Remove from collection"
          >
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </Show>
      </div>
    </div>
  );
};

export default EntryListRow;
