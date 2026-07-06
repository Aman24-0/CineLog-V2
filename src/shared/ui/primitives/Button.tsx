// src/shared/ui/primitives/Button.tsx
import { JSX, Component, splitProps } from "solid-js";

type ButtonVariant = "primary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconFill?: boolean;
  fullWidth?: boolean;
}

const sizePadding: Record<ButtonSize, string> = {
  sm: "0.5rem 1rem",
  md: "0.75rem 1.5rem",
  lg: "0.875rem 2rem"
};

/**
 * Premium button primitive.
 *
 * Variants:
 *  - primary: solid accent fill with glow (CTA)
 *  - ghost:   translucent with backdrop blur (secondary action)
 *
 * Sizes: sm (compact), md (default), lg (hero CTA)
 *
 * Touch feedback is built into the CSS classes (.btn-primary / .btn-ghost
 * already include active:scale-95). No need to add .touch-ripple on top.
 */
const Button: Component<ButtonProps> = (props) => {
  const [local, rest] = splitProps(props, [
    "variant", "size", "icon", "iconFill", "fullWidth",
    "class", "style", "children"
  ]);

  const variant = () => local.variant ?? "primary";
  const size = () => local.size ?? "md";
  const classBase = () => variant() === "primary" ? "btn-primary" : "btn-ghost";

  const resolvedStyle = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = { padding: sizePadding[size()] };
    if (local.fullWidth) base.width = "100%";
    if (local.style && typeof local.style === "object") Object.assign(base, local.style);
    return base;
  };

  return (
    <button
      {...rest}
      class={`${classBase()}${local.class ? ` ${local.class}` : ""}`}
      style={resolvedStyle()}
    >
      {local.icon && (
        <span
          class="material-symbols-outlined"
          style={{
            "font-size": size() === "sm" ? "14px" : "16px",
            "font-variation-settings": local.iconFill
              ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
              : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          }}
          aria-hidden="true"
        >
          {local.icon}
        </span>
      )}
      {local.children}
    </button>
  );
};

export default Button;
