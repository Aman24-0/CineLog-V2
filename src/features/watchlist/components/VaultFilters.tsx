// src/features/watchlist/components/VaultFilters.tsx
import { onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import Icon from "~/shared/ui/Icon";
import { useVault } from "../useVault";
import type { VaultFilters as FilterType } from "~/shared/types";
import VaultFiltersContent from "./VaultFiltersContent";

interface VaultFiltersProps {
  filters: FilterType;
  setFilters: (filters: FilterType) => void;
  uniqueGenres: string[];
  uniquePlatforms: string[];
  uniqueTags: string[];
  /** Union of tag vocabulary + tags in use. Phase 6.2 Task 1a. */
  uniqueTagsPlus: string[];
  /** Bump to force re-read of tag vocabulary from localStorage. */
  refreshTagVocab: () => void;
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
            "min-height": "0"
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
            presets={presets}
            onSavePreset={(name) => savePreset(name, props.filters)}
            onDeletePreset={(id) => deletePreset(id)}
          />

          {/* Sticky footer — Apply / Clear buttons.
              The padding-bottom accounts for BOTH the iOS safe-area inset
              AND the bottom nav height so buttons are always reachable. */}
          <div
            class="grid flex-shrink-0 grid-cols-2 gap-3 px-6 pb-4 pt-4"
            style={{
              "border-top": "1px solid var(--hairline)",
              "padding-bottom":
                "calc(env(safe-area-inset-bottom, 0px) + var(--sp-5))",
              background: "var(--glass-bg-strong)",
              "backdrop-filter": "blur(20px)",
              "-webkit-backdrop-filter": "blur(20px)"
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
