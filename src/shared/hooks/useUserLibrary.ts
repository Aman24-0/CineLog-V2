/**
 * CineLog V2 — Shared User Library Hook
 * ---------------------------------------------------------------------
 * Phase 10.2 — Shared User Library Layer
 *
 * The SOLE vault data source for Dashboard, Discover, and any future
 * feature that needs the user's watchlist. Fetches vault items + episode
 * progress from Supabase in 2 queries, exposes them as reactive signals.
 *
 * Architecture:
 *   Dashboard → useUserLibrary → userLibraryAdapter → DashboardRepository → Supabase
 *   Discover  → useUserLibrary → userLibraryAdapter → DashboardRepository → Supabase
 *
 * This hook contains NO feature-specific logic. It only loads and exposes
 * the user's library. Dashboard-specific stats, Discover taste profiles,
 * TMDB calls, and recommendation engines belong in their respective
 * feature folders — NOT here.
 *
 * Both Dashboard and Discover call this hook. Since SolidJS context is
 * tree-scoped, each consumer gets its own instance (no shared state
 * between features). If a future optimization wants to share the fetch
 * across features, wrap this in a Context Provider at the app root.
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import { fetchUserLibrary, getUserId } from "./userLibraryAdapter";
import type { WatchlistItem } from "~/shared/types";

export interface UserLibrary {
  /** The user's vault items (with episode progress enrichment for TV). */
  readonly watchlist: () => WatchlistItem[];
  /** True while the initial fetch is in flight. */
  readonly loading: () => boolean;
  /** True when no user is signed in. */
  readonly isGuest: () => boolean;
  /** Last fetch error message (null on success). */
  readonly error: () => string | null;
  /** Re-fetch the vault from Supabase. */
  readonly refresh: () => Promise<void>;
}

/**
 * useUserLibrary — the shared vault data source.
 *
 * Call inside a Solid component. The hook fetches the vault on mount
 * and re-fetches on auth state changes. Call `refresh()` after a vault
 * mutation to re-fetch the latest data.
 *
 * Both Dashboard and Discover use this hook. No feature-to-feature
 * dependency — both go through the same shared layer → DashboardRepository.
 */
export function useUserLibrary(): UserLibrary {
  const [watchlist, setWatchlist] = createSignal<WatchlistItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [isGuest, setIsGuest] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  let unsubAuth: (() => void) | null = null;

  const doFetch = async () => {
    const userId = getUserId();
    if (!userId) {
      setWatchlist([]);
      setIsGuest(true);
      setLoading(false);
      return;
    }

    setIsGuest(false);
    setLoading(true);
    setError(null);
    try {
      const items = await fetchUserLibrary(userId);
      setWatchlist(items);
      setLoading(false);
    } catch (err) {
      console.error("[useUserLibrary] Fetch error:", err);
      setError("Failed to load your library.");
      setLoading(false);
    }
  };

  onMount(() => {
    doFetch();
    const subscription = onSessionChange(() => {
      doFetch();
    });
    unsubAuth = () => subscription.unsubscribe();
  });

  onCleanup(() => {
    if (unsubAuth) unsubAuth();
  });

  return {
    watchlist,
    loading,
    isGuest,
    error,
    refresh: doFetch
  };
}
