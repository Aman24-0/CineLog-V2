// src/features/details/components/ConfirmRemoveSheet.tsx
import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useModalState } from "~/shared/hooks/useModalState";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { hapticDouble } from "~/shared/utils/haptic";

interface ConfirmRemoveSheetProps {
  itemId: string;
  title: string;
  posterPath: string | null;
  onConfirm: () => void;
  onClose: () => void;
  isRemoving: boolean;
}

/**
 * ConfirmRemoveSheet — a premium bottom sheet that asks the user to
 * confirm before removing an item from their vault.
 *
 * RESPONSIVE LAYOUT:
 *   - Mobile (default): true bottom-sheet — pinned to the bottom edge
 *     with rounded top corners, slides up via `animate-slide-up`.
 *   - Desktop (sm+): centered modal — centered with all corners rounded,
 *     fades in via `sm:animate-fade-in`.
 *
 * The backdrop doubles as the flex container that positions the sheet
 * (justify-end on mobile, justify+items-center on desktop). This avoids
 * the previous approach where a separate `.sheet-container` was
 * absolutely positioned and behaved as a floating desktop box on
 * mobile devices.
 *
 * ACCESSIBILITY:
 *   - role="dialog" + aria-modal="true" on the sheet surface.
 *   - The sheet's accessible name comes from the visible <h2> heading
 *     ("Remove from Vault?") via aria-labelledby — no aria-label
 *     duplication.
 *   - Buttons use visible text as their accessible name (no aria-label).
 *   - The backdrop is purely visual; clicking it dismisses the sheet.
 *     No aria-hidden on the backdrop — it is naturally excluded from
 *     the modal dialog's accessible tree.
 */
export default function ConfirmRemoveSheet(props: ConfirmRemoveSheetProps) {
  const modalState = useModalState();

  return (
    <Portal>
      {/*
        Backdrop — doubles as the positioning flex container.
        Mobile: justify-end → sheet hugs the bottom edge.
        Desktop (sm+): justify-center + items-center → sheet floats centered.
        Clicking the backdrop dismisses (unless a removal is in-flight).
      */}
      <div
        class="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center"
        onClick={() => {
          if (!props.isRemoving) props.onClose();
        }}
        style={{
          "z-index": modalState.zIndexBase + 2
        }}
      >
        {/*
          Sheet Surface — bottom-sheet on mobile, centered modal on desktop.
          The `onClick` stopPropagation lets clicks inside the sheet NOT
          bubble up to the backdrop (which would dismiss it).
        */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-remove-sheet-title"
          class="animate-slide-up sm:animate-fade-in w-full transform rounded-t-3xl bg-glass p-6 pb-8 transition-transform sm:max-w-md sm:rounded-2xl sm:pb-6"
          onClick={(e: MouseEvent) => e.stopPropagation()}
          style={{
            "z-index": modalState.zIndexBase + 3,
            "max-height": "90vh",
            "overflow-y": "auto",
            "border-top": "1px solid var(--glass-border-warm-strong)",
            "border-left": "1px solid var(--glass-border-warm-strong)",
            "border-right": "1px solid var(--glass-border-warm-strong)",
            "box-shadow":
              "var(--shadow-glass-elevated), 0 0 24px var(--p-glow), inset 0 1px 0 rgba(232,183,74,0.10)",
            "padding-bottom": "calc(2rem + env(safe-area-inset-bottom, 0px))"
          }}
        >
          {/* Drag handle area (visual only) */}
          <div
            class="sheet-handle"
            aria-hidden="true"
            style={{ "margin-bottom": "1rem" }}
          />

          {/* Scrollable content area */}
          <div class="flex flex-col items-center gap-4 text-center">
            {/* Thumbnail */}
            <Show
              when={props.posterPath}
              fallback={
                <div
                  class="flex items-center justify-center rounded-xl"
                  style={{
                    width: "80px",
                    height: "120px",
                    background: "var(--tier-2)",
                    border: "1px solid var(--hairline-2)"
                  }}
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "32px", color: "var(--text-dim)" }}
                  >
                    movie
                  </span>
                </div>
              }
            >
              <div
                class="relative overflow-hidden rounded-xl"
                style={{
                  width: "80px",
                  height: "120px",
                  "box-shadow": "var(--shadow-elevated)",
                  border: "1px solid rgba(255,255,255,0.08)"
                }}
              >
                <img
                  src={tmdbImage(props.posterPath, "w185")}
                  alt=""
                  class="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </Show>

            {/* Text Content */}
            <div class="flex flex-col gap-2">
              <h2
                id="confirm-remove-sheet-title"
                class="type-title"
                style={{ "font-size": "1.25rem", color: "var(--text-strong)" }}
              >
                Remove from Vault?
              </h2>
              <p
                class="type-body"
                style={{ "font-size": "0.9375rem", color: "var(--text-muted)" }}
              >
                This will move{" "}
                <span style={{ color: "var(--text)", "font-weight": 500 }}>
                  {props.title}
                </span>{" "}
                to Trash. It will be removed from your watchlist, collections,
                and history. You can restore it from Trash within 30 days before
                it's permanently deleted.
              </p>
            </div>
          </div>

          {/*
            Action Row — full-width buttons on mobile (flex-row, each flex-1).
            On desktop the same layout works; the buttons share the row.
          */}
          <div
            class="mt-5 flex w-full gap-3 pt-5"
            style={{ "border-top": "1px solid var(--hairline)" }}
          >
            {/* Cancel button — visible text "Cancel" is the accessible name. */}
            <button
              type="button"
              class="btn-ghost focus-ring flex-1"
              onClick={(e) => {
                e.stopPropagation();
                props.onClose();
              }}
              disabled={props.isRemoving}
            >
              Cancel
            </button>
            {/*
              Remove button — visible text ("Remove" / "Removing…") is the
              accessible name. No aria-label, so the visible text always
              matches the announced label (including the "Removing…" state).
            */}
            <button
              type="button"
              class="btn-danger focus-ring flex-1"
              onClick={(e) => {
                e.stopPropagation();
                hapticDouble();
                props.onConfirm();
              }}
              disabled={props.isRemoving}
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
}
