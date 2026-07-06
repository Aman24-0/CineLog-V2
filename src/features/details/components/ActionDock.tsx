// src/features/details/components/ActionDock.tsx
import { Show, createSignal } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

interface ActionDockProps {
  item: WatchlistItem | null;
  hasTrailer: boolean;
  onPlayTrailer: () => void;
  onEdit: () => void;
  onStatusCycle: () => void;
}

/**
 * ActionDock — floating glass bar with primary actions.
 *
 * Layout: [Status] | [Trailer] [Rate] [Edit]
 *
 * - Status: cycles Planned → Watching → Completed (primary, accent when active)
 * - Trailer: shows only if a trailer exists (opens inline expansion)
 * - Rate: quick star rating (opens edit mode focused on rating)
 * - Edit: opens full edit form
 *
 * The dock uses .action-dock CSS for the frosted glass surface. On mobile
 * the buttons stack compactly; on desktop they have more breathing room.
 *
 * Touch targets: all buttons are 44px tall (touch-min) for accessibility.
 */
export default function ActionDock(props: ActionDockProps) {
  const statusLabel = () => {
    const s = props.item?.status;
    if (s === "Plan to Watch" || s === "Planned") return "Planned";
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    return "Add";
  };

  const statusActive = () => {
    const s = props.item?.status;
    return s === "Watching" || s === "Completed";
  };

  return (
    <div class="action-dock">
      {/* Status — primary action */}
      <button
        type="button"
        onClick={() => props.onStatusCycle()}
        class={`action-dock-btn action-dock-btn-primary${statusActive() ? "" : ""}`}
        data-active={statusActive()}
        aria-label={`Watch status: ${statusLabel()}. Click to change.`}
      >
        <span
          class="material-symbols-outlined"
          style={{
            "font-size": "16px",
            "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          }}
          aria-hidden="true"
        >
          {statusLabel() === "Watching" ? "play_circle" : statusLabel() === "Completed" ? "task_alt" : "bookmark"}
        </span>
        <span class="hidden sm:inline">{statusLabel()}</span>
      </button>

      <div class="action-dock-divider" aria-hidden="true" />

      {/* Trailer */}
      <Show when={props.hasTrailer}>
        <button
          type="button"
          onClick={() => props.onPlayTrailer()}
          class="action-dock-btn"
          aria-label="Watch trailer"
        >
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "16px" }}
            aria-hidden="true"
          >
            play_arrow
          </span>
          <span class="hidden sm:inline">Trailer</span>
        </button>
      </Show>

      {/* Rate */}
      <button
        type="button"
        onClick={() => props.onEdit()}
        class="action-dock-btn"
        aria-label="Rate this title"
      >
        <span
          class="material-symbols-outlined"
          style={{
            "font-size": "16px",
            color: props.item?.rating ? "#f5c518" : undefined,
            "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          }}
          aria-hidden="true"
        >
          star
        </span>
        <Show when={props.item?.rating}>
          <span style={{ color: "#f5c518" }}>{props.item!.rating}</span>
        </Show>
        <Show when={!props.item?.rating}>
          <span class="hidden sm:inline">Rate</span>
        </Show>
      </button>

      {/* Edit */}
      <button
        type="button"
        onClick={() => props.onEdit()}
        class="action-dock-btn"
        aria-label="Edit details"
      >
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "16px" }}
          aria-hidden="true"
        >
          edit
        </span>
        <span class="hidden sm:inline">Edit</span>
      </button>
    </div>
  );
}
