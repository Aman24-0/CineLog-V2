// src/shared/hooks/social/useFollow.ts
//
// useFollow — SolidJS hook for following / unfollowing other users
// and reactively tracking the "am I following X?" status.
//
// The hook wraps the three follow-related API endpoints:
//
//   POST   /api/follow         { targetUserId }
//   DELETE /api/follow         { targetUserId }
//   GET    /api/follow/status?targetUserId=<id>
//
// PUBLIC API
//   const {
//     following,    // Accessor<boolean> — am I following targetUserId right now?
//     loading,      // Accessor<boolean> — true while the initial status check
//                   //                      is in flight (false on second render)
//     pending,      // Accessor<boolean> — true while a follow/unfollow call
//                   //                      is in flight (used to disable the
//                   //                      button so the user can't double-tap)
//     error,        // Accessor<string | null> — last error message (null on success)
//     follow,       // () => Promise<boolean>  — initiate follow; returns success
//     unfollow,     // () => Promise<boolean>  — initiate unfollow; returns success
//     refresh       // () => Promise<void>     — re-fetch status from server
//   } = useFollow(() => targetUserId);
//
// OPTIMISTIC UPDATES
//   The `following` signal is updated IMMEDIATELY when follow()/unfollow()
//   is called, before the server round-trip resolves. This matches the
//   user's mental model — the button flips to "Following" instantly. If
//   the server call fails, the signal rolls back to its prior value and
//   a toast is shown.
//
// SSR SAFETY
//   The initial status check is skipped on the server (the cookie is
//   unavailable during SSR). The hook resolves to `following: false`
//   during SSR and refreshes on the client after mount.

import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  type Accessor
} from "solid-js";
import { isServer } from "solid-js/web";

import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import { getClient } from "~/lib/supabase/client";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";

// ---------------------------------------------------------------------------
// Types — match the API response shapes
// ---------------------------------------------------------------------------

interface FollowStatusResponse {
  following: boolean;
}

interface FollowMutationResponse {
  success: boolean;
  alreadyFollowing?: boolean;
  error?: string;
}

