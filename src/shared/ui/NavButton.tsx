import { JSX } from "solid-js";
import Icon from "./Icon";

type Props = {
  icon: string;
  label: string;
  active?: boolean;
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
};

export default function NavButton(props: Props) {
  return (
    <button
      onClick={props.onClick}
      class="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-all"
      style={{
        color: props.active ? "var(--p)" : "#666"
      }}
    >
      <Icon
        name={props.icon}
        fill={props.active}
      />

      <span class="text-[10px] font-semibold">
        {props.label}
      </span>
    </button>
  );
}
