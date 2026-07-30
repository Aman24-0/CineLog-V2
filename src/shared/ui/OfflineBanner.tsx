/**
 * CineLog V2 — Offline Banner
 * ---------------------------------------------------------------------
 * A small, SSR-safe banner that slides down from the top of the page
 * whenever `navigator.onLine === false`. Listens to the browser's
 * `online` / `offline` events and updates a SolidJS signal.
 *
 * Behaviour:
 *   • SSR-safe: the initial signal value is `false` on the server (no
 *     `navigator` access), so the SSR HTML never contains the banner.
 *   • On hydration, `onMount` re-syncs the signal with the live
 *     `navigator.onLine` value (the initial `createSignal` already
 *     reads `navigator.onLine` on the client, but `onMount` is what
 *     registers the event listeners).
 *   • The banner is `position: sticky; top: 0; z-index: 99990` so it
 *     stays visible while scrolling but doesn't overlap modals
 *     (modals live at z-index 99999+).
 *   • Uses `animate-slide-down` (defined in motion.css) for the
 *     "slide down from top" enter animation, matching the design
 *     system's motion tokens.
 *
 * Placement: rendered once at the root layout (src/app.tsx), inside
 * <GlobalErrorBoundary> so it's visible on every page.
 */

import { createSignal, onMount, onCleanup, Show, type JSX } from "solid-js";

export function OfflineBanner(): JSX.Element {
  // SSR-safe: typeof navigator !== "undefined" guard means the server
  // renders `false` (no banner in SSR HTML). On the client, the signal
  // initialiser reads the real `navigator.onLine` value.
  const [offline, setOffline] = createSignal<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  const handleOnline = () => setOffline(false);
  const handleOffline = () => setOffline(true);

  onMount(() => {
    // Re-sync in case the initial createSignal read ran before the
    // browser fired its first online/offline event (rare, but possible
    // during fast navigations or service-worker takeovers).
    if (typeof navigator !== "undefined") {
      setOffline(!navigator.onLine);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  });

  onCleanup(() => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  });

  return (
    <Show when={offline()}>
      <div
        role="status"
        aria-live="polite"
        class="offline-banner animate-slide-down"
        style={{
          position: "sticky",
          top: "0",
          "z-index": "99990",
          width: "100%",
          background: "var(--danger-bg, #fef3c7)",
          color: "var(--danger-text, #92400e)",
          padding: "var(--sp-2) var(--sp-4)",
          "text-align": "center",
          "font-size": "13px",
          "font-family": "'Outfit', sans-serif",
          "line-height": "1.4",
          "border-bottom": "1px solid rgba(0,0,0,0.06)"
        }}
      >
        You're offline. Some features may be unavailable.
      </div>
    </Show>
  );
}

export default OfflineBanner;
