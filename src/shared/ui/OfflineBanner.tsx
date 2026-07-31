/**
 * CineLog V2 — Offline Banner
 * ---------------------------------------------------------------------
 * A small, SSR-safe banner that slides down from the top of the page
 * whenever the browser reports `navigator.onLine === false` AND a
 * fallback health check confirms the connection is actually down.
 *
 * Why a health check?
 *   `navigator.onLine` is notoriously unreliable on mobile browsers,
 *   captive portals, and corporate networks — it only reports whether
 *   the device has *a* network interface up, not whether it can reach
 *   the internet. This produced false-positive "You're offline" banners
 *   while the app was clearly loading fresh content. The health check
 *   fetches `/favicon.ico` (small, always-present, cache-busted) and
 *   hides the banner if the fetch succeeds, so the banner only stays
 *   visible when the user is *actually* offline.
 *
 * Behaviour:
 *   • SSR-safe: the initial signal value is `false` on the server (no
 *     `navigator` access), so SSR HTML never contains the banner.
 *   • On hydration, `onMount` re-syncs the signal with the live
 *     `navigator.onLine` value, registers `online` / `offline` event
 *     listeners, and kicks off an initial health check if the browser
 *     reports offline.
 *   • Debounce (300ms): rapid online→offline→online transitions (e.g.,
 *     switching from Wi-Fi to cellular) don't cause the banner to
 *     flash on screen.
 *   • Health check: when the browser reports offline, the banner
 *     fetches `/favicon.ico` to confirm. If the fetch succeeds, the
 *     banner is hidden (false positive avoided).
 *   • Periodic re-check (every 8s): while the banner is visible, we
 *     keep running the health check on an interval. This catches the
 *     case where the `online` event doesn't fire reliably (iOS Safari
 *     is known to miss it).
 *   • Retry button: user can manually re-run the health check.
 *   • Dismiss button: user can manually hide the banner — but only if
 *     a fresh health check confirms they're actually online. If the
 *     check fails, dismiss is a no-op and the banner stays as a
 *     safety net.
 *   • Smooth show/hide transition via `transition-all` + the existing
 *     `animate-slide-down` keyframe (defined in motion.css).
 *
 * Placement: rendered once at the root layout (src/app.tsx), as a
 * sibling of <AppShell> so it sits above the app header. It uses
 * `position: sticky; top: 0; z-index: 99990` so it stays visible while
 * scrolling but doesn't overlap modals (modals live at z-index 99999+).
 */

import {
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  Show,
  type JSX
} from "solid-js";

/** 300ms — long enough to absorb brief network blips on mobile, short
 * enough to feel responsive when the user really does go offline. */
const DEBOUNCE_MS = 300;

/** 8s — interval between automatic health checks while the banner is
 * shown. Catches the case where the `online` event doesn't fire. */
const HEALTH_CHECK_INTERVAL_MS = 8000;

/** 5s — abort the health-check fetch after this long. Treats a
 * hung request as offline. */
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Endpoint used for the health check. favicon.ico is small, always
 * present (in /public), and cache-busted with a timestamp query param
 * so we actually hit the network. */
const HEALTH_CHECK_URL = "/favicon.ico";

