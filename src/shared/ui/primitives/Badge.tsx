// src/shared/ui/primitives/Badge.tsx
import { Component, JSX, Show } from "solid-js";

type BadgeVariant = "accent" | "glow";

interface BadgeProps {
  variant?: BadgeVariant;
  icon?: string;
  iconFill?: boolean;
  children: JSX.Element;
  class?: string;
  style?: JSX.CSSProperties;
  "aria-label"?: string;
}

/**
 * Premium badge primitive.
 *
 * Variants:
 *  - accent: glass pill with neutral text (informational)
 *  - glow:   accent-tinted pill with glow (highlighted state)
 *
 * Optional Material Symbols icon (rendered before children).
 */
const Badge: Component<BadgeProps> = (props) => {
  const variant = () => props.variant ?? "accent";
  const classBase = () => variant() === "glow" ? "badge-glow" : "badge-accent";

  return (
    <span
      class={`${classBase()}${props.class ? ` ${props.class}` : ""}`}
      style={props.style}
      aria-label={props["aria-label"]}
    >
      <Show when={props.icon}>
        <span
          class="material-symbols-outlined"
          style={{
            "font-size": "12px",
            "font-variation-settings": props.iconFill
              ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
              : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          }}
          aria-hidden="true"
        >
          {props.icon}
        </span>
      </Show>
      {props.children}
    </span>
  );
};

export default Badge;
