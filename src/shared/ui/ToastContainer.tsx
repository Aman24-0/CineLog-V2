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
 *  - role="status" is used for individual non-error toasts (info,
 *    success, action) — they're transient and non-urgent.
 *  - role="alert" is used for error toasts so they're announced
 *    immediately and assertively (WCAG 1.4.13 / 4.1.3).
 *  - The close button is keyboard-accessible (tabindex=0 by default on
 *    <button>) and has an aria-label.
 *
 * Z-index: 9999 — above nav (40) and ambient UI, below modals (999999+).
 */
const TOAST_ICONS: Record<ToastType, string> = {
  success: "check_circle",
  error: "error",
  info: "info",
  action: "notifications"
};

/**
 * Resolve the ARIA role for an individual toast based on its type.
 *
 * Error toasts use role="alert" (assertive, interrupts SR) so the user
 * is immediately notified of failures. All other toasts use
 * role="status" (polite, queued) since they're informational.
 */
const roleFor = (type: ToastType): "status" | "alert" =>
  type === "error" ? "alert" : "status";

/**
 * Resolve the aria-live politeness setting for an individual toast.
 *
 * Assertive for errors (so the SR interrupts), polite for everything
 * else. Mirrors the role mapping above.
 */
const liveFor = (type: ToastType): "polite" | "assertive" =>
  type === "error" ? "assertive" : "polite";

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
            role={roleFor(toast.type)}
            aria-live={liveFor(toast.type)}
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