export function OfflineBanner(): JSX.Element {
  // SSR-safe: typeof navigator !== "undefined" guard means the server
  // renders `false` (no banner in SSR HTML). On the client, the signal
  // initialiser reads the real `navigator.onLine` value.
  const [offline, setOffline] = createSignal<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  // True while a health check is in flight. Used to show a "Checking…"
  // label on the Retry button and to disable both buttons.
  const [checking, setChecking] = createSignal<boolean>(false);

  // True if the user has manually dismissed the banner. Only allowed
  // when a health check confirms they're actually online; otherwise
  // the dismiss is a no-op. Reset to false whenever `offline()` flips
  // back to true so a new offline event re-shows the banner.
  const [dismissed, setDismissed] = createSignal<boolean>(false);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Run a fetch-based health check against /favicon.ico. Returns true
   * if the network is reachable.
   *
   * Uses `cache: 'no-store'` + a cache-bust query param to make sure
   * we actually hit the network and don't get a cached response.
   * Aborts after HEALTH_CHECK_TIMEOUT_MS.
   *
   * SSR-guarded: returns false on the server (no fetch / no window).
   */
  async function runHealthCheck(): Promise<boolean> {
    if (typeof window === "undefined" || typeof fetch === "undefined") {
      return false;
    }
    setChecking(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        HEALTH_CHECK_TIMEOUT_MS
      );
      const url = `${HEALTH_CHECK_URL}?_=${Date.now()}`;
      const res = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeout);
      // 2xx or 3xx (e.g., 304) means we got a response from the
      // server — the network is up. 4xx is also fine (favicon might
      // be missing). Only 5xx or a network error means offline.
      return res.status < 500;
    } catch {
      return false;
    } finally {
      setChecking(false);
    }
  }

  /** Clear the periodic health-check interval, if any. */
  function stopHealthCheckPolling() {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  }

  /**
   * Apply a debounced change to the offline state.
   *
   * If `nextOffline` is false (browser says we're back online): apply
   * immediately, clear all timers, and reset `dismissed` so the next
   * offline event re-shows the banner.
   *
   * If `nextOffline` is true (browser says we're offline): wait
   * DEBOUNCE_MS, then show the banner and kick off a health check.
   * If the health check succeeds (user is actually online), hide the
   * banner again — this is the false-positive fix.
   */
  function applyOfflineState(nextOffline: boolean) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (!nextOffline) {
      // Browser says we're back online — apply immediately.
      setOffline(false);
      setDismissed(false);
      stopHealthCheckPolling();
      return;
    }

    // Browser says we're offline — debounce then show.
    debounceTimer = setTimeout(async () => {
      setOffline(true);
      setDismissed(false);

      // Start periodic health checks while the banner is shown. If
      // any check succeeds, hide the banner (it was a false positive
      // OR the user has come back online without an `online` event).
      stopHealthCheckPolling();
      healthCheckTimer = setInterval(async () => {
        const reachable = await runHealthCheck();
        if (reachable) {
          setOffline(false);
          setDismissed(false);
          stopHealthCheckPolling();
        }
      }, HEALTH_CHECK_INTERVAL_MS);

      // Also run one immediately — if the user is actually online,
      // we hide the banner within ~5s instead of waiting 8s for the
      // first interval tick.
      const reachable = await runHealthCheck();
      if (reachable) {
        setOffline(false);
        setDismissed(false);
        stopHealthCheckPolling();
      }
    }, DEBOUNCE_MS);
  }

  const handleOnline = () => applyOfflineState(false);
  const handleOffline = () => applyOfflineState(true);

  onMount(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") {
      return;
    }

    // Re-sync in case the initial createSignal read ran before the
    // browser fired its first online/offline event (rare, but possible
    // during fast navigations or service-worker takeovers). Also kicks
    // off the initial health check via applyOfflineState if the
    // browser reports offline.
    applyOfflineState(!navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  });

  onCleanup(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    stopHealthCheckPolling();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
  });

  /**
   * Manual retry — re-run the health check and hide the banner if it
   * succeeds. If it fails, the banner stays visible (and we briefly
   * show the "Checking…" state on the button so the user gets
   * feedback that something happened).
   */
  async function handleRetry() {
    const reachable = await runHealthCheck();
    if (reachable) {
      setOffline(false);
      setDismissed(false);
      stopHealthCheckPolling();
    } else {
      // Health check failed — make sure the banner is visible even
      // if the user previously dismissed it.
      setDismissed(false);
    }
  }

  /**
   * Manual dismiss — only allowed when the user is actually online
   * (per a fresh health check). If the check fails, the dismiss is a
   * no-op so the banner stays as a safety net. This prevents the
   * user from dismissing the banner and then being stuck with no
   * indication that they're offline.
   */
  async function handleDismiss() {
    const reachable = await runHealthCheck();
    if (reachable) {
      setDismissed(true);
      setOffline(false);
      stopHealthCheckPolling();
    }
    // If not reachable, do nothing — banner stays.
  }

  // Whether the banner should actually be rendered. Hidden if offline
  // is false OR the user has dismissed it.
  const visible = createMemo(() => offline() && !dismissed());

  return (
    <Show when={visible()}>
      <div
        role="status"
        aria-live="polite"
        class="offline-banner animate-slide-down"
        style={{
          position: "sticky",
          top: "0",
          "z-index": "99990",
          width: "100%",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          gap: "var(--sp-3)",
          background: "var(--danger-bg, #fef3c7)",
          color: "var(--danger-text, #92400e)",
          padding: "var(--sp-2) var(--sp-4)",
          "font-size": "13px",
          "font-family": "'Outfit', sans-serif",
          "line-height": "1.4",
          "border-bottom": "1px solid rgba(0,0,0,0.06)",
          transition: "all 200ms ease-in-out"
        }}
      >
        <span>You're offline. Some features may be unavailable.</span>
        <button
          type="button"
          onClick={handleRetry}
          disabled={checking()}
          aria-label="Retry connection check"
          style={{
            background: "transparent",
            border: "1px solid currentColor",
            "border-radius": "999px",
            padding: "2px 10px",
            "font-size": "11px",
            "font-family": "inherit",
            color: "inherit",
            cursor: checking() ? "wait" : "pointer",
            opacity: checking() ? 0.6 : 1,
            "line-height": "1.4",
            "white-space": "nowrap"
          }}
        >
          {checking() ? "Checking…" : "Retry"}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={checking()}
          aria-label="Dismiss offline banner"
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            padding: "2px 6px",
            "font-size": "16px",
            "line-height": "1",
            opacity: checking() ? 0.6 : 1
          }}
        >
          ×
        </button>
      </div>
    </Show>
  );
}

export default OfflineBanner;
