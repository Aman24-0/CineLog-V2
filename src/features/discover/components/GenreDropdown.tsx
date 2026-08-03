// src/features/discover/components/GenreDropdown.tsx
//
// GenreDropdown — a sleek glass dropdown for the "Trending in ▼ Genre"
// row header. Works exactly like the existing OttDropdown but for genres.
//
// Behaviour:
//   • Lists all supported genres (Action, Adventure, Animation, etc.)
//   • Includes "Anime" as a special genre option
//   • When the user selects a genre, the `onSelect` callback fires with
//     the genre name so the parent can reload the carousel content.
//   • The trigger button shows the active genre name.
//   • Default selection is the user's top genre (from personalization).
//
// The genre name selected by the user is exposed via the `selected`
// accessor and the `onSelect` callback. The parent owns the actual
// fetch; this component is purely presentational + selection state.

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
 * Supported genres for the "Trending in ▼ Genre" dropdown.
 * Includes the TMDB genre name for each. "Anime" is a special option
 * that combines Trending Anime + This Season Anime data.
 */
const GENRE_OPTIONS = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
  "War",
  "Western",
  "Anime"
] as const;

/**
 * GenreDropdown — glass-styled dropdown for the "Trending in ▼ Genre"
 * section header. Mirrors the OttDropdown's visual style.
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
            {(genreName) => (
              <button
                type="button"
                class="ott-dropdown-option focus-ring"
                role="option"
                aria-selected={props.selected() === genreName}
                data-active={props.selected() === genreName}
                onClick={() => handleSelect(genreName)}
              >
                <span class="ott-dropdown-option-name">{genreName}</span>
                <Show when={props.selected() === genreName}>
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
