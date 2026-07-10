// src/shared/ui/ToastContainer.tsx
import { For, Show, type Component } from "solid-js";
import { useToast, type ToastType } from "~/shared/hooks/useToast";

/**
 * ToastContainer — premium toast renderer.
 *
 * Renders the global toast stack above the bottom nav, below modals.
 * Each toast is type-aware (success/error/info/action) with an icon,
 * accent stripe, and entrance + exit animations.
 *
 * Accessibility:
 *  - The container is an aria-live="polite" region. Screen readers
 *    announce new toasts without interrupting the user.
 *  - role="status" is used for individual toasts so AT users know
 *    they're transient.
 *  - The close button is keyboard-accessible (tabindex=0 by default on
 *    <button>) and has an aria-label.
 *
 * Z-index: 9999 — above nav (40) and ambient UI, below modals (999999+).
 */
const TOAST_ICONS: Record<ToastType, string> = {
  success: "check_circle",
  error: "error",
  info: "info",
  action: "notifications",
};

const ToastContainer: Component = () => {
  const { toasts, dismiss } = useToast();

  return (
    <div
      class="toast-stack"
      aria-live="polite"
      aria-atomic="false"
      role="region"
      aria-label="Notifications"
    >
      <For each={toasts()}>
        {(toast) => (
          <div
            class={`toast toast-${toast.type}${toast.exiting ? " toast-exit" : ""}`}
            role="status"
            aria-live="polite"
          >
            <span
              class="material-symbols-outlined toast-icon"
              aria-hidden="true"
            >
              {TOAST_ICONS[toast.type]}
            </span>

            <p class="toast-message">{toast.msg}</p>

            <Show when={toast.type === "action" && toast.actionLabel}>
              <button
                type="button"
                class="toast-action-btn"
                onClick={() => {
                  toast.onAction?.();
                  dismiss(toast.id);
                }}
                aria-label={toast.actionLabel}
              >
                {toast.actionLabel}
              </button>
            </Show>

            <button
              type="button"
              class="toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px" }}
                aria-hidden="true"
              >
                close
              </span>
            </button>
          </div>
        )}
      </For>
    </div>
  );
};

export default ToastContainer;
