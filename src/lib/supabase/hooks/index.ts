/**
 * CineLog V2 — Supabase Hooks (Barrel)
 * ---------------------------------------------------------------------
 * Public surface of the Supabase hook layer. UI components should
 * import hooks from here (or from the parent `src/lib/supabase/index.ts`)
 * so the internal file layout can evolve without touching call-sites.
 *
 * Architecture (Supabase Integration Guide §05):
 *
 *     Component → Hook → Repository → Supabase → Database
 *
 * Repositories are NEVER used directly by UI components — the hooks
 * are the sole bridge. Each hook:
 *   • exposes the repository's methods as async operations,
 *   • manages a shared `loading` signal (reference-counted for
 *     concurrent calls),
 *   • manages an `error` signal for unexpected throws,
 *   • stays framework-friendly for SolidStart (createSignal + onMount).
 *
 * Module structure:
 *   _shared.ts           — createAsyncState helper (loading/error tracker)
 *   useSupabaseAuth.ts   — auth + session subscription
 *   useVault.ts          — VaultRepository adapter
 *   useProfile.ts        — ProfileRepository adapter
 *   useCollections.ts    — CollectionRepository adapter
 *   useDashboard.ts      — DashboardRepository adapter (read-only)
 *   useDiscover.ts       — DiscoverRepository adapter (read-only)
 *   index.ts             — this barrel
 *
 * Phase scope
 * -----------
 * Foundation only. NOT wired into the application — the existing
 * Firebase hooks (`useAuth`, `useVault`, `useCollections`) remain the
 * sole source of truth until the migration explicitly cuts over.
 */

export { useSupabaseAuth } from "./useSupabaseAuth";
export type { UseSupabaseAuthReturn } from "./useSupabaseAuth";

export { useVault } from "./useVault";
export type { UseVaultReturn } from "./useVault";

export { useProfile } from "./useProfile";
export type { UseProfileReturn } from "./useProfile";

export { useCollections } from "./useCollections";
export type { UseCollectionsReturn } from "./useCollections";

export { useDashboard } from "./useDashboard";
export type { UseDashboardReturn } from "./useDashboard";

export { useDiscover } from "./useDiscover";
export type { UseDiscoverReturn } from "./useDiscover";
