// src/features/details/components/ConfirmRemoveSheet.tsx
import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useModalState } from "~/shared/hooks/useModalState";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { GlassSurface } from "~/shared/ui/glass";
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
 */
export default function ConfirmRemoveSheet(props: ConfirmRemoveSheetProps) {
  const modalState = useModalState();

  return (
    <Portal>
      {/* Backdrop */}
      <div
        class="sheet-backdrop animate-fade-in"
        onClick={() => {
          if (!props.isRemoving) props.onClose();
        }}
        aria-hidden="true"
        style={{
          "z-index": modalState.zIndexBase + 2,
        }}
      />

      {/* Sheet Container */}
      <div
        class="sheet-container sheet-container-active"
        style={{
          "z-index": modalState.zIndexBase + 3,
        }}
      >
        {/* The sheet surface itself */}
        <GlassSurface
          strength="strong"
          class="sheet-content p-6 pb-8 flex flex-col gap-6"
          onClick={(e: any) => e.stopPropagation()}
        >
          {/* Drag handle area (visual only) */}
          <div class="sheet-handle" aria-hidden="true" />

          <div class="px-6 flex flex-col items-center text-center gap-4">
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
                    border: "1px solid var(--hairline-2)",
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
                class="rounded-xl overflow-hidden relative"
                style={{
                  width: "80px",
                  height: "120px",
                  "box-shadow": "var(--shadow-elevated)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <img
                  src={tmdbImage(props.posterPath, "w185")}
                  alt=""
                  class="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </Show>

            {/* Text Content */}
            <div class="flex flex-col gap-2">
              <h2
                class="type-title"
                style={{ "font-size": "1.25rem", color: "var(--text-strong)" }}
              >
                Remove from Vault?
              </h2>
              <p
                class="type-body"
                style={{ "font-size": "0.9375rem", color: "var(--text-muted)" }}
              >
                This will remove <span style={{ color: "var(--text)", "font-weight": 500 }}>{props.title}</span> from your watchlist, collections, and history. This action cannot be undone.
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div
            class="px-6 pt-3 pb-5 flex-shrink-0 flex gap-2"
            style={{ "border-top": "1px solid var(--hairline)" }}
          >
            <button
              type="button"
              class="btn-ghost flex-1 focus-ring"
              onClick={(e) => {
                e.stopPropagation();
                props.onClose();
              }}
              disabled={props.isRemoving}
              aria-label="Cancel removal"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn-danger flex-1 focus-ring"
              onClick={(e) => {
                e.stopPropagation();
                hapticDouble();
                props.onConfirm();
              }}
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
        </GlassSurface>
      </div>
    </Portal>
  );
}
