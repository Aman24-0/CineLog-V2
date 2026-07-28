// src/features/watchlist/components/VaultFiltersContent.tsx
import { For, Show, createSignal, batch, type Accessor } from "solid-js";
import Icon from "~/shared/ui/Icon";
import { FilterSel, RangeFilter, FilterChips, SortControl } from "./FilterControls";
import type { VaultFilters as FilterType, SortField, SortDirection } from "~/shared/types";
import type { FilterPreset } from "~/shared/types";

/**
 * VaultFiltersContent — the scrollable body of the filter drawer.
 *
 * v2 REDESIGN:
 *   - REMOVED Status filter (now handled by header status chips).
 *   - REMOVED Tags filter (feature not currently supported).
 *   - Type + Region converted from <select> dropdowns to horizontal
 *     selectable chip rows (FilterChips component).
 *   - Platform filter uses the dynamic TMDB provider list from
 *     streamingProviders preference (passed via uniquePlatforms).
 *   - Metric inputs (IMDb, RT, Year, Runtime) use dark-theme polished
 *     numeric inputs (.filter-range-input class) instead of plain white
 *     text inputs.
 *
 * Sections:
 *   1. Content — Type (chips) / Region (chips) / Genre (dropdown) / Platform (dropdown)
 *   2. Ratings & Metrics — IMDb / RT / Year / Runtime range inputs (dark theme)
 *   3. Sort By — single dropdown with 9 sort options
 *   4. Presets — save/load/delete named filter presets
 */
export interface VaultFiltersContentProps {
  filters: FilterType;
  setFilters: (v: FilterType) => void;
  uniqueGenres: string[];
  uniquePlatforms: string[];
  uniqueTags: string[];
  presets: Accessor<FilterPreset[]>;
  onSavePreset: (name: string) => Promise<void>;
  onDeletePreset: (id: string) => void;
}

