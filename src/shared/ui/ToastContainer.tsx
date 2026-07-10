import { For } from "solid-js";
import { useToast } from "~/shared/hooks/useToast";

export default function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div class="fixed bottom-6 left-1/2 z-[9999999] flex -translate-x-1/2 flex-col gap-3 pointer-events-none">
      <For each={toasts()}>
        {(toast) => (
          <div class="rounded-xl bg-zinc-900 px-4 py-3 text-white shadow-lg border border-zinc-700 pointer-events-auto">
            {toast.msg}
          </div>
        )}
      </For>
    </div>
  );
}
