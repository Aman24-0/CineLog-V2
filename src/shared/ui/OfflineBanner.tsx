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
 *   • Initial load: if `navigator.onLine` is false, run a health check
 *     FIRST. Only show the banner if the check confirms offline. This
 *     prevents the "banner flashes on load" false positive that mobile
 *     users were seeing.
 *   • Runtime offline event: show banner after 300ms debounce (immediate
 *     feedback for real offline events).
 *   • Runtime online event: hide banner immediately, reset dismissed.
 *   • Retry button: always clickable (never disabled). Re-runs health
 *     check. Shows "Checking…" label while in flight.
 *   • Dismiss (×) button: ALWAYS works, no health check required. Hides
 *     the banner immediately. Resets when the `online` event fires so
 *     the next genuine offline event re-shows the banner.
 *   • No continuous polling — it caused the buttons to be disabled
 *     most of the time (5s out of every 8s) and provided little value
 *     over event-driven checks.
 *   • Smooth show/hide transition via `transition-all` + the existing
 *     `animate-slide-down` keyframe (defined in motion.css).
 *   • Mobile-friendly: 36px min touch targets, `touch-action:
 *     manipulation` to remove the 300ms tap delay, `-webkit-tap-
 *     highlight-color: transparent` for clean taps.
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

/** 3s — abort the health-check fetch after this long. Treats a hung
 * request as offline. Kept short so the initial-load check resolves
 * quickly and the banner either shows or stays hidden without a long
 * wait. */
const HEALTH_CHECK_TIMEOUT_MS = 3000;

/** Endpoint used for the health check. favicon.ico is small, always
 * present (in /public), and cache-busted with a timestamp query param
 * so we actually hit the network. */
const HEALTH_CHECK_URL = "/favicon.ico";

export function OfflineBanner(): JSX.Element {
  // SSR-safe: typeof navigator !== "undefined" guard means the server
  // renders `false` (no banner in SSR HTML). On the client, the signal
  // initialiser reads the real `navigator.onLine` value — but note
  // that on initial load we DON'T immediately set offline=true. The
  // onMount runs a health check first and only sets offline=true if
  // the check confirms offline. This prevents the "banner shows from
  // start" false positive that mobile users were seeing.
  const [offline, setOffline] = createSignal<boolean>(false);

  // True while a health check is in flight. Used ONLY for the Retry
  // button label ("Checking…") — buttons are NEVER disabled, so the
  // user can always dismiss or re-check.
  const [checking, setChecking] = createSignal<boolean>(false);

  // True if the user has manually dismissed the banner. Dismiss ALWAYS
  // works — no health check required. Reset to false whenever the
  // `online` event fires so the next genuine offline event re-shows
  // the banner.
  const [dismissed, setDismissed] = createSignal<boolean>(false);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Run a fetch-based health check against /favicon.ico. Returns true
   * if the network is reachable.
   *
   * Uses GET (not HEAD) — some static hosts and CDNs don't support
   * HEAD on static files and return 405, which would incorrectly look
   * like an error. GET is universally supported.
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
        method: "GET",
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeout);
      // 2xx, 3xx, or 4xx all mean we got a response from the server —
      // the network is up. Only 5xx or a network error means offline.
      // (favicon.ico might 404 on some setups, but that still proves
      // the network is reachable.)
      return res.status < 500;
    } catch {
      return false;
    } finally {
      setChecking(false);
    }
  }

  /**
   * Handle a runtime `offline` event. Show the banner after a short
   * debounce (to absorb brief blips). Unlike the initial-load path,
   * we DON'T run a health check here — the user just got an offline
   * event, so we trust it and show immediate feedback. The user can
   * tap Retry to run a health check if they believe it's a false
   * positive.
   */
  function handleOffline() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    debounceTimer = setTimeout(() => {
      setOffline(true);
      // Don't reset dismissed here — if the user previously dismissed,
      // respect that until the next online event.
    }, DEBOUNCE_MS);
  }

  /**
   * Handle a runtime `online` event. Hide the banner immediately and
   * reset dismissed so the next offline event re-shows the banner.
   */
  function handleOnline() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    setOffline(false);
    setDismissed(false);
  }

  onMount(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") {
      return;
    }

    // INITIAL LOAD — the critical fix for "banner shows from start".
    // If the browser reports offline on mount, run a health check FIRST
    // and only show the banner if the check confirms offline. This
    // filters out the common mobile false positive where
    // navigator.onLine is wrong but the network is actually up.
    //
    // We intentionally do NOT set offline=true here before the check
    // completes — the previous version did, which is why the banner
    // flashed on every load.
    if (!navigator.onLine) {
      void (async () => {
        const reachable = await runHealthCheck();
        if (!reachable) {
          setOffline(true);
        }
      })();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  });

  onCleanup(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
  });

  /**
   * Manual retry — re-run the health check and hide the banner if it
   * succeeds. The button is NEVER disabled; if a check is already in
   * flight, we ignore the click (the in-flight check will resolve on
   * its own). This keeps the button always tappable on mobile.
   */
  async function handleRetry() {
    if (checking()) return; // ignore rapid double-taps
    const reachable = await runHealthCheck();
    if (reachable) {
      setOffline(false);
      setDismissed(false);
    }
    // If not reachable, banner stays. The "Checking…" label provides
    // feedback that the check ran.
  }

  /**
   * Manual dismiss — ALWAYS works, no health check required. Hides the
   * banner immediately. This is the escape hatch for false positives:
   * if the user is online but the banner won't go away (e.g., health
   * check is failing for some reason), they can dismiss it manually.
   *
   * The banner will reappear when the `online` event fires (which
   * resets dismissed) followed by another `offline` event — so a
   * genuine offline transition will still be announced.
   */
  function handleDismiss() {
    setDismissed(true);
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
          transition: "all 200ms ease-in-out",
          "-webkit-tap-highlight-color": "transparent"
        }}
      >
        <span>You're offline. Some features may be unavailable.</span>
        <button
          type="button"
          onClick={handleRetry}
          aria-label="Retry connection check"
          style={{
            background: "transparent",
            border: "1px solid currentColor",
            "border-radius": "999px",
            // Bigger touch target — 36px min height (mobile HIG is 44px
            // but the banner is compact, so 36px is a reasonable
            // compromise that's still easily tappable).
            padding: "6px 14px",
            "min-height": "36px",
            "font-size": "12px",
            "font-family": "inherit",
            "font-weight": 600,
            color: "inherit",
            cursor: "pointer",
            "line-height": "1.4",
            "white-space": "nowrap",
            "touch-action": "manipulation",
            "-webkit-tap-highlight-color": "transparent"
          }}
        >
          {checking() ? "Checking…" : "Retry"}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss offline banner"
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            // Bigger touch target — 36x36px square centered on the ×.
            padding: "0",
            "min-width": "36px",
            "min-height": "36px",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "font-size": "22px",
            "line-height": "1",
            "touch-action": "manipulation",
            "-webkit-tap-highlight-color": "transparent"
          }}
        >
          ×
        </button>
      </div>
    </Show>
  );
}

export default OfflineBanner;
