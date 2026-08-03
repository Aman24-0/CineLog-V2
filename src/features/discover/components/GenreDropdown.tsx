// src/features/discover/components/GenreDropdown.tsx
//
// GenreDropdown — a sleek glass dropdown for the "Trending in ▼ Genre"
// row header. Works exactly like the existing OttDropdown but for genres.
//
// Each genre has a Material Symbols icon for visual consistency with
// the OTT dropdown (which shows provider logos).

import {
  For,
  Show,
  createSignal,
  type Component
} from "solid-js";

interface GenreDropdownProps {
  /** The currently-selected genre name (e.g. "Drama", "Anime"). */
  selected: () => string;
  /** Called when the user picks a genre from the dropdown. */
  onSelect: (genreName: string) => void;
}

/**
 * Supported genres with their Material Symbols icons.
 * "Anime" is a special option that combines Trending + Seasonal anime data.
 */
const GENRE_OPTIONS: readonly { name: string; icon: string }[] = [
  { name: "Action", icon: "local_fire_department" },
  { name: "Adventure", icon: "explore" },
  { name: "Animation", icon: "animation" },
  { name: "Comedy", icon: "sentiment_very_satisfied" },
  { name: "Crime", icon: "crisis_alert" },
  { name: "Documentary", icon: "movie_filter" },
  { name: "Drama", icon: "theater_comedy" },
  { name: "Family", icon: "family_restroom" },
  { name: "Fantasy", icon: "auto_fix_high" },
  { name: "Horror", icon: "ghost" },
  { name: "Mystery", icon: "detector" },
  { name: "Romance", icon: "favorite" },
  { name: "Sci-Fi", icon: "rocket_launch" },
  { name: "Thriller", icon: "psychology" },
  { name: "War", icon: "shield" },
  { name: "Western", icon: "landscape" },
  { name: "Anime", icon: "smart_display" }
] as const;

/**
 * Resolve the icon for a genre name.
 */
function genreIcon(name: string): string {
  const found = GENRE_OPTIONS.find((g) => g.name === name);
  return found?.icon ?? "movie";
}

/**
 * GenreDropdown — glass-styled dropdown for the "Trending in ▼ Genre"
 * section header. Mirrors the OttDropdown's visual style, including
 * genre icons alongside the name.
 */
const GenreDropdown: Component<GenreDropdownProps> = (props) => {
  const [open, setOpen] = createSignal(false);

  const handleSelect = (genreName: string) => {
    props.onSelect(genreName);
    setOpen(false);
  };

  return (
    <div class="ott-dropdown-wrap">
      <button
        type="button"
        class="ott-dropdown-trigger focus-ring"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-controls="genre-dropdown-listbox"
        aria-label="Select genre"
      >
        {/* Active genre icon — small, matches OTT dropdown's logo style */}
        <span
          class="material-symbols-outlined genre-dropdown-trigger-icon"
          aria-hidden="true"
        >
          {genreIcon(props.selected())}
        </span>
        <span class="ott-dropdown-label">{props.selected()}</span>
        <span
          class="material-symbols-outlined ott-dropdown-chevron"
          aria-hidden="true"
          style={{
            transform: open() ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease-out"
          }}
        >
          expand_more
        </span>
      </button>

      <Show when={open()}>
        {/* Click-outside overlay */}
        <div
          class="ott-dropdown-overlay"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <div
          class="ott-dropdown-panel"
          id="genre-dropdown-listbox"
          role="listbox"
          aria-label="Genres"
        >
          <For each={[...GENRE_OPTIONS]}>
            {(genre) => (
              <button
                type="button"
                class="ott-dropdown-option focus-ring"
                role="option"
                aria-selected={props.selected() === genre.name}
                data-active={props.selected() === genre.name}
                onClick={() => handleSelect(genre.name)}
              >
                <span
                  class="material-symbols-outlined genre-dropdown-option-icon"
                  aria-hidden="true"
                >
                  {genre.icon}
                </span>
                <span class="ott-dropdown-option-name">{genre.name}</span>
                <Show when={props.selected() === genre.name}>
                  <span
                    class="material-symbols-outlined ott-dropdown-option-check"
                    aria-hidden="true"
                  >
                    check
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default GenreDropdown;
