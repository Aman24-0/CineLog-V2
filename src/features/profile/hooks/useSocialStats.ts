// src/features/profile/hooks/useSocialStats.ts
//
// useSocialStats — fetches the follower / following counts for a user
// from the `follows` table via the FollowsRepository.
//
// The hook is SSR-safe (skips the fetch on the server) and exposes
// loading / error signals so the UI can show a skeleton while the
// counts load. The fetch is triggered reactively when `userId`
// changes; on success the counts are cached in signals until the
// next refresh.
//
// The hook also exposes an imperative `refresh()` so callers can
// re-fetch after a follow / unfollow action without waiting for the
// next reactive trigger.

import { createSignal, createEffect, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";
import { getClient } from "~/lib/supabase/client";
import { getFollowCounts } from "~/lib/supabase/repositories/follows";

export interface SocialStats {
  followers: number;
  following: number;
}

export function useSocialStats(userId: Accessor<string | null | undefined>): {
  stats: Accessor<SocialStats>;
  loading: Accessor<boolean>;
  error: Accessor<Error | null>;
  refresh: () => Promise<void>;
} {
  const [stats, setStats] = createSignal<SocialStats>({ followers: 0, following: 0 });
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  const fetchStats = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getClient();
      const result = await getFollowCounts(supabase, id);
      if (result.error) throw result.error;
      if (result.data) {
        setStats(result.data);
      }
    } catch (err) {
      console.error("[useSocialStats] fetch failed:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      // Keep the previous stats on error — don't blank the UI on a
      // transient network failure.
    } finally {
      setLoading(false);
    }
  };

  // Trigger fetch on userId change. SSR skip — counts load on the client.
  createEffect(() => {
    if (isServer) return;
    const id = userId();
    if (id) {
      void fetchStats(id);
    } else {
      setStats({ followers: 0, following: 0 });
      setLoading(false);
      setError(null);
    }
  });

  return {
    stats,
    loading,
    error,
    refresh: async () => {
      const id = userId();
      if (id) await fetchStats(id);
    },
  };
}
