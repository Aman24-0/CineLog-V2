// src/features/watchlist/components/WatchlistDialogs.tsx
import { Show, Suspense, lazy, type Accessor } from "solid-js";
import type { VaultFilters, WatchlistItem } from "~/shared/types";

const VaultFilters = lazy(() => import("./VaultFilters"));

/**
 * WatchlistDialogs — the filter drawer modal.
 *
 * Renders the lazy-loaded VaultFilters component inside a Suspense
 * boundary (with a spinner fallback) when `show` is true. The drawer
 * is rendered via Portal at body level (inside VaultFilters) so the
 * fixed bottom nav can never cover the Apply / Clear buttons.
 */
export interface WatchlistDialogsProps {
  show: Accessor<boolean>;
  filters: Accessor<VaultFilters>;
  setFilters: (v: VaultFilters) => void;
  uniqueGenres: Accessor<string[]>;
  uniquePlatforms: Accessor<string[]>;
  uniqueTags: Accessor<string[]>;
  onClose: () => void;
  onClear: () => void;
}

export default function WatchlistDialogs(props: WatchlistDialogsProps) {
  return (
    <Show when={props.show()}>
      <Suspense
        fallback={
          <div
            class="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[999999] animate-fade-in"
            style={{
              background: "rgba(0,0,0,0.75)",
              "backdrop-filter": "blur(8px)",
              "padding-bottom": "var(--nav-total-height)",
            }}
          >
            <div class="w-full max-w-sm p-10 flex justify-center">
              <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white" />
            </div>
          </div>
        }
      >
        <VaultFilters
          filters={props.filters()}
          setFilters={props.setFilters}
          uniqueGenres={props.uniqueGenres()}
          uniquePlatforms={props.uniquePlatforms()}
          uniqueTags={props.uniqueTags()}
          onClose={props.onClose}
          onClear={props.onClear}
        />
      </Suspense>
    </Show>
  );
}

// Re-export to satisfy potential type-only consumers.
export type { WatchlistItem };
