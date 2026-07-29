// src/features/collections/components/EntryListRow.tsx
import { Show, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { GlassBadge } from "~/shared/ui/glass";
import type { CollectionEntry } from "~/shared/types";

/**
 * EntryListRow — a single row in the collection detail page's
 * entry list (the new flat list view that replaces the Timeline
 * view for USER collections; universes still use TimelineEngine).
 *
 * Layout
 * ------
 *   [drag?] [poster 40×60] [title + year + meta] [rating] [status] [hover actions]
 *
 * v4 redesign:
 *   - Poster thumbnail is 40×60px (locked aspect ratio 2:3).
 *   - Title is bold, year is muted.
 *   - Rating uses ★ + numeric (e.g. "★ 7") when the user has rated
 *     this title in their vault. Hidden when unrated.
 *   - Status badge uses GlassBadge, color-coded:
 *       Watching → blue
 *       Completed → green
 *       Planned → amber
 *     When the entry isn't in the vault, no badge is shown (the
 *     hover "+" action invites the user to add it).
 *   - TV shows show episode progress (e.g. "3/10 eps") under the
 *     title when the user has a currentSeason / episode tracker.
 *   - Drag handle (☰) only renders when `draggable` is true — i.e.
 *     the user picked "Manual Order" sort. For other sort modes the
 *     row stays in the sort-imposed order.
 *   - Hover actions (user collections only):
 *       • Cycle Status (Planned → Watching → Completed → Planned)
 *       • Cycle Rating (1→2→...→10→clear)
 *       • Remove from collection
 *
 * Universes:
 *   - `draggable` is always false (universes are read-only).
 *   - `showRemove` is false (no remove action).
 *   - Status/rating cycle actions are still available — the user owns
 *     their vault status even when the entry belongs to a curated
 *     universe. Changing status here updates the VAULT, not the
 *     universe's entries.
 */
export interface EntryListRowProps {
  entry: CollectionEntry;
  index: number;
  /** Vault status string ("planned" | "watching" | "completed" |
   *  "Plan to Watch"). Undefined when not in vault. */
  status?: string;
  /** User's 0..10 numeric rating. Undefined when unrated. */
  rating?: number;
  /** For TV shows: current episode progress as a "X/Y eps" string.
   *  Computed by the parent from the vault item's season + episode
   *  + totalEps / seasons fields. */
  episodeProgress?: string;
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
  /** Click on the rating (cycle rating). */
  onCycleRating?: () => void;
  /** Click on the remove button. */
  onRemove?: () => void;
  /** Drag handle activators (from createSortable().dragActivators).
   *  When provided, the handle becomes a real drag trigger; otherwise
   *  it's decorative (non-interactive). */
  dragActivators?: Record<string, (e: Event) => void>;
}

const EntryListRow: Component<EntryListRowProps> = (props) => {
  const title = () => props.entry.title ?? props.entry.name ?? "Untitled";
  const year = () => {
    const d = props.entry.release_date ?? props.entry.first_air_date;
    if (!d) return "";
    return d.slice(0, 4);
  };

  // Status → GlassBadge status + label
  const statusBadge = () => {
    const s = (props.status ?? "").toLowerCase();
    if (!s) return null;
    if (s === "watching") return { status: "watching" as const, label: "Watching" };
    if (s === "completed") return { status: "completed" as const, label: "Completed" };
    if (s === "planned" || s === "plan to watch") return { status: "planned" as const, label: "Planned" };
    return null;
  };

  // Rating display: show as a single integer (1..10) with a star icon.
  // Half-stars aren't supported — vault ratings are 0..10 integers.
  const ratingDisplay = () => {
    if (props.rating == null || props.rating <= 0) return null;
    return Math.round(props.rating);
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
        <button
          type="button"
          class="entry-list-row-drag-handle focus-ring"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          // The parent (ReorderModal) attaches the dnd activators.
          // When `dragActivators` is undefined (e.g. detail page
          // manual order — future work), the handle is decorative.
          {...(props.dragActivators ?? {})}
        >
          <span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span>
        </button>
      </Show>

      {/* Poster thumbnail — 40×60 with 2:3 aspect ratio */}
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
            <span aria-hidden="true">·</span>
            <span>{props.entry.entryType}</span>
          </Show>
          <Show when={props.entry.franchise}>
            <span aria-hidden="true">·</span>
            <span>{props.entry.franchise}</span>
          </Show>
          <Show when={props.episodeProgress}>
            <span aria-hidden="true">·</span>
            <span class="entry-list-row-eps">{props.episodeProgress}</span>
          </Show>
        </div>
      </div>

      {/* Rating */}
      <Show when={ratingDisplay() != null}>
        <button
          type="button"
          class="entry-list-row-rating focus-ring"
          onClick={(e) => {
            e.stopPropagation();
            props.onCycleRating?.();
          }}
          aria-label={`Your rating: ${ratingDisplay()} out of 10. Click to change.`}
          title="Your rating"
        >
          <span class="material-symbols-outlined" aria-hidden="true">star</span>
          <span class="entry-list-row-rating-num">{ratingDisplay()}</span>
        </button>
      </Show>

      {/* Status badge */}
      <Show
        when={statusBadge()}
        fallback={
          <Show when={props.onCycleStatus}>
            <button
              type="button"
              class="entry-list-row-status-add focus-ring"
              onClick={(e) => {
                e.stopPropagation();
                props.onCycleStatus?.();
              }}
              aria-label="Add to watchlist"
              title="Add to watchlist"
            >
              <span class="material-symbols-outlined" aria-hidden="true">add</span>
            </button>
          </Show>
        }
      >
        <button
          type="button"
          class="entry-list-row-status-btn focus-ring"
          onClick={(e) => {
            e.stopPropagation();
            props.onCycleStatus?.();
          }}
          aria-label={`Status: ${statusBadge()!.label}. Click to change.`}
        >
          <GlassBadge status={statusBadge()!.status} size="compact">
            {statusBadge()!.label}
          </GlassBadge>
        </button>
      </Show>

      {/* Hover actions (user collections only) */}
      <div class="entry-list-row-actions">
        <Show when={props.showRemove}>
          <button
            type="button"
            class="entry-list-row-action danger focus-ring"
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
