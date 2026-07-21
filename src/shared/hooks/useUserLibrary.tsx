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

import { createContext, useContext, createSignal, createMemo, createEffect, ParentComponent } from "solid-js";
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
  const { authReady, isSignedIn } = useAuth();
  const [watchlist, setWatchlist] = createSignal<WatchlistItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  // isGuest is derived reactively from auth state instead of being set
  // imperatively inside doFetch(). This prevents the race condition where
  // onMount fires doFetch() before auth has resolved, setting isGuest=true
  // permanently even after the session is detected.
  const isGuest = createMemo(() => !isSignedIn());
  const [error, setError] = createSignal<string | null>(null);

  // Guard: prevents concurrent duplicate fetches when multiple triggers
  // fire simultaneously (onSessionChange + createEffect can both fire
  // within the same tick on first load). Without this guard, 2-3
  // identical Supabase + TMDB round-trips fire in parallel on startup.
  let isFetching = false;

  // Track the uid at the time the fetch started, so we can detect if
  // the user changed while a fetch was in-flight (sign-out + sign-in).
  let fetchUid: string | null = null;

  /**
   * The ONE fetch function. Called on auth state change and by
   * consumers via `refresh()`. Only fetches when auth is ready
   * and a user is signed in — otherwise clears the library.
   */
  const doFetch = async () => {
    if (isFetching) return;
    isFetching = true;
    const userId = getUserId();
    if (!userId) {
      setWatchlist([]);
      setLoading(false);
      isFetching = false;
      return;
    }

    // Record the uid so we can discard stale results.
    const currentFetchUid = userId;
    fetchUid = currentFetchUid;
    setLoading(true);
    setError(null);
    try {
      const items = await fetchUserLibrary(userId);
      // Discard if user changed while fetch was in-flight.
      // Reset isFetching first so a new fetch for the new user can proceed.
      if (fetchUid !== currentFetchUid) {
        isFetching = false;
        // The new user's uid is in fetchUid — trigger a new fetch for them.
        void doFetch();
        return;
      }
      setWatchlist(items);
      setLoading(false);
    } catch (err) {
      console.error("[UserLibraryProvider] Fetch error:", err);
      if (fetchUid !== currentFetchUid) {
        isFetching = false;
        void doFetch();
        return;
      }
      setError("Failed to load your library.");
      setLoading(false);
    } finally {
      isFetching = false;
    }
  };

  /**
   * Auth-triggered library fetch.
   *
   * The createEffect gates on authReady() && isSignedIn() so doFetch()
   * only runs AFTER the session has been resolved. This avoids the race
   * condition where onMount called doFetch() before auth was ready
   * (which permanently set isGuest=true because getUserId() returned null).
   *
   * NOTE: We removed the duplicate onMount + onSessionChange subscription
   * that was previously here. It caused a redundant fetch trigger on
   * initial load (both onSessionChange callback AND this createEffect
   * fired within the same tick). The isFetching guard silently dropped
   * the second call, meaning the duplicate trigger was wasted. The
   * createEffect alone is sufficient for all auth state transitions
   * (sign-in, sign-out, OAuth redirect, token refresh).
   */
  createEffect(() => {
    if (authReady() && isSignedIn()) {
      doFetch();
    } else if (authReady() && !isSignedIn()) {
      // Clear library when signed out (guest mode)
      setWatchlist([]);
      setLoading(false);
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
