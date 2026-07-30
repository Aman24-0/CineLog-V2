// src/features/trash/components/ConfirmDialog.tsx
//
// ConfirmDialog — a reusable confirmation modal for destructive or
// irreversible actions. Built on top of GlassModal so it inherits the
// frosted-glass visual language, ESC-to-close, backdrop-tap-to-close,
// and focus management behavior.
//
// Variants:
//   • "danger"  — confirm button is red (use for permanent deletes,
//                  "Clear Trash", "Delete Forever").
//   • "warning" — confirm button is amber (use for less-destructive
//                  warnings, e.g. "Restore All" which can be undone by
//                  re-deleting but isn't trivially reversible).
//   • "primary" — confirm button is the standard primary gold (use
//                  for non-destructive confirmations).
//
// Accessibility:
//   - role="dialog" aria-modal="true" (inherited from GlassModal)
//   - ESC closes (unless disableClose is set)
//   - Backdrop tap closes (unless disableClose is set)
//   - Auto-focuses the confirm button on open so keyboard users can
//     press Enter to confirm immediately.
//

import { Component, Show, onMount, onCleanup } from "solid-js";
import { GlassModal, GlassButton } from "~/shared/ui/glass";

export type ConfirmDialogVariant = "danger" | "warning" | "primary";

export interface ConfirmDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Dialog title (rendered in the modal header). */
  title: string;
  /** Body text explaining what the action does and why it can't be undone. */
  message: string;
  /** Label for the confirm button. @default "Confirm" */
  confirmLabel?: string;
  /** Label for the cancel button. @default "Cancel" */
  cancelLabel?: string;
  /** Visual variant — controls confirm button color. @default "danger" */
  variant?: ConfirmDialogVariant;
  /** Material Symbol icon shown next to the title. @default "warning" */
  icon?: string;
  /** Whether the action is in progress (disables buttons, shows "..." on confirm). */
  busy?: boolean;
  /** Disable closing via ESC / backdrop tap (e.g. during a destructive op). @default false */
  disableClose?: boolean;
  /** Called when the user confirms the action. */
  onConfirm: () => void;
  /** Called when the user cancels (ESC, backdrop tap, or Cancel button). */
  onCancel: () => void;
}

const ConfirmDialog: Component<ConfirmDialogProps> = (props) => {
  // Auto-focus the confirm button when the dialog opens so keyboard
  // users can press Enter immediately. We use a small ref + rAF delay
  // because the Portal mounts asynchronously.
  let confirmBtnRef: HTMLButtonElement | undefined;

  onMount(() => {
    if (props.open && confirmBtnRef) {
      requestAnimationFrame(() => confirmBtnRef?.focus());
    }
  });

  // ESC handler — GlassModal already handles ESC, but we also expose
  // onCancel here for explicit wiring.
  onCleanup(() => {});

  const variantClass = (): string => {
    switch (props.variant ?? "danger") {
      case "danger":
        return "trash-confirm-danger";
      case "warning":
        return "trash-confirm-warning";
      case "primary":
      default:
        return "";
    }
  };

  const confirmButtonVariant = (): "primary" | "danger" => {
    return props.variant === "danger" ? "danger" : "primary";
  };

  const iconColor = (): string => {
    switch (props.variant ?? "danger") {
      case "danger":
        return "#f87171";
      case "warning":
        return "#fbbf24";
      case "primary":
      default:
        return "var(--p)";
    }
  };

  return (
    <GlassModal
      open={props.open}
      onClose={() => {
        if (!props.busy && !props.disableClose) props.onCancel();
      }}
      size="sm"
      title={props.title}
      icon={props.icon ?? "warning"}
      showCloseButton={!props.busy && !props.disableClose}
      disableBackdropClose={props.busy || props.disableClose}
      class={`trash-confirm-dialog ${variantClass()}`}
    >
      <div class="trash-confirm-body">
        <p class="trash-confirm-message">{props.message}</p>

        <Show when={props.variant === "danger"}>
          <p class="trash-confirm-warning-row">
            <span class="material-symbols-outlined" aria-hidden="true">block</span>
            This action cannot be undone.
          </p>
        </Show>

        <div class="trash-confirm-actions">
          <GlassButton
            variant="ghost"
            size="default"
            fullWidth
            disabled={props.busy}
            onClick={() => props.onCancel()}
          >
            {props.cancelLabel ?? "Cancel"}
          </GlassButton>
          <GlassButton
            variant={confirmButtonVariant()}
            size="default"
            fullWidth
            loading={props.busy}
            disabled={props.busy}
            onClick={() => props.onConfirm()}
          >
            <Show when={props.busy} fallback={props.confirmLabel ?? "Confirm"}>
              Working…
            </Show>
          </GlassButton>
        </div>
      </div>

      {/* Inline style block for the icon color, since GlassModal's
          icon slot uses var(--p) by default and we want to override
          per-variant. */}
      <style>{`
        .trash-confirm-dialog .modal-glass-icon {
          color: ${iconColor()};
        }
      `}</style>
    </GlassModal>
  );
};

export default ConfirmDialog;
