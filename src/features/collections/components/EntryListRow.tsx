// src/features/collections/components/EntryListRow.tsx
import { Show, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { CollectionEntry } from "~/shared/types";

/**
 * EntryListRow — a single row in the collection detail page's
 * entry list (the flat list view used for USER collections; the
 * universe detail page uses TimelineEngine instead).
 *
 * Layout (clean, stable, no surprises):
 *   [drag?] [poster 40×60] [title + year + meta]   [rating]   [Remove]
 *
 * v5 redesign (per spec "Entry List Row Final Fixes"):
 *   - Poster thumbnail is 40×60px (locked aspect ratio 2:3).
 *   - Title is bold, year is muted. Title truncates with ellipsis.
 *   - Rating uses ★ + numeric (e.g. "★ 7") when the user has rated
 *     this title in their vault. Hidden when unrated. The rating is
 *     a non-interactive label (no cycle-on-click — that was removed
 *     to keep the row clean; rating changes happen on the title
 *     detail modal).
 *   - NO status badge, NO "+" add-to-watchlist icon, NO hidden
 *     hover overlays. These were the source of accidental clicks
 *     and inconsistent row layout.
 *   - The "Remove from Collection" button is ALWAYS visible (no
 *     hover-reveal), with adequate padding (32×32px hit area) and
 *     clear contrast (hairline border + danger color on hover).
 *     Calls `onRemove` when clicked. Stops propagation so the row
 *     click (which opens the title detail modal) doesn't fire.
 *   - Drag handle (☰) only renders when `draggable` is true — i.e.
 *     the user picked "Manual Order" sort. For other sort modes the
 *     row stays in the sort-imposed order.
 *
 * Universes:
 *   - This component is only used for user collections. Universes
 *     render TimelineEngine + TimelineEntry (separate component).
 *   - `showRemove` controls whether the Remove button renders. For
 *     user collections it's always true. (Universes don't use this
 *     component at all.)
 *
 * Removed (per spec — do NOT reintroduce):
 *   - Status badge (Watching/Completed/Planned) — removed.
 *   - "+" add-to-watchlist icon for non-vault entries — removed.
 *   - onCycleStatus / onCycleRating click handlers — removed.
 *   - Hover-only action reveal — removed (Remove is always visible).
 *   - The `status`, `onCycleStatus`, `onCycleRating` props are kept
 *     in the interface as optional no-ops for backwards compatibility
 *     with call sites (they're no longer rendered), but parent code
 *     can stop passing them safely.
 */
export interface EntryListRowProps {
  entry: CollectionEntry;
  index: number;
  /** Vault status string. ACCEPTED FOR BACKWARDS COMPATIBILITY but
   *  NOT rendered — the status badge was removed per spec. */
  status?: string;
  /** User's 0..10 numeric rating. Rendered as "★ N". */
  rating?: number;
  /** For TV shows: current episode progress as a "X/Y eps" string.
   *  Computed by the parent from the vault item's season + episode
   *  + totalEps / seasons fields. */
  episodeProgress?: string;
  /** Show the drag handle (manual sort mode + user collection). */
  draggable?: boolean;
  /** Show the "Remove from collection" button. True for user collections. */
  showRemove?: boolean;
  /** True while this row is being dragged (visual feedback). */
  isDragging?: boolean;
  /** Click on the row body (opens the title detail modal). */
  onOpen?: () => void;
  /** Click on the remove button. */
  onRemove?: () => void;
  /** Drag handle activators (from createSortable().dragActivators).
   *  When provided, the handle becomes a real drag trigger; otherwise
   *  it's decorative (non-interactive). */
  dragActivators?: Record<string, (e: Event) => void>;

  // ── Deprecated props (kept for call-site compatibility, NOT rendered) ──
  /** @deprecated Status badge removed in v5. No-op. */
  onCycleStatus?: () => void;
  /** @deprecated Rating cycle removed in v5. No-op. */
  onCycleRating?: () => void;
}

const EntryListRow: Component<EntryListRowProps> = (props) => {
  const title = () => props.entry.title ?? props.entry.name ?? "Untitled";
  const year = () => {
    const d = props.entry.release_date ?? props.entry.first_air_date;
    if (!d) return "";
    return d.slice(0, 4);
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
          // When `dragActivators` is undefined the handle is decorative.
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
        <p class="entry-list-row-title" title={`${title()}${year() ? ` (${year()})` : ""}`}>
          {title()}
        </p>
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

      {/* Rating — display only (no cycle-on-click).
          Hidden when the user hasn't rated this title. */}
      <Show when={ratingDisplay() != null}>
        <span
          class="entry-list-row-rating"
          aria-label={`Your rating: ${ratingDisplay()} out of 10`}
          title="Your rating"
        >
          <span class="material-symbols-outlined" aria-hidden="true">star</span>
          <span class="entry-list-row-rating-num">{ratingDisplay()}</span>
        </span>
      </Show>

      {/* Remove from collection — ALWAYS visible (no hover-reveal),
          clear hit area (32×32), danger color on hover. Stops
          propagation so the row click (open title detail) doesn't
          fire when the user is just trying to remove the entry. */}
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
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        </button>
      </Show>
    </div>
  );
};

export default EntryListRow;
