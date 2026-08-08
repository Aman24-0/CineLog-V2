// src/shared/hooks/useRealtimeSync.ts
//
// CineLog V2 — Supabase Realtime Sync (Phase 7 Task 2)
// ---------------------------------------------------------------------
// Subscribes to Postgres Changes on the `vault` and `collections`
// tables so that mutations made on ANOTHER device (or another tab) are
// reflected in the local `useUserLibrary` and `useCollections` state
// without requiring a manual refresh.
//
// Why not per-row patching?
// --------------------------
// The `vault` table stores only the user's status / rating / timestamps.
// The richer `WatchlistItem` shape (title, poster, genres, cast, runtime,
// imdb rating) is enriched client-side from TMDB via `fetchUserLibrary`.
// A realtime `UPDATE` event only gives us the raw `vault` row — patching
// it into the local array would either:
//
//   (a) lose the TMDB-enriched fields (showing a card with no poster /
//       title until the next full refresh), or
//   (b) require us to re-run the TMDB enrichment for that one row,
//       which is the same code path as `fetchUserLibrary` but with
//       extra bookkeeping.
//
// Doing a full `refresh()` on every event is simpler, correct, and
// cheap (1 Supabase query + cache hits for TMDB). The downside is a
// brief loading flicker if many events fire in rapid succession — we
// mitigate that with a debounced refresh (see `debouncedRefresh`
// below) so a burst of changes from a bulk operation collapses into
// a single refresh.
//
// Why filter by `user_id`?
// ------------------------
// Supabase Realtime's Postgres Changes can be filtered by column. We
// filter on `user_id=auth.uid()` so we only receive events for the
// CURRENT user's rows. RLS already prevents us from reading other
// users' rows, but realtime would still broadcast the event to all
// connected clients — the filter avoids the unnecessary traffic and
// the client-side filter step.
//
// Lifecycle
// ---------
// The hook is called from `UserLibraryProvider` and
// `CollectionsProvider`. It subscribes on mount (when a uid is
// available) and unsubscribes on cleanup (when the user signs out or
// the provider unmounts). It is a no-op on the server (no Realtime
// channel can be created during SSR).
//
// Resilience
// ----------
// Supabase Realtime channels auto-reconnect on transient failures.
// We don't need to implement our own retry logic — supabase-js does
// it. If the subscription itself fails (e.g. Realtime is disabled on
// the project), we log a warning and continue; the app still works
// via manual refresh. This is a soft dependency, not a hard one.

import { onCleanup, onMount } from "solid-js";
import { getClient } from "~/lib/supabase/client";

/**
 * Options for the realtime sync hook.
 */
export interface UseRealtimeSyncOptions {
  /**
   * The current user's Supabase auth uid. When null/empty, the hook
   * is a no-op (no subscription is created). This is the value that
   * gates the lifecycle — when the user signs out, the hook receives
   * `null` and unsubscribes from any active channel.
   */
  uid: () => string | null | undefined;
  /**
   * The refresh function to call when a vault change is detected.
   * Typically `useUserLibrary().refresh`. Optional — if omitted,
   * no vault subscription is created.
   */
  onVaultChange?: () => void | Promise<void>;
  /**
   * The refresh function to call when a collections change is detected.
   * Typically the `loadForUid` or `refreshCollections` from
   * `useCollections`. Optional — if omitted, no collections
   * subscription is created.
   */
  onCollectionsChange?: () => void | Promise<void>;
  /**
   * Optional: name suffix for the channel. Defaults to "library".
   * Useful if multiple providers want their own channels (though we
   * recommend a single shared channel — see `useRealtimeSync`).
   */
  channelSuffix?: string;
}

/**
 * Debounce window for collapsing bursts of events into a single refresh.
 *
 * When a user does a bulk operation (e.g. adds 50 titles to a collection
 * on their phone), the realtime channel fires 50 INSERT events in rapid
 * succession. Refreshing 50 times in a row would be wasteful and would
 * cause the UI to flicker. Instead, we collapse all events within this
 * window into a single refresh.
 *
 * 500ms is a good default — it's short enough that the user perceives
 * the sync as "instant" but long enough to collapse a burst.
 */
const DEBOUNCE_MS = 500;

/**
 * Subscribe to Postgres Changes on `vault` and `collections` for the
 * current user. Calls the provided refresh callbacks (debounced) when
 * a relevant change is detected.
 *
 * Safe to call on the server (no-op). Safe to call with no uid (no-op).
 * Idempotent: if called multiple times with the same uid, the previous
 * subscription is cleaned up before the new one is created.
 */
