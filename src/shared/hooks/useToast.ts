import { createSignal } from "solid-js";
import { hapticForToastType } from "~/shared/utils/haptic";

export type ToastType = "success" | "error" | "info" | "action";

export interface Toast {
  id: number;
  msg: string;
  type: ToastType;
  /** Optional action button label (only for "action" type). */
  actionLabel?: string;
  /** Optional action handler. When provided with actionLabel, renders a button. */
  onAction?: () => void;
  /** Internal: marks the toast as exiting so it can animate out before removal. */
  exiting?: boolean;
}

const [toasts, setToasts] = createSignal<Toast[]>([]);

// Monotonic counter — Date.now() can collide on rapid successive calls
// (e.g. double-tap), which would cause setTimeout's filter() to remove
// both toasts at once. A counter guarantees uniqueness.
let toastIdSeq = 0;

// Default duration per type. Errors stay longer because they often
// require the user to read and understand the message before it
// disappears. Success toasts are short — they're confirmations, not
// information the user needs to act on.
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 2000,
  info: 2800,
  error: 4000,
  action: 5000
};

const MAX_TOASTS = 3;

/** Remove a toast by id, playing the exit animation first. */
function dismissToast(id: number) {
  // Mark as exiting so the ToastContainer can play .toast-exit, then
  // remove after the animation duration completes.
  setToasts((prev) =>
    prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
  );
  // The exit animation is var(--dur-base) = 220ms. Wait slightly longer
  // to ensure the animation finishes before the element is removed.
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 260);
}

export function useToast() {
  const showToast = (
    msg: string,
    type: ToastType = "info",
    duration: number = DEFAULT_DURATION[type],
    options?: { actionLabel?: string; onAction?: () => void }
  ) => {
    const id = ++toastIdSeq;

    const newToast: Toast = {
      id,
      msg,
      type,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction
    };

    setToasts((prev) => {
      // Cap the stack at MAX_TOASTS — drop the oldest (which is at the
      // END of the array because the container is column-reverse).
      const next = [...prev, newToast];
      if (next.length > MAX_TOASTS) {
        // Remove oldest non-exiting toast to make room.
        const oldestIdx = next.findIndex((t) => !t.exiting);
        if (oldestIdx >= 0) next.splice(oldestIdx, 1);
      }
      return next;
    });

    // Haptic feedback — light tap for success/info, double-tap for errors.
    // Safe fallback: on browsers that don't support navigator.vibrate
    // (iOS Safari, desktop), the utility silently skips the call.
    hapticForToastType(type);

    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration);
    }
  };

  const dismiss = (id: number) => dismissToast(id);

  return {
    toasts,
    showToast,
    dismiss
  };
}
