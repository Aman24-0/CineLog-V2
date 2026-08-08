// src/features/collections/components/BulkActionBar.tsx
import { Show, type Component } from "solid-js";

/**
 * BulkActionBar — Phase 6.2 Task 2a
 *
 * Sticky action bar that appears at the bottom of the Collection detail
 * page when the user enters multi-select mode. Shows:
 *   - The number of selected entries (live count)
 *   - "Select all" / "Deselect all" toggle
 *   - "Remove N" bulk-remove button (danger color)
 *   - "Cancel" button to exit multi-select mode
 *
 * LAYOUT:
 *   [N selected] [Select all / Deselect all]    [Remove N] [Cancel]
 *
 * The bar is rendered as a sticky footer at the bottom of the entry list
 * area so it stays visible while the user scrolls through a long list.
 * Uses the glass surface style (backdrop-blur + var(--glass-bg-strong))
 * to match the rest of the app's premium feel.
 */
export interface BulkActionBarProps {
  /** Number of entries currently selected. */
  selectedCount: number;
  /** Total number of entries currently visible (after filter/search). */
  totalShown: number;
  /** True while the bulk-remove operation is in-flight. Disables buttons. */
  isRemoving?: boolean;
  /** Select all visible entries. */
  onSelectAll: () => void;
  /** Deselect all entries. */
  onDeselectAll: () => void;
  /** Bulk-remove the currently selected entries. */
  onBulkRemove: () => void;
  /** Exit multi-select mode. Clears selection + hides the bar. */
  onCancel: () => void;
}

const BulkActionBar: Component<BulkActionBarProps> = (props) => {
  const allSelected = () =>
    props.totalShown > 0 && props.selectedCount >= props.totalShown;

  return (
    <div
      class="collection-bulk-bar"
      role="toolbar"
      aria-label="Bulk actions for selected collection entries"
      style={{
        position: "sticky",
        bottom: "0",
        "z-index": "10",
        display: "flex",
        "align-items": "center",
        gap: "var(--sp-2)",
        padding: "var(--sp-3) var(--sp-4)",
        "border-top": "1px solid var(--hairline)",
        background: "var(--glass-bg-strong)",
        "backdrop-filter": "blur(20px)",
        "-webkit-backdrop-filter": "blur(20px)"
      }}
    >
      {/* Selection count */}
      <span
        class="type-meta"
        style={{
          "font-size": "0.75rem",
          "font-weight": 700,
          color: "var(--text-soft)",
          "white-space": "nowrap"
        }}
        aria-live="polite"
      >
        {props.selectedCount} selected
      </span>

      {/* Select all / Deselect all */}
      <Show when={props.totalShown > 0}>
        <button
          type="button"
          class="collection-action-bar-btn focus-ring"
          onClick={() =>
            allSelected() ? props.onDeselectAll() : props.onSelectAll()
          }
          disabled={props.isRemoving}
          aria-label={
            allSelected() ? "Deselect all entries" : "Select all entries"
          }
          style={{
            "font-size": "0.6875rem",
            opacity: props.isRemoving ? "0.5" : "1"
          }}
        >
          <span class="material-symbols-outlined" aria-hidden="true" style={{ "font-size": "16px" }}>
            {allSelected() ? "deselect" : "select_all"}
          </span>
          <span class="collection-action-bar-btn-label">
            {allSelected() ? "Deselect all" : "Select all"}
          </span>
        </button>
      </Show>

      {/* Spacer pushes the action buttons to the right */}
      <div style={{ flex: "1" }} />

      {/* Remove N — danger color, disabled when nothing is selected */}
      <button
        type="button"
        class="collection-action-bar-btn is-danger focus-ring"
        onClick={() => props.onBulkRemove()}
        disabled={props.selectedCount === 0 || props.isRemoving}
        aria-label={`Remove ${props.selectedCount} selected entries from collection`}
        style={{
          "font-size": "0.6875rem",
          opacity: props.selectedCount === 0 || props.isRemoving ? "0.5" : "1"
        }}
      >
        <span class="material-symbols-outlined" aria-hidden="true" style={{ "font-size": "16px" }}>
          {props.isRemoving ? "progress_activity" : "delete"}
        </span>
        <span class="collection-action-bar-btn-label">
          {props.isRemoving
            ? "Removing..."
            : `Remove ${props.selectedCount || ""}`}
        </span>
      </button>

      {/* Cancel — exits multi-select mode */}
      <button
        type="button"
        class="collection-action-bar-btn focus-ring"
        onClick={() => props.onCancel()}
        disabled={props.isRemoving}
        aria-label="Cancel selection"
        style={{
          "font-size": "0.6875rem",
          opacity: props.isRemoving ? "0.5" : "1"
        }}
      >
        <span class="material-symbols-outlined" aria-hidden="true" style={{ "font-size": "16px" }}>
          close
        </span>
        <span class="collection-action-bar-btn-label">Cancel</span>
      </button>
    </div>
  );
};

export default BulkActionBar;
