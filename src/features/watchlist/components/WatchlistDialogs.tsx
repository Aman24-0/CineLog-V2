// src/features/watchlist/components/WatchlistDialogs.tsx
import { Show, Suspense, lazy, type Accessor } from "solid-js";
import type { VaultFilters, WatchlistItem } from "~/shared/types";
import type { PlatformFilterOption } from "../hooks/useWatchlistOttAvailability";

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
  /** JustWatch provider catalog (Chunk 6). Empty while loading / on
   *  error / when no items have any offer — the Platform dropdown is
   *  hidden in those cases (see VaultFiltersContent). */
  uniquePlatforms: Accessor<PlatformFilterOption[]>;
  uniqueTags: Accessor<string[]>;
  /** Union of (tag vocabulary in localStorage) ∪ (tags in use on items).
   *  Phase 6.2 Task 1a — drives the Tags filter dropdown + Manage Tags list. */
  uniqueTagsPlus: Accessor<string[]>;
  /** Bump to force `uniqueTagsPlus` to re-read localStorage after a
   *  tag definition add/remove. Phase 6.2 Task 1a. */
  refreshTagVocab: () => void;
  /** CHUNK 6N Task 3 — TEMPORARY debug accessors for the visible
   *  debug line in the Platform filter modal. Will be removed
   *  alongside the other Chunk 6E-6M diagnostic logs. */
  ottLoading: Accessor<boolean>;
  /** CHUNK 6N Task 3 — first 3 raw batch-response keys as JSON
   *  string. Empty string before the first fetch completes. */
  debugRawKeys: Accessor<string>;
  /** CHUNK 6N Task 3 — number of items in the user's watchlist. */
  watchlistSize: Accessor<number>;
  /** CHUNK 6O Task 1 — TEMPORARY debug accessor. Coarse-grained OTT
   *  fetch state machine for the visible debug line. */
  fetchState: Accessor<"idle" | "loading" | "success" | "error">;
  /** CHUNK 6O Task 1 — TEMPORARY debug accessor. Human-readable error
   *  message from the most recent OTT fetch attempt. */
  fetchError: Accessor<string>;
  /** CHUNK 6P Task 1 — TEMPORARY debug accessor. Monotonic counter
   *  that bumps every time the OTT fetch effect actually starts a
   *  fetch (cache-miss path). For the visible debug line. */
  effectRunId: Accessor<number>;
  /** CHUNK 6P Task 1 — TEMPORARY debug accessor. `${done}/${total}`
   *  progress string updated as each chunk in the OTT batch resolves.
   *  For the visible debug line. */
  chunkProgress: Accessor<string>;
  /** CHUNK 6R Task 5 — TEMPORARY debug accessor. Indicates WHERE the
   *  Platform filter's data is coming from: `'local'` (localStorage
   *  cache), `'live'` (network fetch), `'mixed'` (both, during
   *  fetch), or `'none'` (no data available). For the visible debug
   *  line. */
  cacheSource: Accessor<"local" | "live" | "mixed" | "none">;
  onClose: () => void;
  onClear: () => void;
}

export default function WatchlistDialogs(props: WatchlistDialogsProps) {
  return (
    <Show when={props.show()}>
      <Suspense
        fallback={
          <div
            class="animate-fade-in fixed inset-0 z-[999999] flex items-end justify-center sm:items-center sm:p-4"
            style={{
              background: "rgba(0,0,0,0.75)",
              "backdrop-filter": "blur(8px)",
              "padding-bottom": "var(--nav-total-height)"
            }}
          >
            <div class="flex w-full max-w-sm justify-center p-10">
              <div class="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-white" />
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
          uniqueTagsPlus={props.uniqueTagsPlus()}
          refreshTagVocab={props.refreshTagVocab}
          ottLoading={props.ottLoading()}
          debugRawKeys={props.debugRawKeys()}
          watchlistSize={props.watchlistSize()}
          fetchState={props.fetchState()}
          fetchError={props.fetchError()}
          effectRunId={props.effectRunId()}
          chunkProgress={props.chunkProgress()}
          cacheSource={props.cacheSource()}
          onClose={props.onClose}
          onClear={props.onClear}
        />
      </Suspense>
    </Show>
  );
}

// Re-export to satisfy potential type-only consumers.
export type { WatchlistItem };
