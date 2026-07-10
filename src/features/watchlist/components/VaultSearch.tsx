// src/features/watchlist/components/VaultSearch.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";

interface VaultSearchProps {
  value: () => string;
  onInput: (value: string) => void;
  hasActiveFilters: () => boolean;
  onClearAll: () => void;
}

/**
 * Premium Vault search bar.
 *
 * Uses .search-premium CSS for:
 *  - Refined focus state (accent border + glow ring)
 *  - Background elevation on focus (tier-1 → tier-2)
 *  - Smooth transitions
 *
 * The clear button appears when there's text OR active filters, using a
 * destructive red accent so it's visually distinct from the search action.
 */
export default function VaultSearch(props: VaultSearchProps) {
  return (
    <div class="search-premium">
      <Icon
        name="search"
        style={{"color":"var(--text-muted)","flex-shrink":"0","font-size":"18px"}}
        aria-hidden="true"
      />
      <input
        value={props.value()}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        placeholder="Search title, cast, director, genre, platform, year..."
        class="bg-transparent border-none w-full outline-none type-body"
        style={{ color: "var(--text-strong)", "font-size": "0.875rem" }}
        aria-label="Search vault"
        type="search"
        autocomplete="off"
        spellcheck="false"
      />
      <Show when={props.value().length > 0 || props.hasActiveFilters()}>
        <button
          onClick={() => props.onClearAll()}
          class="type-meta shrink-0 active:scale-95 transition-all"
          style={{
            background: "rgba(255,45,85,0.12)",
            border: "1px solid rgba(255,45,85,0.35)",
            color: "#ff2d55",
            padding: "0.375rem 0.75rem",
            "border-radius": "var(--radius-pill)",
            "font-size": "0.5625rem",
            "font-weight": 700,
            "letter-spacing": "0.12em",
            "text-transform": "uppercase"
          }}
          aria-label="Clear search and filters"
        >
          Clear
        </button>
      </Show>
    </div>
  );
}
