// src/features/search/SearchEmptyState.tsx
import { Show } from "solid-js";

/**
 * SearchEmptyState — cinematic empty state for search.
 *
 * Three distinct variants:
 *   - "no-results": The search completed but returned 0 results.
 *     Shows search_off icon + "Nothing matches..." + suggestions.
 *   - "typing": The user is still typing (query < 2 chars).
 *     Shows a subtle "Keep typing..." hint so the empty space
 *     doesn't look broken.
 *   - "error": An error occurred. Shows the error icon + message.
 *     NOTE: SearchResults.tsx now uses ErrorState from ~/shared/ui/states
 *     for the error variant. This component's error prop is kept for
 *     backward compatibility but is no longer the primary error renderer.
 */
export interface SearchEmptyStateProps {
  /** When set, shows the error message instead of the no-results state. */
  error?: string | null;
  /** The query that returned no results (for the "Nothing matches..." text). */
  query?: string;
  /**
   * Set to true when the user is still typing (query < 2 chars).
   * Shows a "Keep typing..." hint instead of the "no results" message
   * so the empty space doesn't look broken.
   */
  typing?: boolean;
}

export default function SearchEmptyState(props: SearchEmptyStateProps) {
  return (
    <div class="search-empty">
      {/* ── Typing state ──────────────────────────────────────── */}
      <Show when={props.typing && !props.error}>
        <span
          class="material-symbols-outlined search-empty-icon"
          style={{ opacity: 0.5 }}
          aria-hidden="true"
        >
          edit
        </span>
        <p
          class="type-body-soft"
          style={{ "text-align": "center", "max-width": "280px" }}
        >
          Keep typing to search…
        </p>
      </Show>

      {/* ── Error state ───────────────────────────────────────── */}
      <Show when={props.error}>
        <span
          class="material-symbols-outlined search-empty-icon"
          style={{ color: "var(--error, #ef4444)" }}
          aria-hidden="true"
        >
          cloud_off
        </span>
        <p
          class="type-body-soft"
          style={{ "text-align": "center", "max-width": "280px" }}
        >
          {props.error}
        </p>
      </Show>

      {/* ── No-results state ──────────────────────────────────── */}
      <Show when={!props.error && !props.typing}>
        <span
          class="material-symbols-outlined search-empty-icon"
          aria-hidden="true"
        >
          search_off
        </span>
        <p
          class="type-body-soft"
          style={{ "text-align": "center", "max-width": "280px" }}
        >
          Nothing matches "{props.query || ""}" yet.
        </p>
        {/* Actionable suggestions */}
        <ul
          style={{
            "list-style": "none",
            padding: "0",
            margin: "0.5rem 0 0 0",
            display: "flex",
            "flex-direction": "column",
            gap: "0.25rem",
            "text-align": "center"
          }}
        >
          <li class="type-caption" style={{ color: "var(--text-dim, rgba(250,250,250,0.4))" }}>
            Try a different spelling or shorter keyword
          </li>
          <li class="type-caption" style={{ color: "var(--text-dim, rgba(250,250,250,0.4))" }}>
            Search by person name (e.g. "Nolan")
          </li>
          <li class="type-caption" style={{ color: "var(--text-dim, rgba(250,250,250,0.4))" }}>
            Browse by genre instead
          </li>
        </ul>
      </Show>
    </div>
  );
}
