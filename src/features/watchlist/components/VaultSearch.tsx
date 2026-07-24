// src/features/watchlist/components/VaultSearch.tsx
import { Show } from "solid-js";
import { GlassSearchBar } from "~/shared/ui/glass/GlassSearchBar";

interface VaultSearchProps {
  value: () => string;
  onInput: (value: string) => void;
  hasActiveFilters: () => boolean;
  onClearAll: () => void;
}

/**
 * Vault search bar.
 * Uses GlassSearchBar for consistent input styling.
 */
export default function VaultSearch(props: VaultSearchProps) {
  return (
    <div class="w-full relative">
      <GlassSearchBar
        query={props.value()}
        onQueryChange={props.onInput}
        onClear={props.onClearAll}
        placeholder="Search title, cast, director, genre, platform, year..."
        size="default"
      />
      {/* Custom clear pill when there are filters but no text query */}
      <Show when={props.value().length === 0 && props.hasActiveFilters()}>
         <div class="absolute right-2 top-1/2 -translate-y-1/2">
            <button
              onClick={() => props.onClearAll()}
              class="type-meta shrink-0 active:scale-95 transition-all focus-ring"
              style={{
                background: "rgba(255,45,85,0.12)",
                border: "1px solid rgba(255,45,85,0.35)",
                color: "#ff2d55",
                padding: "0.375rem 0.75rem",
                "border-radius": "var(--radius-pill)",
                "font-size": "0.5625rem",
                "font-weight": 700,
                "letter-spacing": "0.12em",
                "text-transform": "uppercase",
                "cursor": "pointer"
              }}
              aria-label="Clear search and filters"
            >
              Clear
            </button>
         </div>
      </Show>
    </div>
  );
}
