// src/features/discover/components/DiscoverEmptyState.tsx
import { Show, type Component } from "solid-js";

interface DiscoverEmptyStateProps {
  /** Material Symbols icon name (e.g. "movie", "live_tv"). */
  icon?: string;
  /** Primary message — short, specific. */
  message: string;
  /** Optional secondary line — usually a suggestion. */
  hint?: string;
  /** If provided, renders a Retry button that calls this handler. */
  onRetry?: () => void;
}

/**
 * DiscoverEmptyState — uniform empty / error placeholder for Discover
 * sections.
 *
 * Why this exists:
 *   - Replaces the bare `<p class="type-body-soft">` fallbacks scattered
 *     across DiscoverRail, OttSection, GenreExplorer, Weekend Picks, etc.
 *   - Never shows blank space — always an icon + message + optional hint.
 *   - When `onRetry` is provided (e.g. on network failure), shows a
 *     prominent retry button so users can recover without a full reload.
 *
 * Visual language: minimal, centered, single accent icon. The card has
 * no border — it relies on whitespace to feel intentional rather than
 * empty. Message uses `type-body-soft`; hint uses `type-micro` muted.
 */
const DiscoverEmptyState: Component<DiscoverEmptyStateProps> = (props) => {
  return (
    <div class="discover-empty-state" role="status" aria-live="polite">
      <Show when={props.icon}>
        <span
          class="material-symbols-outlined discover-empty-icon"
          aria-hidden="true"
        >
          {props.icon}
        </span>
      </Show>
      <p class="discover-empty-message">{props.message}</p>
      <Show when={props.hint}>
        <p class="discover-empty-hint">{props.hint}</p>
      </Show>
      <Show when={props.onRetry}>
        <button
          type="button"
          class="btn-ghost focus-ring discover-empty-retry"
          onClick={() => props.onRetry?.()}
          aria-label="Retry loading this section"
        >
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "14px" }}
            aria-hidden="true"
          >
            refresh
          </span>
          Retry
        </button>
      </Show>
    </div>
  );
};

export default DiscoverEmptyState;
