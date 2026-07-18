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
  /** Optimistic local update — merges partial fields into one item.
   *  Replaces a full refresh() for single-item mutations. Creates a new
   *  array reference so SolidJS reactivity detects the change, but only
   *  the modified item is shallow-merged (the rest keep the same refs). */
  readonly updateItem: (itemId: string, update: Partial<WatchlistItem>) => void;
  /** Optimistic local removal — removes one item from the array.
   *  Used by delete operations to avoid a full refresh(). */
  readonly removeItem: (itemId: string) => void;
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

  // Guard: prevents concurrent duplicate fetches when multiple triggers
  // fire simultaneously (onMount + onSessionChange + createEffect can all
  // fire within the same tick on first load). Without this guard, 2-3
  // identical Supabase + TMDB round-trips fire in parallel on startup.
  let isFetching = false;

  /**
   * The ONE fetch function. Called on mount and on auth state change.
   * Consumers call `refresh()` which delegates to this.
   */
  const doFetch = async () => {
    if (isFetching) return;
    isFetching = true;
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
    } finally {
      isFetching = false;
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

  /**
   * Optimistic local update: merge partial fields into a single item.
   *
   * Creates a new array (so SolidJS detects the change) but only the
   * affected item is shallow-merged — all other items keep their original
   * reference, so SolidJS's keyed <For> skips re-rendering them.
   */
  const updateItem = (itemId: string, update: Partial<WatchlistItem>) => {
    setWatchlist((prev) => {
      const idx = prev.findIndex((m) => m.id === itemId);
      if (idx < 0) return prev; // not found — no change
      const next = [...prev];
      next[idx] = { ...next[idx], ...update };
      return next;
    });
  };

  /**
   * Optimistic local removal: remove a single item from the array.
   *
   * Creates a new array without the item. Used by delete operations
   * to avoid a full refresh() round-trip.
   */
  const removeItem = (itemId: string) => {
    setWatchlist((prev) => prev.filter((m) => m.id !== itemId));
  };

  const library: UserLibrary = {
    watchlist,
    loading,
    isGuest,
    error,
    refresh: doFetch,
    updateItem,
    removeItem,
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
