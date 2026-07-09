// src/features/search/SearchLoading.tsx
import { For } from "solid-js";

/**
 * SearchLoading — skeleton rows shown while TMDB search is in flight.
 *
 * Pass `count` to control the number of skeleton rows (default 4 for
 * text search, 6 for genre browse).
 */
export interface SearchLoadingProps {
  count?: number;
}

export default function SearchLoading(props: SearchLoadingProps) {
  const rows = () => Array.from({ length: props.count ?? 4 }, (_, i) => i);
  return (
    <div class="search-loading" aria-hidden="true">
      <For each={rows()}>{() => <div class="search-result-skeleton" />}</For>
    </div>
  );
}
