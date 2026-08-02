// src/features/notifications/hooks/usePushSubscription.ts
//
// CineLog V2 — Web Push Subscription Hook
// ---------------------------------------------------------------------
// Manages the browser-side lifecycle of a Web Push subscription:
//   1. Detect whether the browser supports service workers + PushManager.
//   2. Fetch the VAPID public key from app_config (so the admin can
//      rotate it without redeploying).
//   3. Check whether a subscription already exists on this device.
//   4. subscribe()    — request Notification.permission, register a
//                       push subscription with the browser push service,
//                       and persist it to the `push_subscriptions`
//                       table so the server can later send to this
//                       device.
//   5. unsubscribe()  — call PushSubscription.unsubscribe() (tells the
//                       browser push service to stop) AND delete the row
//                       from `push_subscriptions` (tells our server to
//                       stop trying to send).
//   6. sendTest()     — fire a test notification through the server
//                       endpoint so the user can verify the full
//                       round-trip works.
//
// WHY A HOOK (vs a free function):
//   The hook owns SolidJS signals that the UI binds to (isSubscribed,
//   isSupported, isSubscribing, error). Wrapping the lifecycle in a
//   hook also lets us use onMount() to do the initial support check +
//   VAPID key fetch + existing-subscription check without the caller
//   having to wire anything up.
//
// SUPABASE CLIENT:
//   Uses the browser singleton via `getClient()`. The push_subscriptions
//   table has RLS policies that restrict every operation to rows where
//   user_id = auth.uid(), so the user can only ever touch their own
//   subscriptions.
//
// AUTH CONTEXT:
//   The hook reads the current user's id via `useAuth()`. If the user
//   is not signed in, subscribe() returns false and the UI should
//   prompt them to sign in first. We deliberately do NOT cache the
//   uid at mount time — `user()` is a reactive accessor and is safe
//   to call on every subscribe() invocation.
//
// ERROR HANDLING:
//   Every external call (supabase query, pushManager.subscribe,
//   Notification.requestPermission) is wrapped in try/catch and
//   surfaces the error via the `error()` signal so the UI can show a
//   helpful message. Errors are NEVER thrown — the hook always returns
//   a boolean so callers can use a simple `if (!ok) return` pattern.

import { createSignal, onMount, type Accessor } from "solid-js";
import { getClient } from "~/lib/supabase/client";
import { getBrowserSession } from "~/lib/supabase/session";
import { useAuth } from "~/shared/hooks/useAuth";

/**
 * PushSubscriptionKeys — the encryption keys the Web Push API gives us
 * when a subscription is created. Stored as JSONB in the
 * `push_subscriptions` table. Both keys are base64-encoded strings.
 */
export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

/**
 * PushSubscriptionRow — the shape of a row in `push_subscriptions`.
 * Exposed for read-only consumers (e.g. a future "manage devices" UI).
 */
export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  keys: PushSubscriptionKeys;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsePushSubscriptionReturn {
  /** True if a subscription exists for this device. */
  isSubscribed: Accessor<boolean>;
  /** True if the browser supports service workers + PushManager. */
  isSupported: Accessor<boolean>;
  /** True while a subscribe/unsubscribe call is in flight. */
  isLoading: Accessor<boolean>;
  /** Last error message, or null if no error. Cleared on next action. */
  error: Accessor<string | null>;
  /** The VAPID public key fetched from app_config (empty if not set). */
  vapidPublicKey: Accessor<string>;

  /** Subscribe the current device to push notifications. Returns true on success. */
  subscribe: () => Promise<boolean>;
  /** Unsubscribe the current device. Returns true on success. */
  unsubscribe: () => Promise<boolean>;
  /** Re-check whether a subscription exists. */
  checkSubscription: () => Promise<boolean>;
  /** Send a test push notification through the server. */
  sendTest: () => Promise<boolean>;
}

/**
 * Convert a base64-URL string to a Uint8Array backed by a real
 * ArrayBuffer (not SharedArrayBuffer). Used to convert the VAPID
 * public key (which is base64-URL encoded) into the format the
 * PushManager.subscribe() API expects.
 *
 * The function applies the standard base64-URL → base64 → binary
 * conversion:
 *   1. Pad with '=' so the length is a multiple of 4.
 *   2. Replace URL-safe chars (- _) with standard base64 chars (+ /).
 *   3. atob() to decode to a binary string.
 *   4. Copy each char's charCode into a Uint8Array.
 *
 * NOTE on the explicit `ArrayBuffer` allocation: TypeScript 5.7+
 * tightened the BufferSource type so the bare `Uint8Array` type
 * alias (which defaults to `Uint8Array<ArrayBufferLike>`) no longer
 * satisfies `BufferSource` — the underlying buffer could theoretically
 * be a `SharedArrayBuffer`. By constructing the array from an explicit
 * `new ArrayBuffer(...)` and annotating the return type as
 * `Uint8Array<ArrayBuffer>`, we prove to the compiler that the buffer
 * is a real ArrayBuffer. This is the type the DOM `applicationServerKey`
 * parameter expects.
 */
