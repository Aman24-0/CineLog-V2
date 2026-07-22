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
 * Premium OTT redesign: large icons, animated active pill, smooth transitions.
 * Active icon is FILLED; inactive is OUTLINE (via Icon fill prop).
 * No logic, props, or ARIA changed.
 */
const NavButton: Component<Props> = (props) => {
  const color = createMemo(() =>
    props.active ? "#FFFFFF" : "#707070"
  );

  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      class="flex flex-1 flex-col items-center justify-center gap-1 relative focus-ring"
      style={{
        color: color(),
        height: "100%",
        "border-radius": "999px",
        padding: "8px 4px",
        opacity: props.disabled ? "0.4" : "1",
        cursor: props.disabled ? "not-allowed" : "pointer",
        background: props.active
          ? "rgba(138,98,76,0.25)"
          : "transparent",
        "box-shadow": props.active
          ? "inset 0 0 0 1px rgba(138,98,76,0.40), 0 0 16px rgba(138,98,76,0.30)"
          : "none",
        transition:
          "color 200ms ease, background 250ms cubic-bezier(0.22,1,0.36,1), box-shadow 250ms ease, transform 150ms ease",
      }}
      aria-current={props.active ? "page" : undefined}
      aria-label={props.label}
    >
      <span
        style={{
          display: "inline-flex",
          transition: "transform 250ms cubic-bezier(0.22,1,0.36,1)",
          transform: props.active ? "scale(1.05)" : "scale(1)",
        }}
      >
        <Icon name={props.icon} fill={props.active} />
      </span>
      <span
        style={{
          "font-family": "'Inter', sans-serif",
          "font-size": "10px",
          "font-weight": props.active ? 600 : 500,
          "letter-spacing": "0",
          "text-transform": "none",
          transition: "color 200ms ease",
        }}
      >
        {props.label}
      </span>
    </button>
  );
};

export default NavButton;
