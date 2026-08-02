// src/shared/hooks/social/useFeed.ts
//
// useFeed — paginated activity feed hook for the /feed route.
//
// Fetches enriched activity items from GET /api/feed and exposes:
//   • items    — Accessor<FeedActivity[]>   — accumulated across all pages
//   • loading  — Accessor<boolean>          — true while the first page loads
//   • loadingMore — Accessor<boolean>       — true while subsequent pages load
//   • error    — Accessor<string | null>    — last error message
//   • hasMore  — Accessor<boolean>          — false when the last page was short
//   • loadMore — () => Promise<void>        — fetch the next page
//   • refresh  — () => Promise<void>        — wipe + refetch page 1
//
// PAGINATION
//   The hook uses simple page-counter pagination (limit=20 by default).
//   Each call to `loadMore` increments the page and appends the new
//   items. When a page returns fewer than `limit` items (or the API
//   returns hasMore=false), `hasMore` becomes false and `loadMore`
//   becomes a no-op.
//
// INFINITE SCROLL
//   The hook is intentionally decoupled from scroll detection — the
//   FeedPage component wires up an IntersectionObserver sentinel
//   element and calls `loadMore()` when it intersects. This keeps the
//   hook testable without a DOM.
//
// SSR SAFETY
//   The hook is SSR-safe — it skips the fetch on the server and shows
//   `loading: true` until the client mounts. The FeedPage route
//   renders a skeleton during SSR + first paint.

import {
  createSignal,
  onMount,
  onCleanup,
  type Accessor
} from "solid-js";
import { isServer } from "solid-js/web";

import { useAuth } from "~/shared/hooks/useAuth";
import { getClient } from "~/lib/supabase/client";
import type { FeedActivity } from "~/routes/api/feed";

// Re-export the FeedActivity type so consumers can import everything
// from this hook module.
export type { FeedActivity };

const DEFAULT_LIMIT = 20;

interface FeedPagination {
  page: number;
  limit: number;
  hasMore: boolean;
}

interface FeedResponse {
  data: FeedActivity[];
  pagination: FeedPagination;
}

interface UseFeedReturn {
  items: Accessor<FeedActivity[]>;
  loading: Accessor<boolean>;
  loadingMore: Accessor<boolean>;
  error: Accessor<string | null>;
  hasMore: Accessor<boolean>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Reactively fetch the activity feed of users the caller follows.
 *
 * The hook re-fetches from page 1 when the caller's auth state changes
 * (sign-in / sign-out). When signed out, the hook returns an empty
 * array — the FeedPage renders a sign-in CTA instead.
 */
export function useFeed(limit: number = DEFAULT_LIMIT): UseFeedReturn {
  const { isSignedIn } = useAuth();

  const [items, setItems] = createSignal<FeedActivity[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [hasMore, setHasMore] = createSignal(true);

  // Current page counter — bumped by loadMore, reset by refresh.
  let currentPage = 0;
  // Guard against concurrent loadMore calls (e.g. rapid scroll).
  let fetchInFlight: Promise<void> | null = null;

  /**
   * Fetch a single page from /api/feed. Appends to `items` if
   * `append` is true (i.e. loadMore), otherwise replaces `items`
   * (refresh / initial load).
   */
  const fetchPage = async (
    page: number,
    append: boolean
  ): Promise<void> => {
    if (isServer) return;
    if (!isSignedIn()) {
      // Signed-out users have no feed — clear state.
      setItems([]);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Resolve the caller's Supabase access token.
      //
      // CineLog stores sessions in localStorage (not cookies), so the
      // API route can't read the session from the cookie. We pull the
      // token from the Supabase client and send it as a Bearer token
      // in the Authorization header — the standard pattern for GET
      // requests that can't have a body.
      const supabase = getClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? null;

      const url = `/api/feed?limit=${limit}&page=${page}`;
      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : {}
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        const msg =
          body?.error ??
          (res.status === 401
            ? "Your session has expired. Please sign in again."
            : "Failed to load feed. Please try again.");
        setError(msg);
        // On auth failure, clear items so we don't show stale data.
        if (res.status === 401) {
          setItems([]);
          setHasMore(false);
        }
        return;
      }

      const body = (await res.json()) as FeedResponse;
      const newItems = body.data ?? [];
      const newHasMore = Boolean(body.pagination?.hasMore);

      if (append) {
        // Dedup by activity id — the API might return overlapping
        // items if a new activity was created between page fetches.
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          const merged = [...prev];
          for (const item of newItems) {
            if (!seen.has(item.id)) {
              merged.push(item);
              seen.add(item.id);
            }
          }
          return merged;
        });
      } else {
        setItems(newItems);
      }

      setHasMore(newHasMore);
      currentPage = page;
    } catch (err) {
      console.error("[useFeed] fetch threw:", err);
      setError("Network error — please check your connection.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      fetchInFlight = null;
    }
  };

