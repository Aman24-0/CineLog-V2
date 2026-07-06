// src/features/watchlist/components/VaultFilters.tsx
import { For, onMount, onCleanup, Show, createSignal, Component } from "solid-js";
import Icon from "~/shared/ui/Icon";
import { useVault } from "../useVault";
import type { VaultFilters as FilterType } from "~/shared/types";

interface VaultFiltersProps {
  filters: FilterType;
  setFilters: (filters: FilterType) => void;
  uniqueGenres: string[];
  uniquePlatforms: string[];
  uniqueTags: string[];
  onClose: () => void;
  onClear: () => void;
}

/**
 * Premium filter select — styled dropdown with custom chevron.
 * Uses .filter-select-premium CSS for consistent appearance.
 */
const FilterSel: Component<{
  label: string;
  val: string;
  set: (v: string) => void;
  opts: { l: string; v: string }[] | string[];
}> = (props) => {
  const id = `filter-${props.label.toLowerCase().replace(/\s/g, "-")}`;
  return (
    <div class="flex flex-col gap-1.5">
      <label class="type-meta" for={id} style={{ "font-size": "0.5625rem" }}>
        {props.label}
      </label>
      <select
        id={id}
        value={props.val}
        onChange={(e) => props.set(e.currentTarget.value)}
        class="filter-select-premium"
      >
        <For each={props.opts}>
          {(o) => (
            <option value={typeof o === "string" ? o : o.v}>
              {typeof o === "string" ? o : o.l}
            </option>
          )}
        </For>
      </select>
    </div>
  );
};

/**
 * Premium range filter — two inputs side by side.
 * Uses .filter-input-premium CSS for consistent appearance.
 */