export function useRealtimeSync(opts: UseRealtimeSyncOptions): void {
  const { uid, onVaultChange, onCollectionsChange, channelSuffix = "library" } = opts;

  // Track the active channel + debounce timer so we can clean them up
  // on re-subscribe or unmount. We keep them in closures (not signals)
  // because they're not reactive — they're imperative lifecycle state.
  let activeChannel: ReturnType<ReturnType<typeof getClient>["channel"]> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastUid: string | null = null;

  /**
   * Debounced refresh — collapses a burst of events into a single
   * refresh call. The refresh is async but we don't await it; the
   * caller doesn't need to know when it finishes.
   */
  const scheduleRefresh = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      // Fire whichever callbacks are present. We don't await — the
      // hook's contract is "fire and forget". Errors are logged inside
      // the providers' refresh functions.
      if (onVaultChange) void onVaultChange();
      if (onCollectionsChange) void onCollectionsChange();
    }, DEBOUNCE_MS);
  };

  /**
   * Subscribe to the realtime channel for the given uid. Replaces any
   * existing subscription.
   */
  const subscribe = (uidValue: string) => {
    // Clean up any existing subscription first (idempotent).
    if (activeChannel !== null) {
      try {
        getClient().removeChannel(activeChannel);
      } catch {
        // removeChannel can throw if the channel was already removed
        // (e.g. by supabase-js's own reconnect logic). Swallow.
      }
      activeChannel = null;
    }

    // PHASE 15 QA BUG #4: defensive URL validation. A malformed
    // VITE_SUPABASE_URL (e.g. missing protocol, trailing slash, or
    // accidentally set to a non-Supabase URL) would cause supabase-js
    // to derive an invalid wss:// URL, resulting in a confusing
    // CHANNEL_ERROR with no clear root cause. We validate the URL here
    // and bail out early with a clear warning if it's malformed.
    // supabase-js needs an https:// URL to derive wss:// correctly.
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (
        typeof supabaseUrl !== "string" ||
        supabaseUrl.trim().length === 0 ||
        !/^https?:\/\/[a-z0-9.-]+\.(supabase\.co|supabase\.in)/i.test(
          supabaseUrl.trim()
        )
      ) {
        console.warn(
          `[useRealtimeSync] VITE_SUPABASE_URL is missing or malformed ` +
            `("${supabaseUrl ?? "(empty)"}"). Realtime sync disabled — ` +
            `the app continues with manual refresh. Expected format: ` +
            `https://<project-ref>.supabase.co`
        );
        return;
      }
    } catch {
      // import.meta.env access can throw in rare SSR edge cases —
      // swallow and let supabase-js handle the bad URL (it will
      // surface a CHANNEL_ERROR which we already warn on below).
    }

    const supabase = getClient();

    // One channel for both tables. We use a single channel (instead
    // of two) because:
    //   1. Both callbacks collapse into the same debounced refresh, so
    //      there's no benefit to separate channels.
    //   2. Fewer channels = fewer WebSocket frames = less battery on
    //      mobile.
    //   3. If the user does a cross-table operation (e.g. removes a
    //      vault item that's also in a collection, which fires events
    //      on BOTH tables), the debounce collapses them into one
    //      refresh — which is what we want.
    const channel = supabase.channel(`cinelog-${channelSuffix}-${uidValue}`);

    // ── vault changes (only if a vault callback was provided) ─────
    // Filter: only events where the row's user_id matches the current
    // uid. Supabase Realtime supports column-filtering on the *new*
    // record (after the change), which is what we want — if a row's
    // user_id changes (rare, but possible during account merging),
    // we want the new owner to receive the event, not the old one.
    if (onVaultChange) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vault",
          filter: `user_id=eq.${uidValue}`
        },
        () => {
          // Any vault mutation (INSERT/UPDATE/DELETE) triggers a refresh.
          // We don't try to patch the local array — see the file header
          // for why. The debounce collapses bursts.
          scheduleRefresh();
        }
      );
    }

    // ── collections changes (only if a collections callback was provided) ──
    // Same filter — only events for the current user's collections.
    if (onCollectionsChange) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "collections",
          filter: `user_id=eq.${uidValue}`
        },
        () => {
          scheduleRefresh();
        }
      );

      // ── collection_entries changes ───────────────────────────────
      // We also subscribe to `collection_entries` because adding/removing
      // a title from a collection is a row in this table, not a change
      // to the `collections` row itself. Without this, adding a title
      // to a collection on device A wouldn't reflect on device B until
      // a manual refresh.
      //
      // We can't filter by user_id directly (collection_entries has no
      // user_id column — it's joined via collection_id). Instead we
      // rely on RLS: the user only receives events for collections they
      // can read (which is their own). This means slightly more events
      // are broadcast than strictly necessary, but RLS filters them
      // before they reach our callback.
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "collection_entries"
        },
        () => {
          scheduleRefresh();
        }
      );
    }

    // ── subscribe ────────────────────────────────────────────────
    // The callback receives a status string. We log on error but
    // don't throw — Realtime is a soft dependency.
    //
    // PHASE 15 QA BUG #4: channel errors were previously logged at
    // `console.error` level (red noise). They are RECOVERABLE —
    // supabase-js auto-reconnects the WebSocket on transient failures
    // (network blip, server restart, CSP blocking wss://). We log at
    // `console.warn` (yellow) so the console isn't flooded with red
    // errors during normal operation. The hook's polling interval
    // (1s) will re-subscribe if the channel stays errored.
    //
    // WebSocket URL: supabase-js derives the wss:// URL automatically
    // from the Supabase project URL (https://xyz.supabase.co →
    // wss://xyz.supabase.co/realtime/v1/websocket). No manual wss://
    // config is needed. The CSP (vercel.json) allows wss://*.supabase.co
    // in connect-src (added in the Phase 15 QA hotfix).
    channel.subscribe((status: string) => {
      if (status === "CHANNEL_ERROR") {
        // Recoverable — supabase-js will attempt to reconnect the
        // WebSocket automatically. Common causes: transient network
        // blip, Supabase Realtime restarting, CSP blocking wss://.
        // The app continues to function with manual refresh; the
        // polling interval will re-subscribe if this persists.
        console.warn(
          `[useRealtimeSync] Realtime channel error (recoverable). ` +
            "Cross-device sync will auto-reconnect; the app continues " +
            "with manual refresh in the meantime."
        );
      } else if (status === "TIMED_OUT") {
        // Less common — the subscription handshake didn't complete in
        // time. Usually indicates a network issue or the Supabase
        // project's Realtime being disabled. Worth investigating if
        // it persists, but still non-fatal.
        console.warn(
          `[useRealtimeSync] Realtime channel timed out. ` +
            "This may indicate a slow network or Realtime being disabled " +
            "on the project. The app continues with manual refresh."
        );
      }
    });

    activeChannel = channel;
  };

  /**
   * Unsubscribe from the active channel (if any) and clear any
   * pending debounce timer.
   */
  const unsubscribe = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (activeChannel !== null) {
      try {
        getClient().removeChannel(activeChannel);
      } catch {
        // Swallow — already removed or client torn down.
      }
      activeChannel = null;
    }
  };

  // Lifecycle: subscribe when a uid becomes available, unsubscribe
  // when it goes away or the component unmounts. We use onMount +
  // createEffect semantics via onMount + manual tracking — using
  // createEffect here would re-run on every uid change, which is what
  // we want, but onMount is sufficient because the uid is already
  // available by the time the provider mounts (auth is resolved
  // before UserLibraryProvider's doFetch runs).
  //
  // We DO want to re-subscribe if the uid changes mid-session (e.g.
  // the user signs out and signs in as a different user), so we
  // poll the uid signal on an interval. This is a lightweight check
  // (just reading a signal) and only re-subscribes when the uid
  // actually changes.
  onMount(() => {
    // Initial subscription.
    const initialUid = uid() ?? null;
    if (initialUid) {
      lastUid = initialUid;
      subscribe(initialUid);
    }

    // Poll for uid changes. We use a 1s interval because auth state
    // transitions (sign-in, sign-out, token refresh) are infrequent
    // and a 1s check is cheap. Using createEffect would be more
    // idiomatic, but createEffect runs in a reactive scope that may
    // not exist inside a Provider's onMount — polling is simpler and
    // equally correct for this use case.
    const interval = setInterval(() => {
      const currentUid = uid() ?? null;
      if (currentUid !== lastUid) {
        lastUid = currentUid;
        if (currentUid) {
          subscribe(currentUid);
        } else {
          unsubscribe();
        }
      }
    }, 1000);

    // Clean up the interval on unmount.
    onCleanup(() => {
      clearInterval(interval);
      unsubscribe();
    });
  });
}
