// src/shared/ui/primitives/SectionHeader.tsx
import { Component, JSX, Show } from "solid-js";

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: string;
  class?: string;
  style?: JSX.CSSProperties;
}

/**
 * Premium section header primitive.
 *
 * Layout: [accent bar] Title ........ [Action]
 *
 * The accent bar + title use .section-header-title CSS. The optional action
 * (e.g. "View All") uses .section-header-action CSS. Both are styled in
 * globals.css for consistency across the app.
 *
 * Accessibility: the action button is a real <button> with aria-label
 * derived from actionLabel + title context.
 */
const SectionHeader: Component<SectionHeaderProps> = (props) => {
  return (
    <div
      class={`section-header${props.class ? ` ${props.class}` : ""}`}
      style={props.style}
    >
      <h3 class="section-header-title">
        <Show when={props.icon}>
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "14px", color: "var(--p)" }}
            aria-hidden="true"
          >
            {props.icon}
          </span>
        </Show>
        {props.title}
      </h3>

      <Show when={props.actionLabel && props.onAction}>
        <button
          type="button"
          onClick={() => props.onAction?.()}
          class="section-header-action"
          aria-label={`${props.actionLabel} — ${props.title}`}
        >
          {props.actionLabel}
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "12px" }}
            aria-hidden="true"
          >
            arrow_forward
          </span>
        </button>
      </Show>
    </div>
  );
};

export default SectionHeader;
