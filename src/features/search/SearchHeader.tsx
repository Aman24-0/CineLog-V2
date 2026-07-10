// src/features/search/SearchHeader.tsx
import { Show, type Accessor } from "solid-js";

/**
 * SearchHeader — the page eyebrow + search bar form.
 *
 * Sets the "intentional discovery" mindset with the eyebrow + title +
 * subtitle, then renders the autofocus search input with a clear button.
 */
export interface SearchHeaderProps {
  query: Accessor<string>;
  isGuest: Accessor<boolean>;
  inputRef: (el: HTMLInputElement) => void;
  onQueryChange: (v: string) => void;
  onSubmit: (e: Event) => void;
  onClear: () => void;
}

export default function SearchHeader(props: SearchHeaderProps) {
  return (
    <>
      {/* Page eyebrow — sets the search mindset */}
      <div class="search-eyebrow-block">
        <p class="search-eyebrow">Search</p>
        <h1 class="search-page-title">Find your next watch</h1>
        <p class="search-page-subtitle">
          {props.isGuest()
            ? "Search across movies and series — sign in to save what you find."
            : "Search by title, person, or franchise. Results you already own are highlighted."}
        </p>
      </div>

      {/* Search bar — the primary interaction */}
      <form class="search-bar-form" onSubmit={props.onSubmit} role="search">
        <div class="search-bar">
          <span
            class="material-symbols-outlined search-bar-icon"
            aria-hidden="true"
          >
            search
          </span>
          <input
            ref={props.inputRef}
            type="search"
            class="search-bar-input"
            placeholder="Search movies, series, people…"
            value={props.query()}
            onInput={(e) => props.onQueryChange(e.currentTarget.value)}
            aria-label="Search movies, series, and people"
            autocomplete="off"
            spellcheck={false}
          />
          <Show when={props.query()}>
            <button
              type="button"
              class="search-bar-clear focus-ring"
              onClick={props.onClear}
              aria-label="Clear search"
            >
              <span
                class="material-symbols-outlined"
                style={{"font-size":"18px"}}
                aria-hidden="true"
              >
                close
              </span>
            </button>
          </Show>
        </div>
      </form>
    </>
  );
}