  /**
   * Fetch the next page. No-op if a fetch is in flight, if there are
   * no more pages, or if the user is signed out.
   */
  const loadMore = async (): Promise<void> => {
    if (isServer) return;
    if (fetchInFlight) return fetchInFlight;
    if (!hasMore()) return;
    if (!isSignedIn()) return;

    const nextPage = currentPage + 1;
    fetchInFlight = fetchPage(nextPage, true);
    await fetchInFlight;
  };

  /**
   * Wipe state + refetch page 1. Used by the FeedPage's pull-to-
   * refresh / retry button.
   */
  const refresh = async (): Promise<void> => {
    if (isServer) return;
    if (fetchInFlight) {
      try {
        await fetchInFlight;
      } catch {
        // swallow
      }
    }
    setItems([]);
    setHasMore(true);
    currentPage = 0;
    await fetchPage(1, false);
  };

  // Initial fetch on mount. We don't use createEffect for this because
  // the auth state may resolve after mount (the useAuth hook fires
  // authReady asynchronously). onMount runs once after first paint,
  // which is after the auth check has had a chance to resolve.
  onMount(() => {
    void fetchPage(1, false);
  });

  // Re-fetch when auth state flips (sign-in / sign-out). The auth
  // hook's isSignedIn() accessor triggers the effect re-run.
  // We use a tracked effect that ignores the initial run (handled by
  // onMount above) and only fires on actual state changes.
  let lastSignedIn = isSignedIn();
  const checkAuthChange = () => {
    const nowSignedIn = isSignedIn();
    if (nowSignedIn !== lastSignedIn) {
      lastSignedIn = nowSignedIn;
      void refresh();
    }
  };
  // Poll-free — use a microtask check after mount + on every
  // loadMore/refresh call. The auth hook is module-level so its
  // signal updates are synchronous; the only race is if the user
  // signs in while the FeedPage is mounted but no other reactive
  // consumer pulls. The simplest reliable approach is a setInterval
  // poll at 1s — cheap (no DOM work, just a boolean comparison).
  //
  // This is acceptable because the FeedPage is the only consumer
  // and the polling stops when the page unmounts.
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    pollHandle = setInterval(checkAuthChange, 1000);
  });
  onCleanup(() => {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  });

  // Auto-refresh when the page becomes visible again (user navigated
  // back from adding a title to watchlist, or switched tabs). This
  // ensures the feed shows new activity without requiring a manual
  // refresh. We use a 30-second debounce to avoid excessive refreshes.
  let lastRefreshTime = Date.now();
  const REFRESH_DEBOUNCE_MS = 30_000; // 30 seconds

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible" && isSignedIn()) {
      const now = Date.now();
      if (now - lastRefreshTime >= REFRESH_DEBOUNCE_MS) {
        lastRefreshTime = now;
        void refresh();
      }
    }
  };

  onMount(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });
  onCleanup(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh
  };
}
