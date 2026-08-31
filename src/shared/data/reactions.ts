// src/shared/data/reactions.ts
//
// Common reaction vocabulary — shared by Movie/TV Activity Edit and
// Episode Rating. Per the spec, the same reaction system is used
// consistently across both contexts.
//
// The vocabulary is a TEXT column in the DB (no CHECK constraint),
// so adding new values is safe. Old episode reactions (love, funny,
// wow, sad, angry, disappointed) are mapped to the closest new value
// at display time via normalizeLegacyReaction — the DB values are
// NOT rewritten (existing episode ratings continue to display
// correctly with their original reaction, normalized to the new
// vocabulary for the UI).

/**
 * The common reaction vocabulary used by both the Movie/TV Activity
 * Edit modal and the Episode Rating dialog.
 *
 * Values are lowercase snake_case strings, stored verbatim in the
 * `vault.reaction` and `episode_progress.reaction` TEXT columns.
 */
export const COMMON_REACTIONS = [
  "loved_it",
  "funny",
  "sad",
  "shocked",
  "scared",
  "thoughtful",
  "angry",
  "bored"
] as const;

export type CommonReaction = (typeof COMMON_REACTIONS)[number];

/**
 * Metadata for each reaction — emoji + display label. Used by the
 * ReactionPicker to render the grid.
 *
 * The emoji are the spec's exact set:
 *   😍 Loved it
 *   😂 Funny
 *   😭 Sad
 *   🤯 Shocked
 *   😱 Scared
 *   🤔 Thoughtful
 *   🤬 Angry
 *   🥱 Bored
 */
export const REACTION_META: Record<
  CommonReaction,
  { emoji: string; label: string }
> = {
  loved_it: { emoji: "😍", label: "Loved it" },
  funny: { emoji: "😂", label: "Funny" },
  sad: { emoji: "😭", label: "Sad" },
  shocked: { emoji: "🤯", label: "Shocked" },
  scared: { emoji: "😱", label: "Scared" },
  thoughtful: { emoji: "🤔", label: "Thoughtful" },
  angry: { emoji: "🤬", label: "Angry" },
  bored: { emoji: "🥱", label: "Bored" }
};

/**
 * Check whether a string is a valid common reaction.
 */
export function isCommonReaction(
  value: string | null | undefined
): value is CommonReaction {
  return (
    typeof value === "string" &&
    (COMMON_REACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Mapping from the OLD episode reaction vocabulary to the closest
 * new common reaction. Used by `normalizeReaction` so existing
 * episode ratings display correctly without rewriting the DB.
 *
 * Old → New:
 *   love        → loved_it
 *   funny       → funny   (unchanged)
 *   wow         → shocked
 *   sad         → sad     (unchanged)
 *   angry       → angry   (unchanged)
 *   disappointed → bored
 */
const LEGACY_REACTION_MAP: Record<string, CommonReaction> = {
  love: "loved_it",
  funny: "funny",
  wow: "shocked",
  sad: "sad",
  angry: "angry",
  disappointed: "bored"
};

/**
 * Normalize a reaction value to the common vocabulary.
 *
 * - If the value is already a common reaction, return it as-is.
 * - If the value is a legacy episode reaction, return the mapped
 *   common reaction.
 * - If the value is null/undefined/unknown, return null (no
 *   reaction — the UI renders the "no reaction selected" state).
 *
 * This is the safe migration strategy: old saved values are NOT
 * rewritten in the DB; they're mapped at display time. New writes
 * use the common vocabulary directly.
 */
export function normalizeReaction(
  value: string | null | undefined
): CommonReaction | null {
  if (!value) return null;
  if (isCommonReaction(value)) return value;
  const mapped = LEGACY_REACTION_MAP[value];
  return mapped ?? null;
}
