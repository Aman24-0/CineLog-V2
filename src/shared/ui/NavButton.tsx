import { JSX, createMemo, type Component } from "solid-js";
import Icon from "./Icon";

type Props = {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
};

/**
 * NavButton — single tab in the floating bottom navigation bar.
 *
 * ── PREMIUM OTT REDESIGN (visual only) ─────────────────────────────
 *  - Selected item sits inside a soft pill background (warm cinematic)
 *  - Inactive icons muted (var(--text-dim))
 *  - Large icons (24px), generous touch target
 *  - Smooth indicator transition (pill background fades in/out)
 *  - Active icon is FILLED per spec; inactive is OUTLINE
 *  - Focus-visible ring uses the global baseline.
 *  - aria-current="page" on the active tab for screen readers.
 *  - Touch target is exactly var(--nav-height) (4rem = 64px) — meets
 *    WCAG 2.5.5 (minimum 44px) with comfortable margin.
 *
 * No logic, props, or ARIA semantics changed — only styling.
 */
const NavButton: Component<Props> = (props) => {
  const color = createMemo(() =>
    props.active ? "var(--text-strong)" : "var(--text-dim)"
  );

  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      class="flex flex-1 flex-col items-center justify-center gap-1 relative focus-ring"
      style={{
        color: color(),
        height: "100%",
        "border-radius": "var(--radius-pill)",
        padding: "8px 4px",
        opacity: props.disabled ? "0.4" : "1",
        cursor: props.disabled ? "not-allowed" : "pointer",
        background: props.active
          ? "color-mix(in srgb, var(--p) 22%, transparent)"
          : "transparent",
        "box-shadow": props.active
          ? "inset 0 0 0 1px color-mix(in srgb, var(--p) 35%, transparent), 0 0 16px var(--p-glow)"
          : "none",
        transition:
          "color var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-spring)",
      }}
      aria-current={props.active ? "page" : undefined}
      aria-label={props.label}
    >
      <span
        style={{
          display: "inline-flex",
          transition: "transform var(--dur-base) var(--ease-spring)",
          transform: props.active ? "scale(1.06)" : "scale(1)",
        }}
      >
        <Icon
          name={props.icon}
          fill={props.active}
        />
      </span>

      <span
        style={{
          "font-family": "'Inter', 'Outfit', sans-serif",
          "font-size": "10px",
          "font-weight": props.active ? 700 : 600,
          "letter-spacing": "0.02em",
          "text-transform": "uppercase",
          transition: "color var(--dur-base) var(--ease-out)",
        }}
      >
        {props.label}
      </span>
    </button>
  );
};

export default NavButton;
