// src/features/watchlist/components/VaultFilters.tsx
import { onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import Icon from "~/shared/ui/Icon";
import { useVault } from "../useVault";
import type { VaultFilters as FilterType } from "~/shared/types";
import type { PlatformFilterOption } from "../hooks/useWatchlistOttAvailability";
import VaultFiltersContent from "./VaultFiltersContent";

interface VaultFiltersProps {
  filters: FilterType;
  setFilters: (filters: FilterType) => void;
  uniqueGenres: string[];
  /** JustWatch provider catalog (Chunk 6). Empty while loading / on
   *  error / when no items have any offer — the Platform dropdown is
   *  hidden in those cases (see VaultFiltersContent). */
  uniquePlatforms: PlatformFilterOption[];
  uniqueTags: string[];
  /** Union of tag vocabulary + tags in use. Phase 6.2 Task 1a. */
  uniqueTagsPlus: string[];
  /** Bump to force re-read of tag vocabulary from localStorage. */
  refreshTagVocab: () => void;
  /** CHUNK 6N Task 3 — TEMPORARY debug accessors for the visible
   *  debug line in the Platform filter modal. Will be removed
   *  alongside the other Chunk 6E-6M diagnostic logs. */
  ottLoading: boolean;
  /** CHUNK 6N Task 3 — first 3 raw batch-response keys as JSON
   *  string. Empty string before the first fetch completes. */
  debugRawKeys: string;
  /** CHUNK 6N Task 3 — number of items in the user's watchlist.
   *  Surfaced in the visible debug line so the user can verify the
   *  watchlist actually loaded (vs. an empty list, which would
   *  correctly produce an empty catalog). */
  watchlistSize: number;
  /** CHUNK 6O Task 1 — TEMPORARY debug prop. Coarse-grained OTT fetch
   *  state machine for the visible debug line. */
  fetchState: "idle" | "loading" | "success" | "error";
  /** CHUNK 6O Task 1 — TEMPORARY debug prop. Human-readable error
   *  message from the most recent OTT fetch attempt. */
  fetchError: string;
  /** CHUNK 6P Task 1 — TEMPORARY debug prop. Monotonic counter that
   *  bumps every time the OTT fetch effect actually starts a fetch
   *  (cache-miss path). For the visible debug line. */
  effectRunId: number;
  /** CHUNK 6P Task 1 — TEMPORARY debug prop. `${done}/${total}`
   *  progress string updated as each chunk in the OTT batch resolves.
   *  For the visible debug line. */
  chunkProgress: string;
  /** CHUNK 6R Task 5 — TEMPORARY debug prop. Indicates WHERE the
   *  Platform filter's data is coming from: `'local'` (localStorage
   *  cache), `'live'` (network fetch), `'mixed'` (both, during
   *  fetch), or `'none'` (no data available). For the visible debug
   *  line. */
  cacheSource: "local" | "live" | "mixed" | "none";
  onClose: () => void;
  onClear: () => void;
}

/**
 * VaultFilters — premium filter drawer (orchestration only).
 *
 * LAYOUT FIX (Issue 3 — "Filter modal bottom bug"):
 *   The bottom sheet is rendered via <Portal> at document.body level so
 *   it can NEVER be covered by the fixed bottom navigation. The outer
 *   container adds `padding-bottom: var(--nav-total-height)` so the sheet
 *   sits ABOVE the bottom nav, and the sheet's `max-height` uses `100dvh`
 *   so it never extends behind the mobile URL bar.
 *
 *   The internal scroll area uses `overscroll-contain: contain` to
 *   prevent scroll chaining to the body. The Apply / Clear buttons live
 *   in a sticky footer INSIDE the sheet (always visible regardless of
 *   scroll position).
 *
 * The scrollable content (Content / Ratings / Sort / Presets sections)
 * lives in VaultFiltersContent. FilterSel + RangeFilter primitives live
 * in FilterControls.
 */
export default function VaultFilters(props: VaultFiltersProps) {
  const { presets, savePreset, deletePreset } = useVault();

  onMount(() => (document.body.style.overflow = "hidden"));
  onCleanup(() => (document.body.style.overflow = ""));

  return (
    <Portal>
      <div
        class="animate-fade-in glass-sheet-backdrop fixed inset-0 z-[999999] flex items-end justify-center sm:items-center sm:p-4"
        onClick={() => props.onClose()}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <div
          class="filter-drawer modal-sheet-enter glass-sheet-surface-premium flex w-full max-w-sm flex-col rounded-t-[2rem] sm:rounded-[2rem]"
          style={{
            "max-height":
              "calc(100dvh - var(--nav-total-height) - env(safe-area-inset-top, 0px) - var(--sp-4))",
            "min-height": "0",
            // Phase 14 Chunk 5 — soften the sheet glass so the ambient
            // blobs bleed through beautifully inside the filter sheet.
            // The .glass-sheet-surface-premium class sets --glass-strong-bg
            // (0.86 alpha) which is too opaque for the new ambient
            // aesthetic. Override to --glass-bg (0.45) + --glass-blur
            // (32px) so the vibrant ambient field stays visible through
            // the sheet while the blur keeps text legible. The class is
            // kept for its border, shadow, will-change, and transform
            // rules — only the background + blur are overridden here.
            background: "var(--glass-bg)",
            "backdrop-filter": "blur(var(--glass-blur)) saturate(160%)",
            "-webkit-backdrop-filter": "blur(var(--glass-blur)) saturate(160%)"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mobile drag handle */}
          <div
            class="mx-auto mb-2 mt-4 h-1.5 w-12 flex-shrink-0 rounded-full sm:hidden"
            style={{ background: "var(--hairline-2)" }}
            aria-hidden="true"
          />

          {/* Header */}
          <div
            class="flex flex-shrink-0 items-center justify-between px-6 pb-4 pt-4"
            style={{ "border-bottom": "1px solid var(--hairline)" }}
          >
            <div class="flex items-center gap-2">
              <Icon
                name="tune"
                style={{ color: "var(--p)", "font-size": "18px" }}
                aria-hidden="true"
              />
              <h3
                class="type-headline text-white"
                style={{ "font-size": "1rem", margin: 0 }}
              >
                Filters
              </h3>
            </div>
            <button
              onClick={() => props.onClose()}
              class="flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-95"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "var(--text-soft)",
                border: "1px solid var(--hairline)"
              }}
              aria-label="Close"
            >
              <Icon
                name="close"
                style={{ "font-size": "16px" }}
                aria-hidden="true"
              />
            </button>
          </div>

          <VaultFiltersContent
            filters={props.filters}
            setFilters={props.setFilters}
            uniqueGenres={props.uniqueGenres}
            uniquePlatforms={props.uniquePlatforms}
            uniqueTags={props.uniqueTags}
            uniqueTagsPlus={props.uniqueTagsPlus}
            refreshTagVocab={props.refreshTagVocab}
            ottLoading={props.ottLoading}
            debugRawKeys={props.debugRawKeys}
            watchlistSize={props.watchlistSize}
            fetchState={props.fetchState}
            fetchError={props.fetchError}
            effectRunId={props.effectRunId}
            chunkProgress={props.chunkProgress}
            cacheSource={props.cacheSource}
            presets={presets}
            onSavePreset={(name) => savePreset(name, props.filters)}
            onDeletePreset={(id) => deletePreset(id)}
          />

          {/* Sticky footer — Apply / Clear buttons.
              The padding-bottom accounts for BOTH the iOS safe-area inset
              AND the bottom nav height so buttons are always reachable.
              Phase 14 Chunk 5 — softened from --glass-bg-strong (0.86)
              to --glass-bg (0.45) + --glass-blur (32px) so the ambient
              stays visible through the footer too, matching the sheet
              body above. */}
          <div
            class="grid flex-shrink-0 grid-cols-2 gap-3 px-6 pb-4 pt-4"
            style={{
              "border-top": "1px solid var(--hairline)",
              "padding-bottom":
                "calc(env(safe-area-inset-bottom, 0px) + var(--sp-5))",
              background: "var(--glass-bg)",
              "backdrop-filter": "blur(var(--glass-blur)) saturate(160%)",
              "-webkit-backdrop-filter": "blur(var(--glass-blur)) saturate(160%)"
            }}
          >
            <button
              onClick={() => props.onClear()}
              class="btn-ghost"
              style={{ "font-size": "0.6875rem" }}
            >
              Clear All
            </button>
            <button
              onClick={() => props.onClose()}
              class="btn-primary"
              style={{ "font-size": "0.6875rem" }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
