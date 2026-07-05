import { createSignal } from "solid-js";

export type ToastType =
  | "success"
  | "error"
  | "info"
  | "action";

export interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

const [toasts, setToasts] = createSignal<Toast[]>([]);

export function useToast() {
  const showToast = (
    msg: string,
    type: ToastType = "info",
    duration = 2500
  ) => {
    const id = Date.now();

    setToasts((prev) => [
      ...prev,
      {
        id,
        msg,
        type
      }
    ]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) =>
          prev.filter((t) => t.id !== id)
        );
      }, duration);
    }
  };

  return {
    toasts,
    showToast
  };
}
