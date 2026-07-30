// src/features/upcoming/components/FilterSheet.tsx
//
// FilterSheet — a bottom-sheet modal exposing the full filter set:
//   • Region (country selector)
//   • Date range (start/end with presets)
//   • Genre (multi-select chips, max 3)
//   • Platform (multi-select chips)
//   • Minimum rating (slider 0-10)
//
// All state is owned by the parent (controlled). The sheet calls
// onApply() and onReset() — the parent is responsible for mutating
// the actual filter signals.

import { type Component, For, Show } from "solid-js";
import { GlassModal } from "~/shared/ui/glass";
import { MOVIE_GENRES } from "~/core/tmdb/genres";
import DateRangePicker, { type DateRange } from "./DateRangePicker";

export interface UpcomingFilters {
  region: string;
  dateRange: DateRange;
  genres: number[];
  platforms: string[];
  minRating: number;
  mediaType: "all" | "movie" | "tv";
}

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  value: UpcomingFilters;
  onChange: (next: UpcomingFilters) => void;
  onApply: () => void;
  onReset: () => void;
}

// Curated genre list (id → label) — same set as the Discover page.
const POPULAR_GENRES: { id: number; label: string }[] = [
  { id: 28, label: "Action" },
  { id: 12, label: "Adventure" },
  { id: 16, label: "Animation" },
  { id: 35, label: "Comedy" },
  { id: 80, label: "Crime" },
  { id: 99, label: "Documentary" },
  { id: 18, label: "Drama" },
  { id: 10751, label: "Family" },
  { id: 14, label: "Fantasy" },
  { id: 27, label: "Horror" },
  { id: 9648, label: "Mystery" },
  { id: 10749, label: "Romance" },
  { id: 878, label: "Sci-Fi" },
  { id: 53, label: "Thriller" },
];

const REGIONS: { code: string; label: string }[] = [
  { code: "IN", label: "India" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "AE", label: "UAE" },
];

const FilterSheet: Component<FilterSheetProps> = (props) => {
  const toggleGenre = (id: number) => {
    const cur = props.value.genres;
    if (cur.includes(id)) {
      props.onChange({ ...props.value, genres: cur.filter((g) => g !== id) });
    } else if (cur.length < 3) {
      props.onChange({ ...props.value, genres: [...cur, id] });
    }
  };

  const toggleMediaType = (mt: "all" | "movie" | "tv") => {
    props.onChange({ ...props.value, mediaType: mt });
  };

  return (
    <GlassModal
      open={props.open}
      onClose={props.onClose}
      size="lg"
      title="Filters"
      icon="tune"
      headerRight={
        <button
          type="button"
          class="upcoming-filter-reset focus-ring"
          onClick={() => props.onReset()}
        >
          Reset
        </button>
      }
    >
      <div class="upcoming-filter-sheet">
        {/* Media type */}
        <section class="upcoming-filter-section">
          <h4 class="upcoming-filter-section-title">Type</h4>
          <div class="upcoming-filter-chip-row">
            {(["all", "movie", "tv"] as const).map((mt) => (
              <button
                type="button"
                class={`upcoming-filter-chip ${props.value.mediaType === mt ? "is-active" : ""}`}
                onClick={() => toggleMediaType(mt)}
              >
                {mt === "all" ? "All" : mt === "movie" ? "Movies" : "Series"}
              </button>
            ))}
          </div>
        </section>

        {/* Region */}
        <section class="upcoming-filter-section">
          <h4 class="upcoming-filter-section-title">Region</h4>
          <label class="upcoming-filter-select-wrap">
            <select
              class="upcoming-filter-select"
              value={props.value.region}
              onChange={(e) =>
                props.onChange({ ...props.value, region: e.currentTarget.value })
              }
              aria-label="Region"
            >
              <For each={REGIONS}>
                {(r) => <option value={r.code}>{r.label}</option>}
              </For>
            </select>
            <span class="material-symbols-outlined upcoming-filter-chevron" aria-hidden="true">
              expand_more
            </span>
          </label>
        </section>

        {/* Date range */}
        <section class="upcoming-filter-section">
          <h4 class="upcoming-filter-section-title">Date Range</h4>
          <DateRangePicker
            value={props.value.dateRange}
            onChange={(next) =>
              props.onChange({ ...props.value, dateRange: next })
            }
          />
        </section>

        {/* Genres (max 3) */}
        <section class="upcoming-filter-section">
          <h4 class="upcoming-filter-section-title">
            Genres
            <span class="upcoming-filter-section-hint">
              Pick up to 3 ({props.value.genres.length}/3)
            </span>
          </h4>
          <div class="upcoming-filter-chip-row">
            <For each={POPULAR_GENRES}>
              {(g) => (
                <button
                  type="button"
                  class={`upcoming-filter-chip ${
                    props.value.genres.includes(g.id) ? "is-active" : ""
                  }`}
                  disabled={
                    !props.value.genres.includes(g.id) && props.value.genres.length >= 3
                  }
                  onClick={() => toggleGenre(g.id)}
                >
                  {g.label}
                </button>
              )}
            </For>
          </div>
        </section>

        {/* Minimum rating */}
        <section class="upcoming-filter-section">
          <h4 class="upcoming-filter-section-title">
            Minimum Rating
            <span class="upcoming-filter-section-hint">
              {props.value.minRating > 0 ? `${props.value.minRating}+` : "Any"}
            </span>
          </h4>
          <input
            type="range"
            class="upcoming-filter-slider"
            min="0"
            max="10"
            step="0.5"
            value={props.value.minRating}
            onInput={(e) =>
              props.onChange({
                ...props.value,
                minRating: parseFloat(e.currentTarget.value),
              })
            }
            aria-label="Minimum rating"
          />
        </section>
      </div>

      <div class="upcoming-filter-footer">
        <button
          type="button"
          class="btn-ghost focus-ring"
          onClick={() => props.onClose()}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-primary focus-ring"
          onClick={() => props.onApply()}
        >
          Apply Filters
        </button>
      </div>
    </GlassModal>
  );
};

// Reference the genre map so tree-shaking doesn't drop the import
// (we use POPULAR_GENRES above, but keep MOVIE_GENRES referenced for
// future use without a TS unused-import warning).
void MOVIE_GENRES;

export default FilterSheet;
