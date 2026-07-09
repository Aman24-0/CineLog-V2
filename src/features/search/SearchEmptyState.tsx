// src/features/search/SearchEmptyState.tsx
import { Show } from "solid-js";

/**
 * SearchEmptyState — quiet, cinematic empty state. NOT an error.
 *
 * Two variants:
 *   - "no-results": shows the search_off icon + "Nothing matches..." message
 *   - "error": shows a plain error message
 */
export interface SearchEmptyStateProps {
  /** When set, shows the error message instead of the no-results state. */
  error?: string | null;
  /** The query that returned no results (for the "Nothing matches..." text). */
  query?: string;
}

export default function SearchEmptyState(props: SearchEmptyStateProps) {
  return (
    <div class="search-empty">
      <Show when={!props.error}>
        <span
          class="material-symbols-outlined search-empty-icon"
          aria-hidden="true"
        >
          search_off
        </span>
      </Show>
      <p
        class="type-body-soft"
        style={{ "text-align": "center", "max-width": "280px" }}
      >
        {props.error
          ? props.error
          : `Nothing matches "${props.query || ""}" yet. Try a title, a person, or a genre.`}
      </p>
    </div>
  );
}
