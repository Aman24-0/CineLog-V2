import { JSX, createMemo, startTransition, type Component } from "solid-js";
import Icon from "./Icon";

type Props = {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
};

/**
 * NavButton — single tab in the bottom navigation bar.
 *
 * Polished:
 *  - Smooth color transition on hover/active (var(--dur-base)).
 *  - Active indicator (bottom bar) animates its width via CSS transition
 *    instead of mount/unmount, so it feels like a continuous indicator
 *    rather than a flash.
 *  - Icon scales up very slightly when active (1.08) for a subtle
 *    "lift" that reinforces the selected state.
 *  - Focus-visible ring uses the global baseline.
 *  - aria-current="page" on the active tab for screen readers.
 *  - Touch target is exactly var(--nav-height) (4rem = 64px) — meets
 *    WCAG 2.5.5 (minimum 44px) with comfortable margin.
 */
const NavButton: Component<Props> = (props) => {
  const color = createMemo(() =>
    props.active ? "var(--p)" : "var(--text-muted)"
  );

  return (
    <button
      type="button"
      onClick={(e) => {
        if (!props.onClick) return;
        startTransition(() => props.onClick?.(e));
      }}
      disabled={props.disabled}
      class="flex flex-1 flex-col items-center justify-center gap-1 relative focus-ring"
      style={{
        color: color(),
        height: "var(--nav-height)",
        opacity: props.disabled ? "0.4" : "1",
        cursor: props.disabled ? "not-allowed" : "pointer",
        transition: "color var(--dur-base) var(--ease-out)",
      }}
      aria-current={props.active ? "page" : undefined}
    >
      <span
        style={{
          display: "inline-flex",
          transition: "transform var(--dur-base) var(--ease-spring)",
          transform: props.active ? "scale(1.08)" : "scale(1)",
        }}
      >
        <Icon
          name={props.icon}
          fill={props.active}
        />
      </span>

      <span
        style={{
          "font-family": "'Azeret Mono', monospace",
          "font-size": "9px",
          "font-weight": 700,
          "letter-spacing": "0.08em",
          "text-transform": "uppercase",
          transition: "color var(--dur-base) var(--ease-out)",
        }}
      >
        {props.label}
      </span>

      {/* Active indicator — always rendered, width animates 0 ↔ 20px */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "calc(var(--nav-safe-area) + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          width: props.active ? "20px" : "0px",
          height: "2px",
          "border-radius": "2px",
          background: "var(--p)",
          "box-shadow": "0 0 8px var(--p-glow)",
          transition:
            "width var(--dur-base) var(--ease-spring), opacity var(--dur-base) var(--ease-out)",
          opacity: props.active ? "1" : "0",
        }}
      />
    </button>
  );
};

export default NavButton;
