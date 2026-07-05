// src/shared/ui/Icon.tsx
import { Component, JSX } from "solid-js";

type IconProps = {
  name: string;
  fill?: boolean;
  class?: string;
  style?: string | JSX.CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
};

const Icon: Component<IconProps> = (props) => {
  return (
    <span
      class={`material-symbols-outlined${props.fill ? " filled" : ""}${props.class ? ` ${props.class}` : ""}`}
      style={props.style}
      aria-hidden={props["aria-hidden"] ?? true}
      aria-label={props["aria-label"]}
      role={props["aria-label"] ? "img" : undefined}
    >
      {props.name}
    </span>
  );
};

export default Icon;
