/**
 * CineLog V2 — User Library Provider (Single Source of Truth)
 * ---------------------------------------------------------------------
 * Phase 10.3 — Shared User Library State
 *
 * The SINGLE owner of user library state across the entire application.
 * Mounted once at the app root. Every feature (Dashboard, Discover,
 * Search, Details, Collections, Vault) consumes this via `useUserLibrary()`.
 *
 * Architecture:
 *   App → UserLibraryProvider → useUserLibrary() → all features
 *
 * Guarantees:
 *   • ONE fetch (provider fetches on mount; consumers never fetch)
 *   • ONE auth subscription (provider subscribes to onSessionChange)
 *   • ONE refresh function (provider.reload(); all consumers update)
 *   • ONE state (signals live in the provider, not in each hook call)
 *   • ONE cache (watchlist + loading + error cached until refresh/auth change)
 *
 * The provider contains NO feature-specific logic. No dashboard stats,
 * no discover taste profiles, no TMDB calls, no recommendation engines.
 * It only loads and exposes the user's vault.
 */

import { createContext, useContext, createSignal, createEffect, onMount, onCleanup, ParentComponent } from "solid-js";
import { onSessionChange } from "~/lib/supabase/session";
import { fetchUserLibrary, getUserId } from "./userLibraryAdapter";
import { useAuth } from "~/shared/hooks/useAuth";
import type { WatchlistItem } from "~/shared/types";

// ---------------------------------------------------------------------------
// Public interface (what consumers see)
// ---------------------------------------------------------------------------

export interface UserLibrary {
  readonly watchlist: () => WatchlistItem[];
  readonly loading: () => boolean;
  readonly isGuest: () => boolean;
  readonly error: () => string | null;
  readonly refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const UserLibraryContext = createContext<UserLibrary>();

// ---------------------------------------------------------------------------
// Provider — owns the SINGLE state instance
// ---------------------------------------------------------------------------

export const UserLibraryProvider: ParentComponent = (props) => {
  const { authReady, user } = useAuth();
  const [watchlist, setWatchlist] = createSignal<WatchlistItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [isGuest, setIsGuest] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  /**
   * The ONE fetch function. Called on mount and on auth state change.
   * Consumers call `refresh()` which delegates to this.
   */
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
      console.error("[UserLibraryProvider] Fetch error:", err);
      setError("Failed to load your library.");
      setLoading(false);
    }
  };

  /**
   * The ONE auth subscription. Mounted once in the provider.
   * On session change: clears cache, reloads library.
   *
   * Wrapped in try/catch so missing env vars (e.g. during first Vercel
   * deploy before env vars are set) don't crash the client — the app
   * still renders, just without auth/session tracking.
   *
   * The subscription is cleaned up on unmount via onCleanup to prevent
   * a memory leak (the subscription holds a reference to the Supabase
   * auth channel, which would otherwise linger after the provider
   * unmounts during HMR or route transitions).
   */
  onMount(() => {
    doFetch();
    try {
      const subscription = onSessionChange(() => {
        doFetch();
      });
      onCleanup(() => subscription.unsubscribe());
    } catch (err) {
      console.error("[UserLibraryProvider] Auth subscription failed:", err);
    }
  });

  // Re-fetch when auth state changes (sign-in / sign-out / OAuth redirect).
  // This is the reactive bridge between useAuth's signals and the library
  // fetch. Without this, the library would only re-fetch on the
  // onSessionChange callback, which might miss the initial session
  // detection from checkInitialSession().
  createEffect(() => {
    if (authReady() && user()) {
      doFetch();
    }
  });

  const library: UserLibrary = {
    watchlist,
    loading,
    isGuest,
    error,
    refresh: doFetch
  };

  return (
    <UserLibraryContext.Provider value={library}>
      {props.children}
    </UserLibraryContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// useUserLibrary — pure context consumer (NO fetching, NO state)
// ---------------------------------------------------------------------------

/**
 * useUserLibrary — returns the shared UserLibrary from the provider.
 *
 * This is a PURE CONTEXT CONSUMER. It does NOT fetch, does NOT create
 * signals, does NOT subscribe to auth. All of that lives in the
 * UserLibraryProvider (mounted once at the app root).
 *
 * Every component that needs the user's vault calls this hook. They all
 * read from the SAME state instance — no duplicate fetches, no duplicate
 * subscriptions, no duplicate cache.
 *
 * @throws Error if used outside a UserLibraryProvider.
 */
export function useUserLibrary(): UserLibrary {
  const ctx = useContext(UserLibraryContext);
  if (!ctx) {
    throw new Error("useUserLibrary must be used within a UserLibraryProvider");
  }
  return ctx;
}
