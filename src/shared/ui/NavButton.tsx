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
      onClick={(e) => props.onClick?.(e)}
      disabled={props.disabled}
      class="focus-ring relative flex flex-1 flex-col items-center justify-center gap-1"
      style={{
        color: color(),
        height: "var(--nav-height)",
        opacity: props.disabled ? "0.4" : "1",
        cursor: props.disabled ? "not-allowed" : "pointer",
        transition: "color var(--dur-base) var(--ease-out)"
      }}
      aria-current={props.active ? "page" : undefined}
      aria-label={props.label}
    >
      <span
        style={{
          display: "inline-flex",
          transition: "transform var(--dur-base) var(--ease-spring)",
          transform: props.active ? "scale(1.08)" : "scale(1)"
        }}
      >
        <Icon name={props.icon} fill={props.active} />
      </span>

      <span
        style={{
          "font-family": "'Azeret Mono', monospace",
          "font-size": "9px",
          "font-weight": 700,
          "letter-spacing": "0.08em",
          "text-transform": "uppercase",
          transition: "color var(--dur-base) var(--ease-out)"
        }}
      >
        {props.label}
      </span>

      {/* Active indicator — glowing dot above label */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "10px",
          left: "50%",
          transform: "translateX(-50%)",
          width: props.active ? "4px" : "0px",
          height: props.active ? "4px" : "0px",
          "border-radius": "50%",
          background: "var(--p)",
          "box-shadow": "0 0 8px var(--p-glow), 0 0 16px var(--p-glow)",
          transition:
            "width var(--dur-base) var(--ease-spring), height var(--dur-base) var(--ease-spring), opacity var(--dur-base) var(--ease-out)",
          opacity: props.active ? "1" : "0"
        }}
      />
    </button>
  );
};

export default NavButton;