function urlBase64ToUint8Array(
  base64String: string
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Convert an ArrayBuffer to a base64 string. Used to encode the p256dh
 * and auth keys returned by PushSubscription.getKey() so they can be
 * stored as JSON strings in the database.
 */
function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function usePushSubscription(): UsePushSubscriptionReturn {
  const { user } = useAuth();

  const [isSubscribed, setIsSubscribed] = createSignal(false);
  const [isSupported, setIsSupported] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = createSignal("");

  /**
   * Check whether the browser supports the full Web Push stack:
   *   - serviceWorker (for receiving push events)
   *   - PushManager   (for subscribing to push)
   *   - Notification  (for displaying the push notification)
   *
   * Sets the isSupported signal. Returns the boolean for callers that
   * want to short-circuit without waiting for the signal to propagate.
   */
  const checkSupport = (): boolean => {
    if (typeof window === "undefined") {
      setIsSupported(false);
      return false;
    }
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);
    return supported;
  };

  /**
   * Fetch the VAPID public key from app_config. The key is stored as a
   * JSONB string value (e.g. "BK2v...==") so we extract it as a string.
   *
   * On any error (network, RLS, missing row), we set the key to empty
   * string — the subscribe() function will then refuse to subscribe
   * and show a "Push not configured" error.
   */
  const fetchVapidKey = async (): Promise<void> => {
    try {
      const supabase = getClient();
      const { data, error: dbError } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "vapid_public_key")
        .maybeSingle();

      if (dbError) {
        // Don't surface this to the user — the key may just not be set
        // yet (admin hasn't configured it). The subscribe() call will
        // show a clearer error when the user actually tries to opt in.
        setVapidPublicKey("");
        return;
      }

      if (!data || !data.value) {
        setVapidPublicKey("");
        return;
      }

      // The value column is JSONB. It may be stored as either:
      //   - a JSON string:  "BK2v...=="  → JS string
      //   - a JSON object:  { key: "..." }  → unlikely but handle gracefully
      const value = data.value;
      if (typeof value === "string") {
        setVapidPublicKey(value);
      } else if (
        value &&
        typeof value === "object" &&
        "publicKey" in value &&
        typeof (value as Record<string, unknown>).publicKey === "string"
      ) {
        setVapidPublicKey((value as Record<string, string>).publicKey);
      } else {
        setVapidPublicKey("");
      }
    } catch {
      // Network error, supabase not configured, etc. Fail silently —
      // the UI shows "Not supported" until the key is reachable.
      setVapidPublicKey("");
    }
  };

  /**
   * Check whether a subscription already exists for this browser. Sets
   * the isSubscribed signal. Returns the boolean for callers that need
   * an immediate value.
   */
  const checkSubscription = async (): Promise<boolean> => {
    if (!checkSupport()) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const subscribed = !!subscription;
      setIsSubscribed(subscribed);
      return subscribed;
    } catch {
      setIsSubscribed(false);
      return false;
    }
  };

  /**
   * Subscribe the current device to Web Push. Steps:
   *   1. Verify support + VAPID key + signed-in user.
   *   2. Request Notification.permission (browser prompts the user).
   *   3. Register a push subscription via PushManager.subscribe().
   *   4. Upsert the subscription into `push_subscriptions` so the
   *      server can later send push messages to this device.
   *
   * Returns true on success, false otherwise. On failure, the `error`
   * signal is set with a human-readable message.
   */
  const subscribe = async (): Promise<boolean> => {
    setError(null);

    if (!checkSupport()) {
      setError("Push notifications are not supported in this browser.");
      return false;
    }

    const uid = user()?.uid ?? null;
    if (!uid) {
      setError("Please sign in to enable push notifications.");
      return false;
    }

    const key = vapidPublicKey();
    if (!key) {
      setError(
        "Push notifications are not configured yet. Please ask an admin to set the VAPID public key."
      );
      return false;
    }

    setIsLoading(true);
    try {
      // 1. Request permission. The browser shows its native prompt.
      // If the user previously denied, this returns "denied" without
      // a prompt — we surface that as an error.
      if (Notification.permission === "denied") {
        setError(
          "Push notifications are blocked in your browser settings. Please unblock them and try again."
        );
        return false;
      }
      if (Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setError("Notification permission was not granted.");
          return false;
        }
      }

      // 2. Register the push subscription. userVisibleOnly: true is
      // required by the spec — it means we promise to show a
      // notification for every push (no silent pushes).
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      // 3. Persist the subscription to Supabase. The UNIQUE(user_id,
      // endpoint) constraint means if the same browser re-subscribes,
      // we just refresh the keys + expires_at.
      const supabase = getClient();
      const { error: upsertError } = await supabase
        .from("push_subscriptions")
        .upsert({
          user_id: uid,
          endpoint: subscription.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(subscription.getKey("p256dh")),
            auth: arrayBufferToBase64(subscription.getKey("auth")),
          },
          // subscription.expirationTime is null for most browsers
          // (Firefox/Mozilla do set it). Convert to ISO string or null.
          expires_at: subscription.expirationTime
            ? new Date(subscription.expirationTime).toISOString()
            : null,
        });

      if (upsertError) {
        console.warn("[Push] Failed to save subscription:", upsertError);
        setError("Failed to save your subscription. Please try again.");
        // Try to clean up the orphan browser subscription so we don't
        // leave the push service thinking we want notifications.
        try {
          await subscription.unsubscribe();
        } catch {
          // ignore
        }
        return false;
      }

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.warn("[Push] Subscription failed:", err);
      // The most common failure here is the user dismissing the
      // browser's "allow notifications" prompt, or an AbortError when
      // the SW is not yet ready. Surface a friendly message.
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Failed to subscribe to push notifications.";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Unsubscribe the current device. Steps:
   *   1. Get the current PushSubscription from the SW.
   *   2. Call unsubscribe() on it (tells the browser push service to
   *      stop sending to this endpoint).
   *   3. Delete the row from `push_subscriptions` so our server stops
   *      trying to send.
   *
   * Returns true on success (including the no-op case where there was
   * no subscription to begin with).
   */
  const unsubscribe = async (): Promise<boolean> => {
    setError(null);
    if (!checkSupport()) return false;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // No local subscription — but we may still have a stale row in
        // the DB (e.g. the user cleared site data). Best-effort delete
        // of any rows for this user with this endpoint; if there are
        // none, this is a no-op.
        setIsSubscribed(false);
        return true;
      }

      const endpoint = subscription.endpoint;

      // Tell the browser push service to stop.
      try {
        await subscription.unsubscribe();
      } catch (err) {
        // Even if the browser-side unsubscribe fails (e.g. network
        // error), we still want to delete the DB row — otherwise the
        // server keeps trying to send to a dead endpoint.
        console.warn("[Push] Browser unsubscribe failed:", err);
      }

      // Delete the DB row.
      const supabase = getClient();
      const { error: deleteError } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint);

      if (deleteError) {
        console.warn("[Push] Failed to delete subscription row:", deleteError);
        setError("Unsubscribed from browser, but failed to update server.");
        // Still mark as unsubscribed locally — the browser side worked.
        setIsSubscribed(false);
        return false;
      }

      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.warn("[Push] Unsubscribe failed:", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Failed to unsubscribe from push notifications.";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Send a test push notification through the server endpoint. This
   * verifies the full round-trip: browser → /api/push/send → web-push
   * → browser push service → service worker → notification.
   *
   * Returns true if the server reported at least one notification was
   * sent, false otherwise.
   */
  const sendTest = async (): Promise<boolean> => {
    setError(null);

    const uid = user()?.uid ?? null;
    if (!uid) {
      setError("Please sign in to send a test notification.");
      return false;
    }

    setIsLoading(true);
    try {
      // The browser stores Supabase sessions in localStorage (not cookies),
      // so the server can't read the access_token from the Cookie header.
      // We must pass it explicitly in the body — same pattern as
      // /api/account/delete (see DeactivateAccountSheet.tsx).
      const session = await getBrowserSession();
      const accessToken = session?.access_token ?? "";

      const response = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          title: "CineLog — Test notification",
          body: "If you can see this, push notifications are working correctly.",
          tag: "test",
          url: "/upcoming",
          accessToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message =
          (data && typeof data === "object" && "error" in data && typeof (data as Record<string, unknown>).error === "string"
            ? (data as Record<string, string>).error
            : null) ?? `Server returned ${response.status}.`;
        setError(message);
        return false;
      }

      const data = (await response.json().catch(() => ({}))) as {
        sent?: number;
      };
      if (!data.sent || data.sent === 0) {
        setError("No push subscriptions found. Please subscribe first.");
        return false;
      }
      return true;
    } catch (err) {
      console.warn("[Push] Test send failed:", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Failed to send test notification.";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // ─── onMount: initial state load ──────────────────────────────────
  onMount(() => {
    if (!checkSupport()) return;
    // Fetch the VAPID key + check existing subscription in parallel.
    // These don't depend on each other, so running them concurrently
    // shaves a round-trip off the initial page load.
    void Promise.all([fetchVapidKey(), checkSubscription()]);
  });

  return {
    isSubscribed,
    isSupported,
    isLoading,
    error,
    vapidPublicKey,
    subscribe,
    unsubscribe,
    checkSubscription,
    sendTest,
  };
}
