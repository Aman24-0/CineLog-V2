// src/shared/data/watchActivity.ts
//
// Shared vocabulary for the user's "where I watched" + "which platform"
// activity fields. Used by:
//   • DetailsEditForm.tsx — the picker in the Edit Activity modal
//   • YourActivityCard.tsx — the read-only summary on the Details page
//
// Keeping the vocabulary here (instead of inline in DetailsEditForm) means
// the read-back card and the edit form use the SAME labels/emojis, so a
// value saved in the edit form always displays with a matching label in
// the summary. Previously the labels only lived inside DetailsEditForm,
// which meant YourActivityCard had to invent its own mapping — and any
// drift between the two would silently show the wrong label.
//
// PRODUCT SCOPE: this file is the single source of truth for the
// "where did you watch?" device vocabulary AND the special "other"
// platform sentinel. The published JustWatch/Supabase provider
// catalogue (usePublishedProviderCatalog) is NOT duplicated here —
// that catalogue is the source of truth for normal OTT platforms.

/**
 * The special platform value that represents "watched somewhere outside
 * the OTT/platform catalogue" — e.g. a pirated stream, a downloaded file,
 * a physical disc, etc. This is a UI-only sentinel: it is NOT added to
 * the Supabase `justwatch_provider_catalog` table (that table is the
 * admin-controlled OTT provider list). The value is persisted verbatim
 * to `vault.watch_platform` (a TEXT column with no CHECK constraint).
 *
 * When the Edit form reads back `watchPlatform === "other"`, the pirate
 * tile is highlighted. When YourActivityCard renders `watchPlatform ===
 * "other"`, it shows the pirate flag emoji + "Other / Outside OTT".
 */
export const OTHER_PLATFORM_VALUE = "other" as const;

/**
 * Human-readable label + emoji for the special "other" platform.
 * Used by PlatformSelector (DetailsEditForm) and YourActivityCard.
 */
export const OTHER_PLATFORM_META = {
  value: OTHER_PLATFORM_VALUE,
  label: "Other / Outside OTT",
  emoji: "🏴‍☠️"
} as const;

/**
 * The "where did you watch?" device vocabulary.
 *
 * Values are lowercase snake_case strings, persisted verbatim to
 * `vault.watch_device`. The `theatre` option is only available for
 * movies (TV series are not watched in theatres) — that gating is done
 * in DetailsEditForm, NOT here (the vocabulary itself is shared).
 */
export const WATCH_DEVICE_OPTIONS = [
  { value: "tv", label: "TV", emoji: "📺" },
  { value: "computer", label: "Computer", emoji: "💻" },
  { value: "tablet", label: "Tablet", emoji: "📱" },
  { value: "mobile", label: "Mobile", emoji: "📱" }
] as const;

/**
 * The "theatre" device option — only included for movies. Kept as a
 * separate constant so the edit form can conditionally prepend it to
 * the base list without modifying the shared list.
 */
export const WATCH_DEVICE_OPTION_THEATRE = {
  value: "theatre",
  label: "Theatre",
  emoji: "🎬"
} as const;

/**
 * Resolve a watch-device value to its display metadata (emoji + label).
 * Returns null for unknown / unset values so the caller can hide the row
 * rather than show a meaningless placeholder.
 *
 * Used by YourActivityCard. The edit form uses the raw lists directly
 * (it needs to render every option, not just resolve one).
 */
export function resolveWatchDevice(
  value: string | null | undefined
): { emoji: string; label: string } | null {
  if (!value) return null;
  const all = [
    ...WATCH_DEVICE_OPTIONS,
    WATCH_DEVICE_OPTION_THEATRE
  ];
  for (const opt of all) {
    if (opt.value === value) {
      return { emoji: opt.emoji, label: opt.label };
    }
  }
  return null;
}

/**
 * Resolve a watch-platform value to its display metadata.
 *
 * For normal JustWatch/Supabase catalogue platforms, the caller should
 * pass the provider's `clearName` and `icon` from the published catalogue.
 * This helper handles ONLY the special "other" sentinel and returns
 * null for any other value — the caller is responsible for looking up
 * the catalogue entry by `technicalName` and using its clearName/icon.
 *
 * Returns:
 *   - For "other": { emoji: "🏴‍☠️", label: "Other / Outside OTT" }
 *   - For any other value: null (caller resolves via the catalogue)
 *   - For null/undefined: null (caller hides the row)
 */
export function resolveOtherPlatform(
  value: string | null | undefined
): { emoji: string; label: string } | null {
  if (!value) return null;
  if (value === OTHER_PLATFORM_VALUE) {
    return { emoji: OTHER_PLATFORM_META.emoji, label: OTHER_PLATFORM_META.label };
  }
  return null;
}
