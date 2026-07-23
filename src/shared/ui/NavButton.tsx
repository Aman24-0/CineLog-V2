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
 * Premium redesign:
 *  - Smooth color transition on hover/active
 *  - Active indicator: subtle filled circle behind active icon (Dulo.tv style)
 *  - Icon scales up very slightly when active for a gentle "lift"
 *  - Comfortable icon spacing — items never feel crowded
 *  - Focus-visible ring uses the global baseline
 *  - aria-current="page" on the active tab
 */
const NavButton: Component<Props> = (props) => {
  const color = createMemo(() =>
    props.active ? "var(--p)" : "var(--text-muted)"
  );

  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      class="flex flex-1 flex-col items-center justify-center gap-1.5 relative focus-ring"
      style={{
        color: color(),
        height: "var(--nav-height)",
        opacity: props.disabled ? "0.35" : "1",
        cursor: props.disabled ? "not-allowed" : "pointer",
        transition: "color var(--dur-base) var(--ease-out)",
      }}
      aria-current={props.active ? "page" : undefined}
      aria-label={props.label}
    >
      <span
        style={{
          display: "inline-flex",
          transition: "transform var(--dur-base) var(--ease-spring)",
          transform: props.active ? "scale(1.10)" : "scale(1)",
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
          "font-size": "8px",
          "font-weight": 700,
          "letter-spacing": "0.05em",
          "text-transform": "uppercase",
          transition: "color var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)",
          opacity: props.active ? "1" : "0.7",
        }}
      >
        {props.label}
      </span>

      {/* Active indicator — subtle pill dot instead of bar (Dulo.tv feel) */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "calc(var(--nav-height) - 22px)",
          left: "50%",
          transform: "translateX(-50%)",
          width: props.active ? "20px" : "0px",
          height: "3px",
          "border-radius": "3px",
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
