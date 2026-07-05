// src/features/watchlist/components/VaultFilters.tsx
import { For, onMount, onCleanup, Show, Component } from "solid-js";
import Icon from "~/shared/ui/Icon";
import type { VaultFilters as FilterType } from "~/shared/types";

interface VaultFiltersProps {
  filters: FilterType;
  setFilters: (filters: FilterType) => void;
  uniqueGenres: string[];
  uniquePlatforms: string[];
  uniqueTags: string[];
  onClose: () => void;
  onClear: () => void;
  onFilterChange: (status: string) => void;
}

const RangeFilter: Component<{
  label: string;
  min: string;
  max: string;
  setMin: (v: string) => void;
  setMax: (v: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}> = (props) => (
  <div class="grid grid-cols-[90px_1fr] items-center gap-2">
    <span class="type-label">{props.label}</span>
    <div class="grid grid-cols-2 gap-2">
      <input
        value={props.min}
        onInput={(e) => props.setMin(e.currentTarget.value)}
        type="number"
        placeholder={props.minPlaceholder || "Min"}
        aria-label={`${props.label} minimum`}
        class="w-full bg-[#0c0e14] border border-white/10 rounded-xl px-3 py-2 type-metadata text-white outline-none focus:border-[var(--p)]"
      />
      <input
        value={props.max}
        onInput={(e) => props.setMax(e.currentTarget.value)}
        type="number"
        placeholder={props.maxPlaceholder || "Max"}
        aria-label={`${props.label} maximum`}
        class="w-full bg-[#0c0e14] border border-white/10 rounded-xl px-3 py-2 type-metadata text-white outline-none focus:border-[var(--p)]"
      />
    </div>
  </div>
);

const FilterSel: Component<{
  label: string;
  val: string;
  set: (v: string) => void;
  opts: { l: string; v: string }[] | string[];
}> = (props) => (
  <div class="grid grid-cols-[90px_1fr] items-center gap-2">
    <label class="type-label" for={`filter-${props.label.toLowerCase().replace(/\s/g, "-")}`}>{props.label}</label>
    <select
      id={`filter-${props.label.toLowerCase().replace(/\s/g, "-")}`}
      value={props.val}
      onChange={(e) => props.set(e.currentTarget.value)}
      class="w-full type-metadata text-white font-medium cursor-pointer bg-[#0c0e14] border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[var(--p)]"
    >
      <For each={props.opts}>
        {(o) => (
          <option value={typeof o === "string" ? o : o.v} class="bg-[#0c0e14]">
            {typeof o === "string" ? o : o.l}
          </option>
        )}
      </For>
    </select>
  </div>
);

export default function VaultFilters(props: VaultFiltersProps) {
  onMount(() => (document.body.style.overflow = "hidden"));
  onCleanup(() => (document.body.style.overflow = ""));

  return (
    <div
      class="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[999999] animate-fade-in"
      style="background: rgba(0,0,0,0.75); backdrop-filter: blur(8px)"
      onClick={() => props.onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Filter vault"
    >
      <div
        class="glass-surface w-full max-w-sm rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl modal-sheet-enter flex flex-col"
        style="border-color: var(--border-active); background: rgba(9,11,16,0.97); max-height: 90vh"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="w-12 h-1.5 rounded-full mx-auto mt-4 mb-2 sm:hidden flex-shrink-0" style="background: var(--border-active)" aria-hidden="true" />

        <div class="flex justify-between items-center border-b px-6 pt-2 pb-4 flex-shrink-0" style="border-color: var(--border)">
          <h3 class="type-modal-title text-white flex items-center gap-2" style="font-size: 20px">
            <Icon name="tune" style="color: var(--p)" aria-hidden="true" /> Filters
          </h3>
          <button
            onClick={() => props.onClose()}
            class="w-9 h-9 rounded-full hover:bg-white/5 active:scale-95 flex items-center justify-center"
            style="color: var(--muted)"
            aria-label="Close filters"
          >
            <Icon name="close" aria-hidden="true" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto hide-scrollbar px-6 py-4 space-y-4">
          <FilterSel
            label="Status"
            val={props.filters.status}
            set={(v) => {
              props.setFilters({ ...props.filters, status: v });
              props.onFilterChange(v);
            }}
            opts={[
              { l: "All", v: "all" },
              { l: "Planned", v: "Planned" },
              { l: "Watching", v: "Watching" },
              { l: "Completed", v: "Completed" }
            ]}
          />
          <FilterSel
            label="Tags"
            val={props.filters.tag}
            set={(v) => props.setFilters({ ...props.filters, tag: v })}
            opts={[{ l: "All Tags", v: "all" }, ...props.uniqueTags.map((t) => ({ l: t, v: t }))]}
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
            label="Platform"
            val={props.filters.platform}
            set={(v) => props.setFilters({ ...props.filters, platform: v })}
            opts={[{ l: "All Platforms", v: "all" }, ...props.uniquePlatforms.map((p) => ({ l: p, v: p }))]}
          />
          <FilterSel
            label="Genre"
            val={props.filters.genre}
            set={(v) => props.setFilters({ ...props.filters, genre: v })}
            opts={[{ l: "All Genres", v: "all" }, ...props.uniqueGenres.map((g) => ({ l: g, v: g }))]}
          />
          <RangeFilter label="IMDb" min={props.filters.imdbMin} max={props.filters.imdbMax} setMin={(v) => props.setFilters({ ...props.filters, imdbMin: v })} setMax={(v) => props.setFilters({ ...props.filters, imdbMax: v })} minPlaceholder="0" maxPlaceholder="10" />
          <RangeFilter label="RT %" min={props.filters.rtMin} max={props.filters.rtMax} setMin={(v) => props.setFilters({ ...props.filters, rtMin: v })} setMax={(v) => props.setFilters({ ...props.filters, rtMax: v })} minPlaceholder="0" maxPlaceholder="100" />
          <RangeFilter label="Year" min={props.filters.yearMin} max={props.filters.yearMax} setMin={(v) => props.setFilters({ ...props.filters, yearMin: v })} setMax={(v) => props.setFilters({ ...props.filters, yearMax: v })} minPlaceholder="1990" maxPlaceholder="2026" />
          <RangeFilter label="Runtime" min={props.filters.runtimeMin} max={props.filters.runtimeMax} setMin={(v) => props.setFilters({ ...props.filters, runtimeMin: v })} setMax={(v) => props.setFilters({ ...props.filters, runtimeMax: v })} minPlaceholder="Min" maxPlaceholder="Max" />
          <FilterSel
            label="Sort By"
            val={props.filters.sort}
            set={(v) => props.setFilters({ ...props.filters, sort: v })}
            opts={[
              { l: "Recently Added", v: "recent" },
              { l: "Watch Date ↓", v: "watch_desc" },
              { l: "Watch Date ↑", v: "watch_asc" },
              { l: "Release Year ↓", v: "year_desc" },
              { l: "Rating ↓", v: "rating_desc" },
              { l: "Title A–Z", v: "title_asc" }
            ]}
          />
        </div>

        <div
          class="grid grid-cols-2 gap-3 px-6 pt-4 flex-shrink-0"
          style="border-top: 1px solid var(--border); padding-bottom: max(16px, calc(env(safe-area-inset-bottom, 0px) + 80px));"
        >
          <button
            onClick={() => props.onClear()}
            class="w-full type-button py-4 rounded-xl"
            style="background: var(--raised); color: var(--muted); border: 1px solid var(--border)"
            aria-label="Clear all filters"
          >
            Clear All
          </button>
          <button
            onClick={() => props.onClose()}
            class="w-full type-button py-4 rounded-xl text-[#0c0e14]"
            style="background: var(--p); box-shadow: 0 0 20px var(--p-glow)"
            aria-label="Apply filters and close"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