interface UseFollowReturn {
  following: Accessor<boolean>;
  loading: Accessor<boolean>;
  pending: Accessor<boolean>;
  error: Accessor<string | null>;
  follow: () => Promise<boolean>;
  unfollow: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Reactively track + mutate the caller's follow relationship with a
 * target user.
 *
 * @param targetUserId Accessor returning the user id of the user to
 *   follow/unfollow. Pass `() => null` while the id is unknown (e.g.
 *   while the public profile is still loading) — the hook will skip
 *   the status check until a real id appears.
 */
export function useFollow(
  targetUserId: Accessor<string | null | undefined>
): UseFollowReturn {
  const { user, isSignedIn } = useAuth();
  const { showToast } = useToast();
  const { openAuthModal } = useAuthModal();

  const [following, setFollowing] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Track the in-flight status fetch so a rapid targetUserId change
  // doesn't race two fetches against each other.
  let statusInFlight: Promise<void> | null = null;

  /**
   * Fetch the current follow status from /api/follow/status.
   * Uses the Supabase session token as a Bearer credential (the same
   * token the browser uses for all other authenticated API calls).
   */
  const refresh = async (): Promise<void> => {
    // SSR skip — no cookie available.
    if (isServer) return;
    const target = targetUserId();
    if (!target) {
      setFollowing(false);
      setLoading(false);
      return;
    }
    // Not signed in → can't be following anyone.
    if (!isSignedIn()) {
      setFollowing(false);
      setLoading(false);
      return;
    }

    // De-dupe: if a status fetch is already running for this target,
    // await it instead of starting a second one.
    if (statusInFlight) {
      try {
        await statusInFlight;
      } catch {
        // swallow — the original fetcher has already handled the error
      }
      // If a new target arrived during the await, re-trigger.
      if (targetUserId() !== target) return;
    }

    setLoading(true);
    setError(null);

    const fetchPromise = (async () => {
      try {
        const url = `/api/follow/status?targetUserId=${encodeURIComponent(target)}`;
        const res = await fetch(url, {
          method: "GET",
          credentials: "include" // sends the sb-*-auth-token cookie
        });

        if (!res.ok) {
          // 401 / 5xx — fall back to "not following" so the UI shows
          // the Follow button (the safer default).
          setFollowing(false);
          if (res.status !== 401) {
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            console.warn(
              `[useFollow] status check failed (${res.status}):`,
              body?.error ?? res.statusText
            );
          }
          return;
        }

        const body = (await res.json()) as FollowStatusResponse;
        setFollowing(Boolean(body.following));
      } catch (err) {
        // Network error — don't surface a toast (too noisy); just log.
        console.warn("[useFollow] status fetch threw:", err);
        setFollowing(false);
      } finally {
        setLoading(false);
        statusInFlight = null;
      }
    })();

    statusInFlight = fetchPromise;
    await fetchPromise;
  };

  /**
   * Internal: call POST or DELETE /api/follow.
   *
   * Performs an optimistic update — flips `following` immediately, then
   * rolls back on server error. Returns true on success, false on
   * failure (and shows a toast).
   */
  const mutate = async (
    method: "POST" | "DELETE",
    desiredFollowing: boolean
  ): Promise<boolean> => {
    const target = targetUserId();
    if (!target) {
      showToast("User not loaded yet — try again in a moment.", "error");
      return false;
    }

    // Auth gate — if the user isn't signed in, open the auth modal
    // instead of attempting the API call (which would just 401).
    if (!isSignedIn()) {
      openAuthModal();
      return false;
    }

    // Self-follow guard (defensive — the UI shouldn't render a
    // FollowButton on the viewer's own profile, but this is the
    // last line of defence).
    if (user()?.uid === target) {
      showToast("You can't follow yourself.", "error");
      return false;
    }

    setPending(true);
    setError(null);

    // Optimistic update.
    const previous = following();
    setFollowing(desiredFollowing);

    try {
      // Resolve the access token — the browser stores sessions in
      // localStorage (not cookies), so we read it from the Supabase
      // client and pass it in the body. The server route also falls
      // back to the cookie (in case cookie-based sessions are enabled
      // in the future).
      const supabase = getClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? null;

      // If we don't have an access token client-side, try the cookie
      // path (works when running with cookie-based auth).
      const cookieToken = isServer
        ? null
        : getSupabaseAccessToken(document.cookie);

      const res = await fetch("/api/follow", {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          targetUserId: target,
          accessToken: accessToken ?? cookieToken ?? undefined
        })
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        const msg =
          body?.error ??
          (res.status === 401
            ? "Your session has expired. Please sign in again."
            : "Something went wrong. Please try again.");
        setError(msg);
        // Roll back the optimistic update.
        setFollowing(previous);
        showToast(msg, "error");
        return false;
      }

      const body = (await res.json()) as FollowMutationResponse;
      // The server is authoritative — if it says `alreadyFollowing: true`,
      // we should be in the following state regardless of our optimistic guess.
      if (body.success) {
        setFollowing(desiredFollowing);
        showToast(
          desiredFollowing ? "Following" : "Unfollowed",
          "success",
          1500
        );
        return true;
      }
      // Shouldn't happen (server returns 200 only on success) but be safe.
      setFollowing(previous);
      return false;
    } catch (err) {
      console.error("[useFollow] mutation threw:", err);
      const msg = "Network error — please check your connection.";
      setError(msg);
      setFollowing(previous);
      showToast(msg, "error");
      return false;
    } finally {
      setPending(false);
    }
  };

  const follow = () => mutate("POST", true);
  const unfollow = () => mutate("DELETE", false);

  // Re-fetch status when targetUserId changes. The effect tracks both
  // `targetUserId()` and `isSignedIn()` — sign-in transitions need to
  // re-fetch too (the user might sign in while viewing a profile).
  createEffect(() => {
    if (isServer) return;
    const target = targetUserId();
    const signedIn = isSignedIn();
    // Touch both — the effect re-runs when either changes.
    void target;
    void signedIn;
    void refresh();
  });

  // Cleanup on unmount.
  onMount(() => {
    // No-op — the effect handles initial fetch.
  });
  onCleanup(() => {
    statusInFlight = null;
  });

  return {
    following,
    loading,
    pending,
    error,
    follow,
    unfollow,
    refresh
  };
}
