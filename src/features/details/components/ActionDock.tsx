// src/features/details/components/ActionDock.tsx
import { Show, For } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import { hapticHeavy } from "~/shared/utils/haptic";

interface ActionDockProps {
  /** TMDB identity — always present */
  item: WatchlistItem | null;
  /**
   * User-owned vault item — null when the title is NOT in the vault.
   * When null, the dock shows "Add to Vault" as the primary action and
   * hides Edit/Rate (those are user-owned actions). When present, the
   * dock shows the status row + action buttons.
   */
  vaultItem?: WatchlistItem | null;
  /**
   * Whether a trailer is available. NO LONGER USED by the dock itself —
   * kept in the interface for backwards compat with callers (DetailsActions)
   * that still pass it. The actual "Watch Trailer" CTA now lives on the
   * CinematicHero backdrop (Netflix-style overlay button).
   */
  hasTrailer?: boolean;
  /**
   * Open the trailer player. NO LONGER USED by the dock itself — same
   * deprecation reason as `hasTrailer`. The hero's overlay button calls
   * `onPlayTrailer` directly via the DetailsHero wrapper.
   */
  onPlayTrailer?: () => void;
  onEdit: () => void;
  /** Legacy cycle handler (Planned → Watching → Completed → Planned). Kept for compat. */
  onStatusCycle: () => void;
  /** Set status directly to a specific value (Planned / Watching / Completed / Dropped). */
  onSetStatus?: (status: WatchlistItem["status"]) => void;
  /** Called when the user taps "Add to Vault" on a non-vault title */
  onAddToVault: () => void;
  /** Called when the user taps "Folder" — opens the AddToFolder sheet */
  onOpenFolders?: () => void;
  /** Called when the user taps "Remove" — opens the confirm sheet */
  onRemove?: () => void;
  /** Called when the user taps "Share" — opens the ShareSheet */
  onShare?: () => void;
  /** Whether an add-to-vault operation is in flight (shows spinner) */
  isAdding?: boolean;
}

/**
 * ActionDock — floating glass bar with primary actions.
 *
 * REDESIGNED v2 layout (per user request):
 *
 *   Vault title (vaultItem present), TWO lines:
 *     Line 1 — status buttons: [Planned] [Watching] [Completed] [Dropped]
 *       Each button sets the status directly. The active status is
 *       highlighted with the accent color.
 *     Line 2 — action buttons: [Folder] [Share] [Edit] [Delete]
 *       (Rating button removed — it opens the same edit sheet as Edit,
 *        and the rating is already shown in the rating + activity panel.)
 *       (Trailer button removed in v2.5 — the hero backdrop now owns
 *        the "Watch Trailer" overlay CTA. Centralizing the trailer
 *        entry point on the artwork matches the Netflix / Apple TV+
 *        mental model: trailer = play the preview, which belongs on
 *        the artwork, not in the action toolbar.)
 *
 *   Non-vault title (vaultItem null):
 *     [+ Add to Vault] | [Share]
 *
 * The dock uses .action-dock CSS for the frosted glass surface. On mobile
 * the buttons stack compactly; on desktop they have more breathing room.
 *
 * Touch targets: all buttons are 44px tall (touch-min) for accessibility.
 */
const STATUS_BUTTONS: ReadonlyArray<{
  label: string;
  value: WatchlistItem["status"];
  icon: string;
}> = [
  { label: "Planned", value: "Planned", icon: "bookmark" },
  { label: "Watching", value: "Watching", icon: "play_circle" },
  { label: "Completed", value: "Completed", icon: "task_alt" },
  { label: "Dropped", value: "Dropped", icon: "block" }
];

