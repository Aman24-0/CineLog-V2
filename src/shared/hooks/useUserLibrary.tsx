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

import {
  createContext,
  useContext,
  createSignal,
  createMemo,
  createEffect,
  ParentComponent
} from "solid-js";
import { fetchUserLibrary, getUserId } from "./userLibraryAdapter";
import { useAuth } from "~/shared/hooks/useAuth";
import { useRealtimeSync } from "~/shared/hooks/useRealtimeSync";
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
// Deep-merge helper (Phase 4 Task 9a)
// ---------------------------------------------------------------------------

/**
 * Returns true if `v` is a plain object (not an array, not null, not a
 * class instance). Used to decide whether to deep-merge a field.
 *
 * We check the prototype is either `Object.prototype` or `null`
 * (Object.create(null)). This correctly excludes Date, Array, Map,
 * Set, class instances, etc.
 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-merge a partial update into an existing WatchlistItem.
 *
 * Phase 4 Task 9a: top-level primitive fields are shallow-merged (the
 * update's value wins). Top-level plain-object fields (like `watchProgress`,
 * `seasonDates`, `franchises`) are deep-merged one level — the update's
 * keys overwrite the existing item's keys, but keys absent from the
 * update are preserved.
 *
 * Arrays, Dates, and non-plain-object values are replaced wholesale
 * (correct for `tags`, `genres`, `credits`, `addedAt` when it's a Date, etc.).
 *
 * @param item    The existing watchlist item (immutable — not mutated).
 * @param update  The partial update to apply.
 * @returns A new WatchlistItem with the update applied.
 */
