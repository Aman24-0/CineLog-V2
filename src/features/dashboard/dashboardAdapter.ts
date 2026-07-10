/**
 * CineLog V2 — Dashboard Adapter (delegates to shared User Library)
 * ---------------------------------------------------------------------
 * Phase 10.2 — Shared User Library Layer
 *
 * The vault-fetching logic has been extracted to `userLibraryAdapter.ts`
 * (in `src/shared/hooks/`). This file re-exports the shared types for
 * backwards compatibility and provides the dashboard-specific stat shape.
 *
 * Architecture:
 *   DashboardPage → useDashboardData → useUserLibrary → userLibraryAdapter → DashboardRepository → Supabase
 *
 * No duplicate fetch logic. No feature-to-feature dependency.
 */

// Re-export the shared vault row → WatchlistItem mapping for any
// dashboard code that still references it directly.
export { vaultRowToWatchlistItem as vaultRowToItem } from "~/shared/hooks/userLibraryAdapter";

// Re-export the shared types for backwards compatibility.
export type { WatchlistItem } from "~/shared/types";

// Dashboard-specific stat shape (derived client-side from the watchlist).
export interface DashboardStatValues {
  readonly total: number;
  readonly watching: number;
  readonly completed: number;
  readonly planned: number;
  readonly favorites: number;
  readonly pinned: number;
}

// Legacy type alias — the old fetchDashboardData returned this shape.
// Kept for type compatibility with any code that references it.
export interface DashboardDataPayload {
  readonly watchlist: import("~/shared/types").WatchlistItem[];
  readonly stats: DashboardStatValues;
  readonly isGuest: boolean;
}
