// src/features/details/DetailsModal.tsx
import { Show, onMount, onCleanup, Portal } from "solid-js";
import { useModalState } from "~/shared/hooks/useModalState";
import { useDetails } from "./useDetails";
import DetailsHeader from "./components/DetailsHeader";
import DetailsOverview from "./components/DetailsOverview";
import DetailsSkeleton from "./components/DetailsSkeleton";
import DetailsError from "./components/DetailsError";
import Icon from "~/shared/ui/Icon";

export default function DetailsModal() {
  const { selectedItem, setSelectedItem } = useModalState();

  const { tmdb, omdb, loading, error, retry } = useDetails(selectedItem);

  const close = () => setSelectedItem(null);

  onMount(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleEsc);
    onCleanup(() => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    });
  });

  return (
    <Show when={selectedItem()}>
      <Portal>
        <div
          class="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div class="absolute inset-0 bg-[#08090b] overflow-hidden pointer-events-none">
            <Show when={selectedItem()?.backdrop_path}>
              <img
                src={`https://image.tmdb.org/t/p/w500${selectedItem()?.backdrop_path}`}
                class="backdrop-ambient"
                alt=""
                aria-hidden="true"
              />
            </Show>
            <div class="absolute inset-0 bg-black/80" />
          </div>

          <div
            class="w-full max-w-xl lg:max-w-[800px] relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <Show
              when={!loading()}
              fallback={<DetailsSkeleton />}
            >
              <Show
                when={!error()}
                fallback={<DetailsError onRetry={retry} />}
              >
                <div
                  class="bg-[#08090b]/80 backdrop-blur-3xl rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden border border-white/10 relative max-h-[95vh] modal-sheet-enter flex flex-col"
                >
                  <button
                    onClick={close}
                    class="absolute top-4 right-4 z-[100] bg-black/50 backdrop-blur-md border border-white/10 p-2.5 rounded-full hover:bg-black/80 active:scale-95 transition-all"
                    aria-label="Close details"
                  >
                    <Icon name="close" class="text-sm text-white" aria-hidden="true" />
                  </button>

                  <div class="overflow-y-auto hide-scrollbar w-full">
                    <DetailsHeader baseItem={selectedItem()} details={tmdb()} />
                    <div class="px-6 md:px-8 pb-10 relative z-10">
                      <DetailsOverview details={tmdb()} omdb={omdb()} />
                    </div>
                  </div>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
