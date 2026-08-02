// src/features/settings/components/ThemeCard.tsx
//
// ThemeCard — visual theme picker card.
//
// One card per theme mode (Dark / Light / System). Clicking the card
// selects that theme. The selected card shows a checkmark in the
// corner and gets a highlighted border.
//
// Each card contains a tiny "preview" — three stacked rectangles that
// represent:
//   1. The background color of that theme
//   2. A "card" surface on top of the background
//   3. An accent-colored stripe (showing the current accent)
//
// This gives the user a visual sense of what each theme looks like
// before they tap it, instead of just seeing three text labels.
//
// PROPS:
//   - id: unique identifier for the theme ("dark" / "light" / "system")
//   - label: display name ("Dark", "Light", "System")
//   - selected: whether this card is currently selected
//   - onSelect: callback when the card is clicked
//   - preview: { bg, surface, text, accent } colors for the mini preview

import { Show, type Component } from "solid-js";

export interface ThemePreview {
  /** Page background. */
  bg: string;
  /** Card / surface color. */
  surface: string;
  /** Text color. */
  text: string;
  /** Accent color stripe (uses --p, the current accent). */
  accent: string;
}

interface ThemeCardProps {
  id: string;
  label: string;
  desc: string;
  selected: boolean;
  onSelect: () => void;
  preview: ThemePreview;
}

const ThemeCard: Component<ThemeCardProps> = (props) => {
  return (
    <button
      type="button"
      class="theme-card-v2 focus-ring"
      data-active={props.selected}
      onClick={() => props.onSelect()}
      aria-pressed={props.selected}
      aria-label={`Theme: ${props.label}`}
    >
      {/* Selected checkmark — top-right corner */}
      <Show when={props.selected}>
        <span class="theme-card-v2-check" aria-hidden="true">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "14px" }}
            aria-hidden="true"
          >
            check
          </span>
        </span>
      </Show>

      {/* Mini preview — 3 stacked rectangles showing the theme's look */}
      <div
        class="theme-card-v2-preview"
        style={{ background: props.preview.bg }}
        aria-hidden="true"
      >
        {/* Surface card on top of background */}
        <div
          class="theme-card-v2-preview-surface"
          style={{
            background: props.preview.surface,
            "border-color": props.preview.text
          }}
        >
          {/* Text line */}
          <div
            class="theme-card-v2-preview-text"
            style={{ background: props.preview.text }}
          />
          {/* Accent stripe */}
          <div
            class="theme-card-v2-preview-accent"
            style={{ background: props.preview.accent }}
          />
        </div>
      </div>

      {/* Label + description */}
      <div class="theme-card-v2-meta">
        <span class="theme-card-v2-label">{props.label}</span>
        <span class="theme-card-v2-desc">{props.desc}</span>
      </div>
    </button>
  );
};

export default ThemeCard;
