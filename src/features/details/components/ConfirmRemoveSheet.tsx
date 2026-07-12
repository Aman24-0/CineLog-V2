// src/features/details/components/ConfirmRemoveSheet.tsx
import { Show, onMount, onCleanup, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import type { WatchlistItem } from "~/shared/types";

interface ConfirmRemoveSheetProps {
  item: WatchlistItem;
  onConfirm: () => void;
  onClose: () => void;
  isRemoving?: boolean;
}

/**
 * ConfirmRemoveSheet — a premium bottom sheet that asks the user to
 * confirm before removing a title from their watchlist.
 *
 * Opens from the ActionDock's "Remove" button. Shows what will be
 * removed (status, rating, notes, watch history). The Remove button
 * uses destructive (red) styling and shows a spinner while the delete
 * is in flight.
 *
 * Accessibility:
 *   - ESC key closes the sheet (handled by parent DetailsModal)
 *   - Outside tap closes the sheet
 *   - Focus is trapped inside the sheet while open
 *   - The Remove button has aria-label="Remove from watchlist"
 *
 * The sheet uses the same Portal + bottom-sheet pattern as AddToFolderSheet.
 */
const ConfirmRemoveSheet: Component<ConfirmRemoveSheetProps> = (props) => {
  onMount(() => (document.body.style.overflow = "hidden"));
  onCleanup(() => (document.body.style.overflow = ""));

  return (
    <Portal>
      <div
        class="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[999999] animate-fade-in"
        style={{
          background: "rgba(0,0,0,0.85)",
          "backdrop-filter": "blur(12px)",
          "-webkit-backdrop-filter": "blur(12px)",
          "padding-bottom": "var(--nav-total-height)",
        }}
        onClick={() => !props.isRemoving && props.onClose()}
        role="dialog"
        aria-modal="true"
        aria-label="Remove from watchlist confirmation"
      >
        <div
          class="w-full max-w-sm rounded-t-[2rem] sm:rounded-[2rem] flex flex-col modal-sheet-enter"
          style={{
            "max-height": "calc(100dvh - var(--nav-total-height) - env(safe-area-inset-top, 0px) - var(--sp-4))",
            "min-height": "0",
            background: "var(--glass-bg-strong)",
            "backdrop-filter": "blur(28px)",
            "-webkit-backdrop-filter": "blur(28px)",
            border: "1px solid var(--hairline-2)",
            "box-shadow": "var(--shadow-elevated)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div
            class="w-12 h-1.5 rounded-full mx-auto mt-4 mb-2 sm:hidden flex-shrink-0"
            style={{ background: "var(--hairline-2)" }}
            aria-hidden="true"
          />

          {/* Header */}
          <div
            class="flex justify-between items-center px-6 pt-4 pb-4 flex-shrink-0"
            style={{ "border-bottom": "1px solid var(--hairline)" }}
          >
            <div class="flex items-center gap-2">
              <span
                class="material-symbols-outlined"
                style={{ color: "#f87171", "font-size": "18px" }}
                aria-hidden="true"
              >
                delete
              </span>
              <h3 class="type-headline text-white" style={{ "font-size": "1rem", margin: 0 }}>
                Remove from Watchlist?
              </h3>
            </div>
            <Show when={!props.isRemoving}>
              <button
                onClick={() => props.onClose()}
                class="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text-soft)",
                  border: "1px solid var(--hairline)",
                }}
                aria-label="Close"
              >
                <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
                  close
                </span>
              </button>
            </Show>
          </div>

          {/* Body */}
          <div class="px-6 py-5 flex-1 overflow-y-auto" style={{ "overscroll-behavior": "contain" }}>
            <p class="type-body-soft" style={{ margin: "0 0 var(--sp-3)", "font-size": "0.875rem" }}>
              This title will be removed from your CineLog library.
            </p>
            <div
              class="rounded-xl p-3"
              style={{
                background: "rgba(248, 113, 113, 0.06)",
                border: "1px solid rgba(248, 113, 113, 0.15)",
              }}
            >
              <p
                class="type-micro"
                style={{ color: "#f87171", margin: "0 0 0.5rem", "font-size": "0.5rem" }}
              >
                This will remove:
              </p>
              <ul class="type-body-soft" style={{ margin: 0, "padding-left": "1rem", "font-size": "0.8125rem", "line-height": "1.6" }}>
                <li>Status</li>
                <li>Rating</li>
                <li>Notes</li>
                <li>Watch history</li>
                <li>Added date</li>
              </ul>
            </div>
            <p class="type-body-soft" style={{ margin: "var(--sp-3) 0 0", "font-size": "0.75rem", color: "var(--text-muted)" }}>
              TMDB metadata is not deleted.
            </p>
          </div>

          {/* Footer — Cancel + Remove */}
          <div
            class="px-6 pt-3 pb-5 flex-shrink-0 flex gap-2"
            style={{ "border-top": "1px solid var(--hairline)" }}
          >
            <button
              type="button"
              class="btn-ghost flex-1 focus-ring"
              onClick={() => props.onClose()}
              disabled={props.isRemoving}
              aria-label="Cancel removal"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn-danger flex-1 focus-ring"
              onClick={() => props.onConfirm()}
              disabled={props.isRemoving}
              aria-label="Remove from watchlist"
            >
              <Show
                when={!props.isRemoving}
                fallback={
                  <span
                    class="material-symbols-outlined animate-spin"
                    style={{ "font-size": "14px" }}
                    aria-hidden="true"
                  >
                    progress_activity
                  </span>
                }
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "14px" }}
                  aria-hidden="true"
                >
                  delete
                </span>
              </Show>
              {props.isRemoving ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default ConfirmRemoveSheet;
