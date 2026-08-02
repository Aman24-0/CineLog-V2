// src/core/feature-flags/defaults.ts
//
// Single source of truth for CineLog's feature flag registry.
//
// WHY THIS FILE EXISTS
// ────────────────────
// Before this module existed, the flag list was duplicated in three places:
//   1. AdminFeatureFlagsPage.tsx (UI metadata: name, description, icon, default)
//   2. /api/admin/feature-flags.ts (inline defaults returned when no DB row exists)
//   3. The Supabase migration seed (initial DB row)
//
// Adding a new flag required editing all three places, and they had drifted:
// the API returned plain `true`/`false` defaults while the UI carried rich
// metadata (description, icon, enforced_in).
//
// This module exports:
//   • FEATURE_FLAG_METADATA — array of { name, description, icon, enforced_in, default_value }
//   • FEATURE_FLAG_DEFAULTS — a plain Record<string, boolean> derived from the metadata
//
// The admin API imports FEATURE_FLAG_DEFAULTS (used when no DB row exists).
// The admin UI imports FEATURE_FLAG_METADATA (renders the toggle cards).
// The migration seed is the ONLY place that should hard-code the SQL INSERT —
// it does not import this module (migrations run before the app is deployed).

export interface FlagMeta {
  name: string;
  description: string;
  icon: string;
  /** Where this flag is enforced in the consumer app. */
  enforced_in: string;
  default_value: boolean;
}

/**
 * Canonical list of all feature flags known to CineLog.
 *
 * To add a new flag:
 *   1. Add an entry here.
 *   2. Add the same flag (with the same default) to the migration seed
 *      `supabase/migrations/*_seed_feature_flags.sql` (or a new migration
 *      that ALTERs the existing row's JSONB value).
 *
 * The admin UI reads this list to render toggle cards.
 * The admin API reads FEATURE_FLAG_DEFAULTS (derived below) to return
 *   defaults when no DB row exists yet.
 */
export const FEATURE_FLAG_METADATA: readonly FlagMeta[] = [
  {
    name: "imdb_integration",
    description:
      "Show IMDb ratings alongside TMDB ratings on movie/TV detail pages.",
    icon: "🎭",
    enforced_in: "Details modal (DetailsRatings), MovieCardRatings",
    default_value: true
  },
  {
    name: "streaming_button",
    description:
      "Show 'Where to Watch' streaming provider buttons on detail pages.",
    icon: "📺",
    enforced_in: "Details modal (WhereToWatch component)",
    default_value: true
  },
  {
    name: "upcoming",
    description:
      "Show the 'Upcoming' section in Discover and the upcoming releases page in Profile.",
    icon: "📅",
    enforced_in: "DiscoverPage, /profile/upcoming",
    default_value: true
  },
  {
    name: "random_picker",
    description: "Show the 'Surprise Me' random-picker card on Discover.",
    icon: "🎲",
    enforced_in: "DiscoverPage (Surprise Me section)",
    default_value: true
  },
  {
    name: "ai_recommendations",
    description:
      "Enable AI-powered personalized recommendations. Requires backend integration.",
    icon: "🤖",
    enforced_in: "DiscoverPage (Because You Love... section)",
    default_value: false
  },
  {
    name: "experimental_features",
    description:
      "Enable experimental features that may be unstable or incomplete.",
    icon: "🧪",
    enforced_in: "Various — used as a gate for in-development features",
    default_value: false
  }
] as const;

/**
 * Plain `{ [flagName]: boolean }` map of defaults, derived from
 * FEATURE_FLAG_METADATA. Used by the admin API to return defaults
 * when no DB row exists yet.
 */
export const FEATURE_FLAG_DEFAULTS: Readonly<Record<string, boolean>> =
  Object.fromEntries(
    FEATURE_FLAG_METADATA.map((f) => [f.name, f.default_value])
  );

/**
 * Set of known flag names. Used by the admin API to validate incoming
 * PUT requests — unknown flag names are rejected with a 400 error.
 *
 * (This is a tightening of the previous behavior, which accepted any
 * snake_case key. The frontend UI only shows flags from FEATURE_FLAG_METADATA,
 * so accepting unknown keys would let clients set flags that have no effect.)
 */
export const KNOWN_FLAG_NAMES: ReadonlySet<string> = new Set(
  FEATURE_FLAG_METADATA.map((f) => f.name)
);
