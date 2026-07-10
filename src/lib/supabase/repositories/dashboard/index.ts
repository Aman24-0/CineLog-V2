/**
 * CineLog V2 — Dashboard Repository (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the Supabase Dashboard Repository. Application
 * code should import from here (or from the parent
 * `repositories/index.ts`) so the internal file layout can evolve
 * without touching call-sites.
 *
 * Module structure (Single Responsibility, files kept < 250 lines):
 *   dashboard.types.ts       — shared types (stats, result shapes)
 *   dashboard.utils.ts       — error normalisation, pagination, count helper,
 *                              Continue Watching filter, column lists
 *   dashboard.read.ts        — read-only aggregation queries
 *   dashboard.repository.ts  — main class composing the read module
 *   index.ts                 — this barrel
 *
 * The DashboardRepository is READ-ONLY. It aggregates data from
 * `vault`, `collections`, `collection_entries`, and `episode_progress`
 * but never writes — all mutations go through the Vault / Collection
 * repositories.
 */

export { DashboardRepository, getDashboardRepository } from "./dashboard.repository";

export type {
  // Row aliases — EpisodeProgressRow is unique to this barrel.
  // VaultRow / CollectionRow / CollectionEntryRow are already exported
  // from the vault / collection barrels (they alias the same generated
  // types); they are intentionally NOT re-exported here to avoid
  // duplicate identifier errors in the parent barrel.
  EpisodeProgressRow,
  // Pagination
  DashboardPagination,
  // Stats
  VaultStatusCounts,
  VaultCounts,
  CollectionCounts,
  DashboardStats,
  // Continue Watching
  ContinueWatchingItem,
  // Result types
  DashboardResult,
  DashboardListResult
} from "./dashboard.types";
