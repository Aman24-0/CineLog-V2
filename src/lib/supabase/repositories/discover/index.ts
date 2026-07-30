/**
 * CineLog V2 — Discover Repository (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the Supabase Discover Repository. Application
 * code should import from here (or from the parent
 * `repositories/index.ts`) so the internal file layout can evolve
 * without touching call-sites.
 *
 * Module structure (Single Responsibility, files kept < 250 lines):
 *   discover.types.ts        — shared types (membership, context, results)
 *   discover.utils.ts        — error normalisation, column lists
 *   discover.read.ts         — vault + collection membership reads
 *   discover.universes.ts    — curated-universe membership + subscriptions
 *   discover.context.ts      — aggregated DiscoverMetadata / UserMediaContext
 *   discover.repository.ts   — main class composing all modules
 *   index.ts                 — this barrel
 *
 * The DiscoverRepository is READ-ONLY. It answers "what is this
 * media's relationship to the user's library?" — no TMDB requests,
 * no recommendation engine, no external API integration.
 */

export {
  DiscoverRepository,
  getDiscoverRepository
} from "./discover.repository";

export type {
  // Row aliases — CuratedUniverseRow / CuratedUniverseEntryRow /
  // UserUniverseSubscriptionRow are unique to this barrel.
  // VaultRow / CollectionRow / CollectionEntryRow / MediaType are
  // already exported from the vault / collection barrels (same
  // generated types); they are intentionally NOT re-exported here to
  // avoid duplicate identifier errors in the parent barrel.
  CuratedUniverseRow,
  CuratedUniverseEntryRow,
  UserUniverseSubscriptionRow,
  // Identity types
  MediaIdentity,
  UserMediaIdentity,
  // Result shapes
  VaultState,
  CollectionMembership,
  UniverseMembership,
  DiscoverMetadata,
  UserMediaContext,
  // Result wrappers
  DiscoverResult,
  DiscoverListResult,
  DiscoverBooleanResult
} from "./discover.types";