export default function ActionDock(props: ActionDockProps) {
  const inVault = () => !!props.vaultItem;

  /** Normalize vault status for comparison. "Plan to Watch" maps to "Planned". */
  const currentStatus = (): WatchlistItem["status"] | null => {
    const s = props.vaultItem?.status;
    if (!s) return null;
    if (s === "Plan to Watch") return "Planned";
    return s;
  };

  const handleStatusClick = (status: WatchlistItem["status"]) => {
    if (props.onSetStatus) {
      props.onSetStatus(status);
    } else {
      // Fallback to cycle if direct setter is not provided.
      props.onStatusCycle();
    }
  };

  return (
    <div class="action-dock action-dock-v2">
      <Show
        when={inVault()}
        fallback={
          /* Non-vault title: primary CTA is "Add to Vault" + Share.
              Trailer was removed from the dock — the hero's backdrop
              now shows a Netflix-style "Watch Trailer" overlay button
              (see CinematicHero.tsx). Centralizing the trailer entry
              point on the hero avoids duplication and matches the
              user's mental model: trailer = play the preview, which
              belongs on the artwork, not in the action toolbar. */
          <div class="action-dock-row">
            {/* Add to Watchlist button — icon-only on mobile, text on sm+.
                aria-labelledby points to the visible text span which provides
                the accessible name on both mobile (hidden span still read by
                AT via aria-labelledby) and desktop (visible text = name). */}
            <button
              type="button"
              onClick={() => props.onAddToVault()}
              disabled={props.isAdding}
              class="action-dock-btn action-dock-btn-primary"
              data-active="true"
              aria-labelledby="action-add-label"
            >
              <span
                class="material-symbols-outlined"
                style={{
                  "font-size": "16px",
                  "font-variation-settings":
                    "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                }}
                aria-hidden="true"
              >
                {props.isAdding ? "progress_activity" : "add"}
              </span>
              <span id="action-add-label" class="hidden sm:inline">
                {props.isAdding ? "Adding…" : "Add to Watchlist"}
              </span>
            </button>
            <Show when={props.onShare}>
              <button
                type="button"
                onClick={() => props.onShare?.()}
                class="action-dock-btn"
                aria-labelledby="action-share-label-nonvault"
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "16px" }}
                  aria-hidden="true"
                >
                  share
                </span>
                <span id="action-share-label-nonvault" class="hidden sm:inline">
                  Share
                </span>
              </button>
            </Show>
          </div>
        }
      >
        {/* LINE 1 — status buttons */}
        <div
          class="action-dock-row action-dock-status-row"
          role="group"
          aria-label="Set watch status"
        >
          <For each={STATUS_BUTTONS}>
            {(btn) => (
              <button
                type="button"
                onClick={() => handleStatusClick(btn.value)}
                class="action-dock-btn action-dock-status-btn"
                data-active={currentStatus() === btn.value}
                aria-pressed={currentStatus() === btn.value}
              >
                <span
                  class="material-symbols-outlined"
                  style={{
                    "font-size": "15px",
                    "font-variation-settings":
                      "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                  }}
                  aria-hidden="true"
                >
                  {btn.icon}
                </span>
                <span>{btn.label}</span>
              </button>
            )}
          </For>
        </div>

        {/* LINE 2 — action buttons.
            Trailer button removed — the hero backdrop now owns the
            "Watch Trailer" overlay CTA (Netflix-style). */}
        <div class="action-dock-row action-dock-actions-row">
          <Show when={props.onOpenFolders}>
            <button
              type="button"
              onClick={() => props.onOpenFolders?.()}
              class="action-dock-btn"
              aria-labelledby="action-folder-label"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px" }}
                aria-hidden="true"
              >
                folder
              </span>
              <span id="action-folder-label" class="hidden sm:inline">
                Folder
              </span>
            </button>
          </Show>

          <Show when={props.onShare}>
            <button
              type="button"
              onClick={() => props.onShare?.()}
              class="action-dock-btn"
              aria-labelledby="action-share-label"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px" }}
                aria-hidden="true"
              >
                share
              </span>
              <span id="action-share-label" class="hidden sm:inline">
                Share
              </span>
            </button>
          </Show>

          <button
            type="button"
            onClick={() => props.onEdit()}
            class="action-dock-btn"
            aria-labelledby="action-edit-label"
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "16px" }}
              aria-hidden="true"
            >
              edit
            </span>
            <span id="action-edit-label" class="hidden sm:inline">
              Edit
            </span>
          </button>

          <Show when={props.onRemove}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                hapticHeavy();
                props.onRemove?.();
              }}
              class="action-dock-btn action-dock-btn-danger"
              aria-labelledby="action-delete-label"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px" }}
                aria-hidden="true"
              >
                delete
              </span>
              <span id="action-delete-label" class="hidden sm:inline">
                Delete
              </span>
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