export default function VaultFiltersContent(props: VaultFiltersContentProps) {
  const [presetName, setPresetName] = createSignal("");

  /** Batched setFilters — wraps each filter update in batch() so the
      filtered memo re-computes ONCE instead of triggering cascading
      micro-renders. */
  const batchedSet = (patch: Partial<FilterType>) => {
    batch(() => props.setFilters({ ...props.filters, ...patch }));
  };

  const handleSavePreset = async () => {
    if (!presetName().trim()) return;
    await props.onSavePreset(presetName().trim());
    setPresetName("");
  };

  return (
    <div
      class="flex-1 overflow-y-auto hide-scrollbar px-6 py-4 space-y-4"
      style={{ "overscroll-behavior": "contain", "-webkit-overscroll-behavior": "contain" }}
    >
      {/* CONTENT section — Status + Tags REMOVED. Type/Region are now chips. */}
      <div>
        <p class="filter-section-title">Content</p>
        <div class="space-y-3">
          {/* Type — chip selector (was a dropdown) */}
          <FilterChips
            label="Type"
            val={props.filters.type}
            set={(v) => batchedSet({ type: v })}
            opts={[
              { l: "All", v: "all" },
              { l: "Movies", v: "movie" },
              { l: "Series", v: "tv" },
            ]}
          />
          {/* Region — chip selector (was a dropdown) */}
          <FilterChips
            label="Region"
            val={props.filters.region}
            set={(v) => batchedSet({ region: v })}
            opts={[
              { l: "All", v: "all" },
              { l: "Indian", v: "Indian" },
              { l: "International", v: "International" },
            ]}
          />
          {/* Genre — dropdown (long list, chips would overflow) */}
          <FilterSel
            label="Genre"
            val={props.filters.genre}
            set={(v) => batchedSet({ genre: v })}
            opts={[{ l: "All Genres", v: "all" }, ...props.uniqueGenres.map((g) => ({ l: g, v: g }))]}
          />
          {/* Platform — dropdown populated from the user's vault
              platformsList data (uniquePlatforms from useVaultFiltering). */}
          <FilterSel
            label="Platform"
            val={props.filters.platform}
            set={(v) => batchedSet({ platform: v })}
            opts={[{ l: "All Platforms", v: "all" }, ...props.uniquePlatforms.map((p) => ({ l: p, v: p }))]}
          />
          {/* Status + Tag filters REMOVED — Status is handled by the
              header status chips; Tags feature is not currently supported. */}
        </div>
      </div>

      {/* RATINGS & METRICS section — dark-theme polished inputs */}
      <div>
        <p class="filter-section-title">Ratings & Metrics</p>
        <div class="space-y-3">
          <RangeFilter
            label="IMDb"
            min={props.filters.imdbMin}
            max={props.filters.imdbMax}
            setMin={(v) => batchedSet({ imdbMin: v })}
            setMax={(v) => batchedSet({ imdbMax: v })}
            minPlaceholder="0"
            maxPlaceholder="10"
          />
          <RangeFilter
            label="Rotten Tomatoes %"
            min={props.filters.rtMin}
            max={props.filters.rtMax}
            setMin={(v) => batchedSet({ rtMin: v })}
            setMax={(v) => batchedSet({ rtMax: v })}
            minPlaceholder="0"
            maxPlaceholder="100"
          />
          <RangeFilter
            label="Year"
            min={props.filters.yearMin}
            max={props.filters.yearMax}
            setMin={(v) => batchedSet({ yearMin: v })}
            setMax={(v) => batchedSet({ yearMax: v })}
            minPlaceholder="1990"
            maxPlaceholder="2026"
          />
          <RangeFilter
            label="Runtime (min)"
            min={props.filters.runtimeMin}
            max={props.filters.runtimeMax}
            setMin={(v) => batchedSet({ runtimeMin: v })}
            setMax={(v) => batchedSet({ runtimeMax: v })}
            minPlaceholder="Min"
            maxPlaceholder="Max"
          />
        </div>
      </div>

      {/* SORT section — v2.6 redesign.
          Replaced the previous single <FilterSel> with 9 hardcoded
          "Recently Added / IMDb High→Low / ..." options in favor of
          SortControl: a side-by-side field dropdown + direction toggle.
          This collapses 17+ sort combinations into 9 fields × 2 directions
          and replaces the native <select> (which rendered an OS-default
          white/grey menu that broke the dark glass theme) with a custom
          SolidJS dropdown portal-rendered to body. */}
      <div>
        <p class="filter-section-title">Sort By</p>
        <SortControl
          field={props.filters.sortField}
          direction={props.filters.sortDirection}
          setField={(f: SortField) => batchedSet({ sortField: f })}
          setDirection={(d: SortDirection) => batchedSet({ sortDirection: d })}
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
            class="filter-range-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={handleSavePreset}
            disabled={!presetName().trim()}
            class="px-3 py-2 rounded-xl type-meta active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "var(--p)",
              color: "var(--active-text)",
              "font-size": "0.5625rem",
              "font-weight": 800,
            }}
          >
            Save
          </button>
        </div>
        <div
          class="space-y-2 max-h-40 overflow-y-auto hide-scrollbar"
          style={{ "overscroll-behavior": "contain" }}
        >
          <Show
            when={props.presets().length > 0}
            fallback={
              <p
                class="type-body-soft"
                style={{
                  "font-size": "0.75rem",
                  "text-align": "center",
                  padding: "var(--sp-3)",
                }}
              >
                No presets saved yet
              </p>
            }
          >
            <For each={props.presets()}>
              {(preset) => (
                <div
                  class="flex items-center justify-between gap-2 rounded-xl p-2.5 transition-all"
                  style={{ background: "var(--tier-1)", border: "1px solid var(--hairline)" }}
                >
                  <button
                    class="flex-1 text-left text-sm text-white px-1 truncate hover:text-[var(--p)] transition-colors flex items-center gap-2"
                    onClick={() => batch(() => props.setFilters(preset.filters))}
                  >
                    <Icon name="bookmark" style={{"font-size":"14px","color":"var(--p)"}} aria-hidden="true" />
                    <span class="truncate">{preset.name}</span>
                  </button>
                  <button
                    onClick={() => props.onDeletePreset(preset.id)}
                    class="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                    aria-label={`Delete ${preset.name}`}
                  >
                    <Icon name="delete" style={{"font-size":"14px"}} aria-hidden="true" />
                  </button>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
}