function deepMergeItem(
  item: WatchlistItem,
  update: Partial<WatchlistItem>
): WatchlistItem {
  // We work with a loosely-typed record internally so we can assign
  // merged plain-object values without TypeScript narrowing each key
  // to `never` (which happens when you try to assign a union-spread
  // back to a keyed property on a concrete interface). The cast back
  // to WatchlistItem at the end is safe because we only ever:
  //   1. Copy existing fields from `item` (already valid WatchlistItem).
  //   2. Overwrite with fields from `update` (Partial<WatchlistItem>).
  //   3. Deep-merge plain-object fields (spreads two plain objects →
  //      structurally compatible with the original field type).
  const merged: Record<string, unknown> = { ...(item as unknown as Record<string, unknown>) };
  for (const key of Object.keys(update)) {
    const updateVal = (update as unknown as Record<string, unknown>)[key];
    const existingVal = (item as unknown as Record<string, unknown>)[key];
    // Both values are plain objects → merge one level deep.
    if (isPlainObject(updateVal) && isPlainObject(existingVal)) {
      merged[key] = { ...existingVal, ...updateVal };
    } else {
      // Primitive, array, Date, or mixed → replace wholesale.
      merged[key] = updateVal;
    }
  }
  return merged as unknown as WatchlistItem;
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
      // Discard if user changed while fetch was in-flight
      if (fetchUid !== currentFetchUid) {
        isFetching = false;
        return;
      }
      setWatchlist(items);
      setLoading(false);
    } catch (err) {
      console.error("[UserLibraryProvider] Fetch error:", err);
      // Discard if user changed while fetch was in-flight
      if (fetchUid !== currentFetchUid) {
        isFetching = false;
        return;
      }
      setError("Failed to load your library.");
      setLoading(false);
    } finally {
      isFetching = false;
      // Clear the safety-net timer since the fetch completed (success or error)
      if (safetyTimerId !== null) {
        clearTimeout(safetyTimerId);
        safetyTimerId = null;
      }
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
   *
   * Safety-net: if loading is still true after 15 seconds (vault fetch
   * hung or auth never resolved), force loading=false so the UI unblocks.
   *
   * PHASE 14 CHUNK 8 FIX — Always-Arm Safety Timer:
   *   The original safety timer was only armed INSIDE the
   *   `if (authReady() && isSignedIn())` branch. That means it never
   *   fired when auth itself was hung (e.g. supabase.auth.getSession()
   *   hanging on a cold start). The result: the top-level <Suspense>
   *   in app.tsx kept rendering the GlassLoadingState spinner forever,
   *   which manifested as a "loading bar stuck at 60-70%" on the first
   *   load of the day.
   *
   *   useAuth now has its own 8s cold-start timeout (see checkInitialSession),
   *   so authReady(true) will eventually fire no matter what. But to be
   *   doubly safe — in case the authReady signal gets stuck for ANY
   *   reason — we now arm an unconditional safety timer on FIRST RUN
   *   of the createEffect. If loading() is still true after 12s
   *   regardless of auth state, we force it false. This guarantees
   *   the loader NEVER stays up forever.
   */
  // Track the safety-net timer so it can be cleared when doFetch completes.
  let safetyTimerId: ReturnType<typeof setTimeout> | null = null;
  // Track whether the unconditional safety timer has been armed for
  // this provider instance. It only needs to fire once — if loading
  // is still true 12s after the provider mounts, something is hung
  // and we unblock the UI.
  let unconditionalSafetyArmed = false;

  createEffect(() => {
    // ── Phase 14 Chunk 8 — Always-arm the safety timer on first run ──
    // This fires regardless of auth state, so it catches the case
    // where auth itself is hung (the original safety timer was gated
    // on authReady() && isSignedIn(), which never became true).
    if (!unconditionalSafetyArmed) {
      unconditionalSafetyArmed = true;
      const UNCONDITIONAL_TIMEOUT_MS = 12000;
      setTimeout(() => {
        if (loading()) {
          console.warn(
            "[UserLibraryProvider] Loading still true after 12s — forcing unblock (auth or vault fetch hung)"
          );
          setLoading(false);
          isFetching = false;
        }
      }, UNCONDITIONAL_TIMEOUT_MS);
    }

    if (authReady() && isSignedIn()) {
      // Clear any previous safety timer before starting a new fetch
      if (safetyTimerId !== null) {
        clearTimeout(safetyTimerId);
        safetyTimerId = null;
      }
      doFetch();
      // Safety-net: unblock UI if the vault fetch hangs (network issues, etc.)
      safetyTimerId = setTimeout(() => {
        if (isFetching) {
          console.warn(
            "[UserLibraryProvider] Vault fetch timed out after 15s — unblocking UI"
          );
          setLoading(false);
          isFetching = false;
        }
        safetyTimerId = null;
      }, 15000);
    } else if (authReady() && !isSignedIn()) {
      // Clear library when signed out (guest mode)
      setWatchlist([]);
      setLoading(false);
      // Clear safety timer on sign-out
      if (safetyTimerId !== null) {
        clearTimeout(safetyTimerId);
        safetyTimerId = null;
      }
    }
    // Note: when !authReady() (still resolving), we do nothing here.
    // The unconditional safety timer above guarantees we unblock after
    // 12s even if authReady never becomes true.
  });

  /**
   * Deep-merge a partial update into a single item.
   *
   * Phase 4 Task 9a: previously this used a shallow merge (`{ ...item, ...update }`),
   * which meant updating a nested field like `watchProgress` would REPLACE the
   * entire `watchProgress` object — losing sibling fields. For example, calling
   * `updateItem(id, { watchProgress: { currentTime: 120 } })` would wipe
   * `duration`, `season`, `episode`, and `server` from the existing
   * `watchProgress`.
   *
   * The fix deep-merges plain-object fields (one level deep — enough for
   * `watchProgress`, `addedAt`, `seasonDates`, `franchises`, and any other
   * nested record). Arrays and non-plain-object values are replaced
   * wholesale (correct for `tags`, `genres`, `credits`, etc.).
   *
   * Top-level primitive fields (status, rating, etc.) are still shallow-
   * merged — only plain-object fields get the deep-merge treatment.
   */
  const updateItem = (itemId: string, update: Partial<WatchlistItem>) => {
    setWatchlist((prev) => {
      const idx = prev.findIndex((m) => m.id === itemId);
      if (idx < 0) return prev; // not found — no change
      const next = [...prev];
      next[idx] = deepMergeItem(next[idx], update);
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
    removeItem
  };

  // ── Phase 7 Task 2: Supabase Realtime ──────────────────────────
  // Subscribe to Postgres Changes on the `vault` table for the
  // current user. When a vault row is inserted/updated/deleted on
  // another device (or another tab), the debounced `refresh()` call
  // re-pulls the vault from Supabase so this device's local state
  // stays in sync without a manual refresh.
  //
  // We pass `onVaultChange` only — the `CollectionsProvider` owns
  // the collections subscription separately to avoid a circular
  // dependency (UserLibraryProvider doesn't know about collections).
  useRealtimeSync({
    uid: () => getUserId(),
    onVaultChange: doFetch
  });

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
