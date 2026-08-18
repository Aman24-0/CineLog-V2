// src/shared/ui/states/MutationButton.tsx
//
// Button with built-in idle/submitting/success/error states.
// Prevents duplicate submissions. Shows appropriate feedback
// for each state without leaving buttons permanently disabled.
//
// Usage:
//   <MutationButton
//     status={mutationStatus()}
//     onClick={handleSubmit}
//     idleLabel="Save Changes"
//     submittingLabel="Saving…"
//     successLabel="Saved!"
//     errorLabel="Couldn't save"
//   />

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export type MutationStatus = "idle" | "submitting" | "success" | "error";

export interface MutationButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Current mutation status */
  status: MutationStatus;
  /** Called on click when status is idle or error */
  onClick: () => void;
  /** Button label when idle */
  idleLabel?: string;
  /** Button label when submitting */
  submittingLabel?: string;
  /** Button label on success */
  successLabel?: string;
  /** Button label on error */
  errorLabel?: string;
  /** Auto-reset success to idle after ms (default 2000). 0 = no auto-reset */
  successResetMs?: number;
  /** Visual variant passed to btn-primary/btn-ghost/etc */
  variant?: "primary" | "ghost" | "danger";
  /** Material Symbols icon for idle state */
  icon?: string;
}

const defaultProps: Required<
  Pick<MutationButtonProps, "idleLabel" | "submittingLabel" | "successLabel" | "errorLabel" | "successResetMs" | "variant" | "icon">
> = {
  idleLabel: "Save",
  submittingLabel: "Saving\u2026",
  successLabel: "Saved!",
  errorLabel: "Failed",
  successResetMs: 2000,
  variant: "primary",
  icon: ""
};

const MutationButton: Component<MutationButtonProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "status", "onClick", "idleLabel", "submittingLabel", "successLabel",
    "errorLabel", "successResetMs", "variant", "icon", "class", "disabled"
  ]);

  const isDisabled = () =>
    local.status === "submitting" || local.status === "success" || !!local.disabled;

  const label = () => {
    switch (local.status) {
      case "submitting": return local.submittingLabel;
      case "success": return local.successLabel;
      case "error": return local.errorLabel;
      default: return local.idleLabel;
    }
  };

  const iconName = () => {
    switch (local.status) {
      case "submitting": return "progress_activity";
      case "success": return "check_circle";
      case "error": return "error";
      default: return local.icon;
    }
  };

  const variantClass = () => {
    switch (local.variant) {
      case "ghost": return "btn-ghost";
      case "danger": return "btn-danger";
      default: return "btn-primary";
    }
  };

  const statusColor = () => {
    switch (local.status) {
      case "success": return "text-emerald-400";
      case "error": return "text-red-400";
      default: return "";
    }
  };

  return (
    <button
      {...rest}
      type="button"
      class={`${variantClass()} focus-ring inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-transform active:scale-95 ${statusColor()} ${local.class ?? ""}`}
      disabled={isDisabled()}
      onClick={() => {
        if (local.status === "idle" || local.status === "error") {
          local.onClick();
        }
      }}
      aria-label={label()}
      aria-busy={local.status === "submitting" ? "true" : undefined}
    >
      <Show when={iconName()}>
        <span
          class={`material-symbols-outlined text-base ${local.status === "submitting" ? "animate-spin" : ""}`}
          style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
          aria-hidden="true"
        >
          {iconName()}
        </span>
      </Show>
      {label()}
    </button>
  );
};

export { MutationButton };
export default MutationButton;