const RangeFilter: Component<{
  label: string;
  min: string;
  max: string;
  setMin: (v: string) => void;
  setMax: (v: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}> = (props) => (
  <div class="flex flex-col gap-1.5">
    <span class="type-meta" style={{ "font-size": "0.5625rem" }}>
      {props.label}
    </span>
    <div class="grid grid-cols-2 gap-2">
      <input
        value={props.min}
        onInput={(e) => props.setMin(e.currentTarget.value)}
        type="number"
        placeholder={props.minPlaceholder || "Min"}
        aria-label={`${props.label} minimum`}
        class="filter-input-premium"
      />
      <input
        value={props.max}
        onInput={(e) => props.setMax(e.currentTarget.value)}
        type="number"
        placeholder={props.maxPlaceholder || "Max"}
        aria-label={`${props.label} maximum`}
        class="filter-input-premium"
      />
    </div>
  </div>
);

/**
 * Premium filter drawer.
 *
 * Design:
 *  - Frosted glass surface (.filter-drawer) with strong backdrop blur
 *  - Grouped sections with .filter-section-title dividers (Content / Ratings / Sort / Presets)
 *  - Premium selects (.filter-select-premium) with custom chevron + focus glow
 *  - Premium inputs (.filter-input-premium) for range filters
 *  - Refined preset list with icon + delete affordance
 *  - Sticky footer with Clear All (ghost) + Apply (primary) buttons
 *
 * Accessibility: role=dialog, aria-modal, focus trap via backdrop click.
 */
export default function VaultFilters(props: VaultFiltersProps) {
  const { presets, savePreset, deletePreset } = useVault();
  const [presetName, setPresetName] = createSignal("");

  onMount(() => (document.body.style.overflow = "hidden"));
  onCleanup(() => (document.body.style.overflow = ""));

  const handleSavePreset = async () => {
    if (!presetName().trim()) return;
    await savePreset(presetName().trim(), props.filters);
    setPresetName("");
  };

  return (
    <div
      class="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[999999] animate-fade-in"
      style="background: rgba(0,0,0,0.75); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px)"
      onClick={() => props.onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Filter vault"
    >
      <div
        class="filter-drawer w-full max-w-sm rounded-t-[2rem] sm:rounded-[2rem] flex flex-col modal-sheet-enter"
        style={{ "max-height": "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div
          class="w-12 h-1.5 rounded-full mx-auto mt-4 mb-2 sm:hidden flex-shrink-0"
          style="background: var(--hairline-2)"
          aria-hidden="true"
        />

        {/* Header */}
        <div class="flex justify-between items-center px-6 pt-4 pb-4 flex-shrink-0" style="border-bottom: 1px solid var(--hairline)">
          <div class="flex items-center gap-2">
            <Icon name="tune" style="color: var(--p); font-size: 18px" aria-hidden="true" />
            <h3 class="type-headline text-white" style={{ "font-size": "1rem", margin: 0 }}>
              Filters
            </h3>
          </div>
          <button
            onClick={() => props.onClose()}
            class="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-soft)", border: "1px solid var(--hairline)" }}
            aria-label="Close filters"
          >
            <Icon name="close" style="font-size: 16px" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable filter content */}
        <div class="flex-1 overflow-y-auto hide-scrollbar px-6 py-4 space-y-4">
          {/* CONTENT section */}
          <div>
            <p class="filter-section-title">Content</p>
            <div class="space-y-3">
              <FilterSel
                label="Status"
                val={props.filters.status}
                set={(v) => props.setFilters({ ...props.filters, status: v })}
                opts={[
                  { l: "All", v: "all" },
                  { l: "Planned", v: "Planned" },
                  { l: "Watching", v: "Watching" },
                  { l: "Completed", v: "Completed" }
                ]}
              />
              <FilterSel
                label="Type"
                val={props.filters.type}
                set={(v) => props.setFilters({ ...props.filters, type: v })}
                opts={[
                  { l: "All", v: "all" },
                  { l: "Movies", v: "movie" },
                  { l: "Series", v: "tv" }
                ]}
              />
              <FilterSel
                label="Region"
                val={props.filters.region}
                set={(v) => props.setFilters({ ...props.filters, region: v })}
                opts={[
                  { l: "All", v: "all" },
                  { l: "Indian", v: "Indian" },
                  { l: "International", v: "International" }
                ]}
              />
              <FilterSel
                label="Genre"
                val={props.filters.genre}
                set={(v) => props.setFilters({ ...props.filters, genre: v })}
                opts={[{ l: "All Genres", v: "all" }, ...props.uniqueGenres.map((g) => ({ l: g, v: g }))]}
              />
              <FilterSel
                label="Platform"
                val={props.filters.platform}
                set={(v) => props.setFilters({ ...props.filters, platform: v })}
                opts={[{ l: "All Platforms", v: "all" }, ...props.uniquePlatforms.map((p) => ({ l: p, v: p }))]}
              />
              <FilterSel
                label="Tag"
                val={props.filters.tag}
                set={(v) => props.setFilters({ ...props.filters, tag: v })}
                opts={[{ l: "All Tags", v: "all" }, ...props.uniqueTags.map((t) => ({ l: t, v: t }))]}
              />
            </div>
          </div>

          {/* RATINGS & METRICS section */}
          <div>
            <p class="filter-section-title">Ratings & Metrics</p>
            <div class="space-y-3">
              <RangeFilter
                label="IMDb"
                min={props.filters.imdbMin}
                max={props.filters.imdbMax}
                setMin={(v) => props.setFilters({ ...props.filters, imdbMin: v })}
                setMax={(v) => props.setFilters({ ...props.filters, imdbMax: v })}
                minPlaceholder="0"
                maxPlaceholder="10"
              />
              <RangeFilter
                label="Rotten Tomatoes %"
                min={props.filters.rtMin}
                max={props.filters.rtMax}
                setMin={(v) => props.setFilters({ ...props.filters, rtMin: v })}
                setMax={(v) => props.setFilters({ ...props.filters, rtMax: v })}
                minPlaceholder="0"
                maxPlaceholder="100"
              />
              <RangeFilter
                label="Year"
                min={props.filters.yearMin}
                max={props.filters.yearMax}
                setMin={(v) => props.setFilters({ ...props.filters, yearMin: v })}
                setMax={(v) => props.setFilters({ ...props.filters, yearMax: v })}
                minPlaceholder="1990"
                maxPlaceholder="2026"
              />
              <RangeFilter
                label="Runtime (min)"
                min={props.filters.runtimeMin}
                max={props.filters.runtimeMax}
                setMin={(v) => props.setFilters({ ...props.filters, runtimeMin: v })}
                setMax={(v) => props.setFilters({ ...props.filters, runtimeMax: v })}
                minPlaceholder="Min"
                maxPlaceholder="Max"
              />
            </div>
          </div>

          {/* SORT section */}
          <div>
            <p class="filter-section-title">Sort By</p>
            <FilterSel
              label="Order"
              val={props.filters.sort}
              set={(v) => props.setFilters({ ...props.filters, sort: v })}
              opts={[
                { l: "Recently Added", v: "recent" },
                { l: "Recently Updated", v: "updated" },
                { l: "Watch Date", v: "watch_desc" },
                { l: "Release Year", v: "year_desc" },
                { l: "User Rating", v: "rating_desc" },
                { l: "IMDb High → Low", v: "imdb_desc" },
                { l: "IMDb Low → High", v: "imdb_asc" },
                { l: "Runtime", v: "runtime_asc" },
                { l: "Alphabetical", v: "title_asc" }
              ]}
            />
          </div>

          {/* PRESETS section */}
          <div>
            <p class="filter-section-title">Presets</p>
            <div class="flex gap-2 mb-3">
              <input
                value={presetName()}
                onInput={(e) => setPresetName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSavePreset();
                }}
                placeholder="New preset name"
                class="filter-input-premium"
                style={{ flex: 1 }}
              />
              <button
                onClick={handleSavePreset}
                disabled={!presetName().trim()}
                class="px-3 py-2 rounded-xl type-meta active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "var(--p)",
                  color: "#05060a",
                  "font-size": "0.5625rem",
                  "font-weight": 800
                }}
                aria-label="Save current filters as preset"
              >
                Save
              </button>
            </div>
            <div class="space-y-2 max-h-40 overflow-y-auto hide-scrollbar">
              <Show
                when={presets().length > 0}
                fallback={
                  <p class="type-body-soft" style={{ "font-size": "0.75rem", "text-align": "center", padding: "var(--sp-3)" }}>
                    No presets saved yet
                  </p>
                }
              >
                <For each={presets()}>
                  {(preset) => (
                    <div
                      class="flex items-center justify-between gap-2 rounded-xl p-2.5 transition-all"
                      style={{ background: "var(--tier-1)", border: "1px solid var(--hairline)" }}
                    >
                      <button
                        class="flex-1 text-left text-sm text-white px-1 truncate hover:text-[var(--p)] transition-colors flex items-center gap-2"
                        onClick={() => props.setFilters(preset.filters)}
                      >
                        <Icon name="bookmark" style="font-size: 14px; color: var(--p)" aria-hidden="true" />
                        <span class="truncate">{preset.name}</span>
                      </button>
                      <button
                        onClick={() => deletePreset(preset.id)}
                        class="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                        aria-label={`Delete ${preset.name}`}
                      >
                        <Icon name="delete" style="font-size: 14px" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div
          class="grid grid-cols-2 gap-3 px-6 pt-4 pb-4 flex-shrink-0"
          style={{
            "border-top": "1px solid var(--hairline)",
            "padding-bottom": "calc(var(--nav-safe-area) + 16px)"
          }}
        >
          <button
            onClick={() => props.onClear()}
            class="btn-ghost"
            style={{ "font-size": "0.6875rem" }}
            aria-label="Clear all filters"
          >
            Clear All
          </button>
          <button
            onClick={() => props.onClose()}
            class="btn-primary"
            style={{ "font-size": "0.6875rem" }}
            aria-label="Apply filters and close"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
