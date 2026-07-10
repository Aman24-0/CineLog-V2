// src/shared/ui/primitives/EmptyState.tsx
import { Component, JSX, Show } from "solid-js";

interface EmptyStateProps {
  icon: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  iconFill?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
}

/**
 * Premium empty state primitive.
 *
 * Layout: [icon tile] / Title / message / [optional action button]
 *
 * Uses .empty-premium* CSS classes from globals.css. The icon tile has a
 * subtle accent glow. The optional action uses the primary button style.
 *
 * Accessibility: the icon is decorative (aria-hidden), the title is an
 * <h3>, and the action button has an aria-label combining action + title.
 *
 * Polished:
 *  - Action button has .focus-ring for keyboard users.
 *  - role="status" so screen readers announce the empty state.
 *  - aria-live="polite" so dynamic empty states (after async loads)
 *    get announced when they appear.
 */
const EmptyState: Component<EmptyStateProps> = (props) => {
  return (
    <div
      class={`empty-premium${props.class ? ` ${props.class}` : ""}`}
      style={props.style}
      role="status"
      aria-live="polite"
    >
      <div class="empty-premium-icon" aria-hidden="true">
        <span
          class="material-symbols-outlined"
          style={{
            "font-size": "32px",
            color: "var(--p)",
            "font-variation-settings": props.iconFill
              ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
              : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
          }}
        >
          {props.icon}
        </span>
      </div>

      <h3 class="empty-premium-title">{props.title}</h3>

      <Show when={props.message}>
        <p class="empty-premium-body">{props.message}</p>
      </Show>

      <Show when={props.actionLabel && props.onAction}>
        <button
          type="button"
          onClick={() => props.onAction?.()}
          class="btn-primary focus-ring"
          style={{ "margin-top": "var(--sp-2)" }}
          aria-label={`${props.actionLabel} — ${props.title}`}
        >
          {props.actionLabel}
        </button>
      </Show>
    </div>
  );
};

export default EmptyState;
