// src/features/settings/components/AccentSwatch.tsx
//
// AccentSwatch — a single color swatch for the accent color picker.
//
// Two variants:
//   1. "preset" — a solid color circle. Click selects that color.
//   2. "dynamic" — a gradient circle with an "auto" icon. Click triggers
//      the parent to extract the dominant color from the user's banner
//      image and set it as the accent.
//
// The selected swatch shows a ring around it. Both variants are
// keyboard-focusable and have an aria-label that screen readers can
// announce.
//
// PROPS:
//   - variant: "preset" | "dynamic"
//   - id: unique identifier (theme id for preset, "dynamic" for dynamic)
//   - label: display name shown below the swatch
//   - color: hex color string (preset only; ignored for dynamic)
//   - dynamicColor: the extracted color (dynamic only; shown when active)
//   - selected: whether this swatch is currently the active accent
//   - onSelect: callback when swatch is clicked

import { Show, type Component } from "solid-js";

type AccentSwatchVariant = "preset" | "dynamic";

interface AccentSwatchProps {
  variant: AccentSwatchVariant;
  id: string;
  label: string;
  color?: string;
  dynamicColor?: string;
  selected: boolean;
  onSelect: () => void;
}

const AccentSwatch: Component<AccentSwatchProps> = (props) => {
  // For preset: use the static color.
  // For dynamic: if we have an extracted color AND we're selected, show
  //   that color (so the user can see what was extracted). Otherwise
  //   show the gradient (indicating "auto / dynamic").
  const swatchStyle = () => {
    if (props.variant === "preset") {
      return { background: props.color ?? "#FFD700" };
    }
    // Dynamic
    if (props.selected && props.dynamicColor) {
      return { background: props.dynamicColor };
    }
    return {
      background:
        "conic-gradient(from 0deg, #ff2d55, #ff7e34, #ffd700, #34c759, #00c2ff, #9d4edd, #ff2af0, #ff2d55)"
    };
  };

  return (
    <button
      type="button"
      class="accent-swatch focus-ring"
      data-active={props.selected}
      data-variant={props.variant}
      onClick={() => props.onSelect()}
      aria-pressed={props.selected}
      aria-label={`${props.label} accent${props.variant === "dynamic" ? " (auto from banner)" : ""}`}
    >
      <div class="accent-swatch-circle" style={swatchStyle()}>
        {/* Dynamic variant shows an "auto" icon in the center when
            not currently selected, so users can tell it's the
            "automatic" option. */}
        <Show when={props.variant === "dynamic" && !props.selected}>
          <span
            class="material-symbols-outlined accent-swatch-auto-icon"
            aria-hidden="true"
          >
            auto_awesome
          </span>
        </Show>
        {/* Selected checkmark for preset */}
        <Show when={props.variant === "preset" && props.selected}>
          <span
            class="material-symbols-outlined accent-swatch-check"
            aria-hidden="true"
          >
            check
          </span>
        </Show>
      </div>
      <span class="accent-swatch-label">{props.label}</span>
    </button>
  );
};

export default AccentSwatch;
