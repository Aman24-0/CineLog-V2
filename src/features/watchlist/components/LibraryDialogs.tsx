// src/features/watchlist/components/LibraryDialogs.tsx
import { Show, Suspense, lazy, type Accessor } from "solid-js";
import type { VaultFilters, WatchlistItem } from "~/shared/types";
import type { PlatformFilterOption } from "../hooks/useWatchlistOttAvailability";

const VaultFilters = lazy(() => import("./VaultFilters"));

/**
 * LibraryDialogs — the filter drawer modal.
 *
 * Renders the lazy-loaded VaultFilters component inside a Suspense
 * boundary (with a spinner fallback) when `show` is true. The drawer
 * is rendered via Portal at body level (inside VaultFilters) so the
 * fixed bottom nav can never cover the Apply / Clear buttons.
 */
export interface LibraryDialogsProps {
  show: Accessor<boolean>;
  filters: Accessor<VaultFilters>;
  setFilters: (v: VaultFilters) => void;
  uniqueGenres: Accessor<string[]>;
  /** Unique original-language codes + display names present in the
   *  user's library (Part 3). Drives the Language dropdown. */
  uniqueLanguages: Accessor<Array<{ code: string; label: string }>>;
  /** Published Supabase provider catalog for the user's country
   *  (Part 4). Empty while loading / on error / when no providers
   *  are published — the Platform dropdown is rendered in a disabled
   *  state in those cases. */
  uniquePlatforms: Accessor<PlatformFilterOption[]>;
  uniqueTags: Accessor<string[]>;
  /** Union of (tag vocabulary in localStorage) ∪ (tags in use on items).
   *  Phase 6.2 Task 1a — drives the Tags filter dropdown + Manage Tags list. */
  uniqueTagsPlus: Accessor<string[]>;
  /** Bump to force `uniqueTagsPlus` to re-read localStorage after a
   *  tag definition add/remove. Phase 6.2 Task 1a. */
  refreshTagVocab: () => void;
  /** True while the JustWatch batch-availability fetch is in flight
   *  (title-level enrichment). Surfaced so the Platform dropdown can
   *  render a disabled state when no providers are available yet.
   *  The Platform dropdown's "Loading platforms…" hint does NOT use
   *  this — see `platformCatalogLoading` below. */
  ottLoading: Accessor<boolean>;
  /** Part 4 follow-up — true WHILE the published Supabase provider
   *  catalog fetch is in flight. The Platform dropdown uses THIS
   *  accessor (NOT `ottLoading`) for the "Loading platforms…" hint. */
  platformCatalogLoading: Accessor<boolean>;
  onClose: () => void;
  onClear: () => void;
}

export default function LibraryDialogs(props: LibraryDialogsProps) {
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
          uniqueLanguages={props.uniqueLanguages()}
          uniquePlatforms={props.uniquePlatforms()}
          uniqueTags={props.uniqueTags()}
          uniqueTagsPlus={props.uniqueTagsPlus()}
          refreshTagVocab={props.refreshTagVocab}
          ottLoading={props.ottLoading()}
          platformCatalogLoading={props.platformCatalogLoading()}
          onClose={props.onClose}
          onClear={props.onClear}
        />
      </Suspense>
    </Show>
  );
}

// Re-export to satisfy potential type-only consumers.
export type { WatchlistItem };
