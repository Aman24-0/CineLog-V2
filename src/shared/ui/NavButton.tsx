import { JSX, Show } from "solid-js";
import Icon from "./Icon";

type Props = {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
};

export default function NavButton(props: Props) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      class="flex flex-1 flex-col items-center justify-center gap-1 transition-all relative"
      style={{
        color: props.active ? "var(--p)" : "rgba(232,234,240,0.42)",
        // Button fills the bar height (4rem); the safe-area sits below it.
        height: "var(--nav-height)",
        opacity: props.disabled ? "0.4" : "1",
        cursor: props.disabled ? "not-allowed" : "pointer"
      }}
      aria-current={props.active ? "page" : undefined}
    >
      <Icon
        name={props.icon}
        fill={props.active}
      />

      <span class="text-[10px] font-semibold tracking-wide">
        {props.label}
      </span>

      <Show when={props.active}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: "var(--nav-safe-area)",
            left: "50%",
            transform: "translateX(-50%)",
            width: "20px",
            height: "2px",
            "border-radius": "2px",
            background: "var(--p)",
            "box-shadow": "0 0 8px var(--p-glow)"
          }}
        />
      </Show>
    </button>
  );
}
