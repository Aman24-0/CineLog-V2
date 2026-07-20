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
 *   useProfile.ts        — ProfileRepository adapter
 *   index.ts             — this barrel
 */

export { useProfile } from "./useProfile";
export type { UseProfileReturn } from "./useProfile";
