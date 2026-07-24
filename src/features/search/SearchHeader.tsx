// src/features/search/SearchHeader.tsx
import { type Accessor } from "solid-js";
import { GlassSearchBar } from "~/shared/ui/glass/GlassSearchBar";

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
      <div class="mt-6 mb-8">
        <GlassSearchBar
          query={props.query()}
          onQueryChange={props.onQueryChange}
          onSubmit={props.onSubmit}
          onClear={props.onClear}
          inputRef={props.inputRef}
          placeholder="Search movies, series, people…"
          size="large"
        />
      </div>
    </>
  );
}
