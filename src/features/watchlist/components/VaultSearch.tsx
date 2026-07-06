// src/features/watchlist/components/VaultSearch.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";

interface VaultSearchProps {
  value: () => string;
  onInput: (value: string) => void;
  hasActiveFilters: () => boolean;
  onClearAll: () => void;
}

export default function VaultSearch(props: VaultSearchProps) {
  return (
    <div
      class="flex items-center gap-3 rounded-xl px-4 py-3 border transition-all"
      style="background: var(--surface); border-color: var(--border)"
      onFocusIn={(e) => {
        e.currentTarget.style.borderColor = "var(--p)";
        e.currentTarget.style.boxShadow = "0 0 0 3px var(--p-dim)";
      }}
      onFocusOut={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <Icon name="search" style="color: var(--dim); flex-shrink: 0" aria-hidden="true" />
      <input
        value={props.value()}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        placeholder="Search title, cast, genre, tag, platform..."
        class="bg-transparent border-none w-full outline-none type-metadata"
        style="color: var(--text)"
        aria-label="Search vault"
        type="search"
        autocomplete="off"
        spellcheck="false"
      />
      <Show when={props.value().length > 0 || props.hasActiveFilters()}>
        <button
          onClick={() => props.onClearAll()}
          class="type-caption px-3 py-1.5 rounded-full shrink-0 active:scale-95 transition-all"
          style="background: rgba(255,45,85,0.15); border: 1px solid rgba(255,45,85,0.4); color: #ff2d55"
          aria-label="Clear search and filters"
        >
          Clear
        </button>
      </Show>
    </div>
  );
}
