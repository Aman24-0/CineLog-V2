// src/shared/ui/ReactionPicker.tsx
//
// Common reaction picker — shared by the Movie/TV Activity Edit modal
// and the Episode Rating dialog. Renders a responsive grid of emoji
// reaction tiles; clicking a tile selects/deselects it (single
// selection — tapping the active reaction clears it).
//
// The vocabulary is from `src/shared/data/reactions.ts` (the common
// set: loved_it, funny, sad, shocked, scared, thoughtful, angry,
// bored). Old episode reactions are normalized via
// `normalizeReaction` before being passed to this component, so the
// picker always works with the common vocabulary regardless of what's
// stored in the DB.
//
// Visual design (adapted to CineLog's dark glass language):
//   - Grid of tiles, 4 per row on mobile, 8 on desktop (wraps).
//   - Each tile: emoji + label, centered.
//   - Selected tile: accent border + accent-tinted background +
//     subtle glow.
//   - Unselected tile: subtle glass background + muted border.
//   - Hover/focus: slightly brighter border.
//   - Accessible: each tile is a <button> with aria-pressed.

import { For, type Component } from "solid-js";
import {
  COMMON_REACTIONS,
  REACTION_META,
  isCommonReaction,
  type CommonReaction
} from "~/shared/data/reactions";

export interface ReactionPickerProps {
  /** Currently selected reaction (normalized to common vocabulary). */
  value: CommonReaction | null;
  /** Called when the user selects/deselects a reaction. `null` = cleared. */
  onChange: (reaction: CommonReaction | null) => void;
  /** Whether the picker is disabled (e.g. while saving). */
  disabled?: boolean;
}

/**
 * ReactionPicker — a responsive grid of emoji reaction tiles.
 *
 * Single selection: tapping the active reaction clears it (toggles
 * to null). Tapping a different reaction selects it.
 */
const ReactionPicker: Component<ReactionPickerProps> = (props) => {
  const handleToggle = (reaction: CommonReaction) => {
    if (props.disabled) return;
    // Toggle: if already selected, clear it.
    if (props.value === reaction) {
      props.onChange(null);
      return;
    }
    props.onChange(reaction);
  };

  return (
    <div
      class="reaction-picker"
      role="group"
      aria-label="Reaction selector"
    >
      <For each={COMMON_REACTIONS}>
        {(reaction) => {
          const meta = REACTION_META[reaction];
          const isSelected = () => props.value === reaction;
          return (
            <button
              type="button"
              class="reaction-tile"
              classList={{
                "reaction-tile-selected": isSelected(),
                "reaction-tile-disabled": !!props.disabled
              }}
              onClick={() => handleToggle(reaction)}
              disabled={props.disabled}
              aria-pressed={isSelected()}
              aria-label={`${meta.label} reaction${isSelected() ? " (selected)" : ""}`}
              title={meta.label}
            >
              <span class="reaction-tile-emoji" aria-hidden="true">
                {meta.emoji}
              </span>
              <span class="reaction-tile-label">{meta.label}</span>
            </button>
          );
        }}
      </For>
    </div>
  );
};

export default ReactionPicker;

// Re-export the type + helpers for convenience so callers don't need
// to import from two places.
export { isCommonReaction, type CommonReaction };
