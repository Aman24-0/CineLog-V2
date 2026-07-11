// src/features/details/components/ActionDock.tsx
import { Show } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

interface ActionDockProps {
  /** TMDB identity — always present */
  item: WatchlistItem | null;
  /**
   * User-owned vault item — null when the title is NOT in the vault.
   * When null, the dock shows "Add to Vault" as the primary action and
   * hides Edit/Rate (those are user-owned actions). When present, the
   * dock shows the status cycle + Folder + Edit/Rate as before.
   */
  vaultItem?: WatchlistItem | null;
  hasTrailer: boolean;
  onPlayTrailer: () => void;
  onEdit: () => void;
  onStatusCycle: () => void;
  /** Called when the user taps "Add to Vault" on a non-vault title */
  onAddToVault: () => void;
  /** Called when the user taps "Folder" — opens the AddToFolder sheet */
  onOpenFolders?: () => void;
  /** Called when the user taps "Remove" — opens the confirm sheet */
  onRemove?: () => void;
  /** Whether an add-to-vault operation is in flight (shows spinner) */
  isAdding?: boolean;
}

/**
 * ActionDock — floating glass bar with primary actions.
 *
 * OWNERSHIP-AWARE LAYOUT:
 *
 *   Vault title (vaultItem present):
 *     [Status cycle] | [Trailer] [Rate] [Edit] [Remove]
 *
 *   Non-vault title (vaultItem null):
 *     [+ Add to Vault] | [Trailer]
 *
 * The Edit, Rate, and Remove buttons are user-owned actions — they only
 * make sense when the title is in the vault. For non-vault titles, the
 * primary CTA is "Add to Vault", which calls onAddToVault (the parent
 * handles the actual Firestore write via the addToVault service).
 *
 * The dock uses .action-dock CSS for the frosted glass surface. On mobile
 * the buttons stack compactly; on desktop they have more breathing room.
 *
 * Touch targets: all buttons are 44px tall (touch-min) for accessibility.
 */
export default function ActionDock(props: ActionDockProps) {
  const inVault = () => !!props.vaultItem;

  const statusLabel = () => {
    const s = props.vaultItem?.status;
    if (s === "Plan to Watch" || s === "Planned") return "Planned";
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    return "Add";
  };

  const statusActive = () => {
    const s = props.vaultItem?.status;
    return s === "Watching" || s === "Completed";
  };

  const statusIcon = () => {
    const label = statusLabel();
    if (label === "Watching") return "play_circle";
    if (label === "Completed") return "task_alt";
    return "bookmark";
  };

  return (
    <div class="action-dock">
      <Show
        when={inVault()}
        fallback={
          /* Non-vault title: primary CTA is "Add to Vault" */
          <button
            type="button"
            onClick={() => props.onAddToVault()}
            disabled={props.isAdding}
            class="action-dock-btn action-dock-btn-primary"
            data-active="true"
            aria-label="Add to your watchlist"
          >
            <span
              class="material-symbols-outlined"
              style={{
                "font-size": "16px",
                "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
              }}
              aria-hidden="true"
            >
              {props.isAdding ? "progress_activity" : "add"}
            </span>
            <span class="hidden sm:inline">{props.isAdding ? "Adding…" : "Add to Watchlist"}</span>
          </button>
        }
      >
        {/* Vault title: status cycle (primary) */}
        <button
          type="button"
          onClick={() => props.onStatusCycle()}
          class="action-dock-btn action-dock-btn-primary"
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
            {statusIcon()}
          </span>
          <span class="hidden sm:inline">{statusLabel()}</span>
        </button>
      </Show>

      <Show when={inVault() && props.hasTrailer}>
        <div class="action-dock-divider" aria-hidden="true" />
      </Show>

      {/* Trailer — always available (TMDB data, not user-owned) */}
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

      {/* Folder + Rate + Edit — user-owned actions, only when in vault */}
      <Show when={inVault()}>
        <div class="action-dock-divider" aria-hidden="true" />

        {/* Folder — opens the AddToFolder sheet for managing user collections */}
        <Show when={props.onOpenFolders}>
          <button
            type="button"
            onClick={() => props.onOpenFolders?.()}
            class="action-dock-btn"
            aria-label="Add to folder"
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "16px" }}
              aria-hidden="true"
            >
              folder
            </span>
            <span class="hidden sm:inline">Folder</span>
          </button>
        </Show>

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
              color: props.vaultItem?.rating ? "#f5c518" : undefined,
              "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
            }}
            aria-hidden="true"
          >
            star
          </span>
          <Show when={props.vaultItem?.rating}>
            <span style={{ color: "#f5c518" }}>{props.vaultItem!.rating}</span>
          </Show>
          <Show when={!props.vaultItem?.rating}>
            <span class="hidden sm:inline">Rate</span>
          </Show>
        </button>

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

        {/* Remove — opens the confirm sheet. Destructive (red) styling. */}
        <Show when={props.onRemove}>
          <button
            type="button"
            onClick={() => props.onRemove?.()}
            class="action-dock-btn action-dock-btn-danger"
            aria-label="Remove from watchlist"
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "16px" }}
              aria-hidden="true"
            >
              delete
            </span>
            <span class="hidden sm:inline">Remove</span>
          </button>
        </Show>
      </Show>
    </div>
  );
}
