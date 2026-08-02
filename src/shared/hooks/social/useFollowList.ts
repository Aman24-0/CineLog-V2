// src/shared/hooks/social/useFollowList.ts
//
// useFollowList — paginated list of followers or following users.
//
// Fetches from GET /api/follow/list?targetUserId=<id>&type=<followers|following>
// and exposes:
//   • users     — Accessor<APIUser[]>   — accumulated across all pages
//   • loading   — Accessor<boolean>     — true while the first page loads
//   • loadingMore — Accessor<boolean>   — true while subsequent pages load
//   • error     — Accessor<string | null>
//   • hasMore   — Accessor<boolean>     — false when the last page was short
//   • loadMore  — () => Promise<void>   — fetch the next page
//   • refresh   — () => Promise<void>   — wipe + refetch page 1
//
// The hook re-fetches from page 1 when targetUserId or type changes.

import {
  createSignal,
  createEffect,
  onCleanup,
  type Accessor
} from "solid-js";
import { isServer } from "solid-js/web";

import { getClient } from "~/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types — mirror the API response shape
// ---------------------------------------------------------------------------

export interface APIUser {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Whether the CALLER follows this user. */
  isFollowing: boolean;
}

interface ListResponse {
  data: APIUser[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

export type FollowListType = "followers" | "following";

interface UseFollowListReturn {
  users: Accessor<APIUser[]>;
  loading: Accessor<boolean>;
  loadingMore: Accessor<boolean>;
  error: Accessor<string | null>;
  hasMore: Accessor<boolean>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULT_LIMIT = 20;

/**
 * Fetch a paginated followers or following list for a target user.
 *
 * @param targetUserId The user whose graph we're browsing.
 * @param type "followers" (people who follow target) or "following"
 *   (people the target follows).
 */
export function useFollowList(
  targetUserId: Accessor<string | null | undefined>,
  type: Accessor<FollowListType>
): UseFollowListReturn {
  const [users, setUsers] = createSignal<APIUser[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [hasMore, setHasMore] = createSignal(true);

  let currentPage = 0;
  let fetchInFlight: Promise<void> | null = null;

  const fetchPage = async (
    page: number,
    append: boolean
  ): Promise<void> => {
    if (isServer) return;
    const target = targetUserId();
    const listType = type();
    if (!target) {
      setUsers([]);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Resolve the caller's access token (same pattern as useFeed /
      // useFollow — CineLog stores sessions in localStorage, so we
      // send the token as a Bearer header).
      const supabase = getClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? null;

      const url = `/api/follow/list?targetUserId=${encodeURIComponent(
        target
      )}&type=${listType}&limit=${DEFAULT_LIMIT}&page=${page}`;
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
          body?.error ?? "Failed to load list. Please try again.";
        setError(msg);
        return;
      }

      const body = (await res.json()) as ListResponse;
      const newUsers = body.data ?? [];
      const newHasMore = Boolean(body.pagination?.hasMore);

      if (append) {
        // Dedup by user id — the API might return overlapping users
        // if someone followed/unfollowed between page fetches.
        setUsers((prev) => {
          const seen = new Set(prev.map((u) => u.id));
          const merged = [...prev];
          for (const u of newUsers) {
            if (!seen.has(u.id)) {
              merged.push(u);
              seen.add(u.id);
            }
          }
          return merged;
        });
      } else {
        setUsers(newUsers);
      }

      setHasMore(newHasMore);
      currentPage = page;
    } catch (err) {
      console.error("[useFollowList] fetch threw:", err);
      setError("Network error — please check your connection.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      fetchInFlight = null;
    }
  };

  const loadMore = async (): Promise<void> => {
    if (isServer) return;
    if (fetchInFlight) return fetchInFlight;
    if (!hasMore()) return;
    const nextPage = currentPage + 1;
    fetchInFlight = fetchPage(nextPage, true);
    await fetchInFlight;
  };

  const refresh = async (): Promise<void> => {
    if (isServer) return;
    if (fetchInFlight) {
      try {
        await fetchInFlight;
      } catch {
        // swallow
      }
    }
    setUsers([]);
    setHasMore(true);
    currentPage = 0;
    await fetchPage(1, false);
  };

  // Re-fetch when targetUserId or type changes.
  createEffect(() => {
    if (isServer) return;
    const target = targetUserId();
    const listType = type();
    // Touch both so the effect re-runs when either changes.
    void target;
    void listType;
    void refresh();
  });

  onCleanup(() => {
    fetchInFlight = null;
  });

  return {
    users,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh
  };
}
