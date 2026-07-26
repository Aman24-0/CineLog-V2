// src/shared/ui/glass/GlassSearchBar.tsx
import { Component, Show } from "solid-js";
import { GlassInput } from "./GlassInput";

export interface GlassSearchBarProps {
  /** The current search query. */
  query: string;
  /** Callback when input changes. */
  onQueryChange: (val: string) => void;
  /** Callback when the form is submitted. */
  onSubmit?: (e: Event) => void;
  /** Callback when the clear button is clicked. */
  onClear: () => void;
  /** Placeholder text. @default "Search..." */
  placeholder?: string;
  /** Optional ref for the input element. */
  inputRef?: (el: HTMLInputElement) => void;
  /** Size of the search bar. @default "default" */
  size?: "default" | "large";
  /** Additional classes for the container form. */
  class?: string;
}

/**
 * GlassSearchBar — A standardized search bar using GlassInput.
 * Includes a search icon and a clear button that appears when text is entered.
 */
const GlassSearchBar: Component<GlassSearchBarProps> = (props) => {
  return (
    <form
      class={`w-full ${props.class || ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (props.onSubmit) props.onSubmit(e);
      }}
      role="search"
    >
      <GlassInput
        ref={props.inputRef}
        type="search"
        icon="search"
        size={props.size || "default"}
        placeholder={props.placeholder || "Search..."}
        value={props.query}
        onInput={(e) => props.onQueryChange(e.currentTarget.value)}
        aria-label={props.placeholder || "Search"}
        autocomplete="off"
        spellcheck={false}
        rightContent={
          <Show when={props.query.length > 0}>
            <button
              type="button"
              class="flex items-center justify-center w-8 h-8 rounded-full text-text-muted hover:text-text-strong hover:bg-tier-3 transition-colors focus-ring"
              onClick={props.onClear}
              aria-label="Clear search"
            >
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">
                close
              </span>
            </button>
          </Show>
        }
      />
      {/* Visually-hidden submit button for WCAG compliance */}
      <button type="submit" class="sr-only" tabindex={-1}>
        Submit Search
      </button>
    </form>
  );
};

export { GlassSearchBar };
export default GlassSearchBar;
