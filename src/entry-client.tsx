// src/entry-client.tsx
//
// CineLog V2 — Browser Entry Point
// ---------------------------------------------------------------------
// Mounts the SolidJS app and registers the service worker in production.
//
// Service Worker registration:
//   • Only runs in production (import.meta.env.PROD) — dev mode skips
//     registration to avoid caching issues while the SW file is being
//     iterated on.
//   • Only runs if the browser supports service workers AND the page is
//     served over HTTPS (or from localhost). Vercel enforces HTTPS in
//     production, so this is always safe on the deployed site.
//   • Registered on window load (deferred) so it doesn't compete with
//     initial hydration for bandwidth/CPU.
//   • Failures are logged but never thrown — a broken SW registration
//     must NOT prevent the app from working. Web Push simply becomes
//     unavailable until the next visit.
//   • On registration success, listen for a new SW waiting to activate
//     (i.e. a deploy shipped a new sw.js) and prompt it to take over
//     immediately via skipWaiting(). The user gets the new SW on the
//     next navigation without an explicit reload prompt — acceptable
//     for an SPA like CineLog where the SW changes infrequently.

import { mount, StartClient } from "@solidjs/start/client";
import { injectSpeedInsights } from "@vercel/speed-insights";
import { initSentry, captureException } from "~/lib/sentry/client";

// Mount the SolidJS app first — this is the critical path to first paint.
// Everything else is deferred to avoid blocking hydration.
mount(() => <StartClient />, document.getElementById("app")!);

// Phase 8 Chunk 1 — initialize Sentry AFTER mount so it doesn't block
// hydration. initSentry() is idempotent and a no-op when no DSN is
// configured (dev, tests), so this is safe to call unconditionally.
initSentry();

// Initialize Vercel Speed Insights AFTER mount so the SDK can hook
// into the correct navigation/route-change events. This is a no-op in
// development and during SSR — it only activates on Vercel.
// Using requestIdleCallback so it doesn't compete with post-hydration work.
if (typeof requestIdleCallback !== "undefined") {
  requestIdleCallback(() => injectSpeedInsights());
} else {
  // Fallback for browsers without requestIdleCallback.
  setTimeout(() => injectSpeedInsights(), 200);
}

// ─── Service Worker registration (production only) ──────────────────
// Runs AFTER mount() so hydration isn't blocked. The browser will
// schedule this on the next idle frame.
//
// UPDATE TOAST (Phase 3):
//   When a new SW takes over (controllerchange event), we show a toast
//   notification saying "New version available! Refresh to update."
//   This closes the UX gap where the new SW activated silently and the
//   user kept using the stale UI until their next navigation. The
//   useToast() hook is imported lazily INSIDE the controllerchange
//   handler (not at module load) so we don't pull the toast module
//   into the initial bundle just for SW registration.
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  import.meta.env.PROD
) {
  window.addEventListener("load", () => {
    // Listen for controllerchange — fires when a new SW takes over
    // (either because skipWaiting() was called from updatefound, or
    // because the user navigated and the waiting SW activated).
    // We show the toast ONCE per controllerchange. The toast has an
    // "action" type with a "Refresh" button so the user can reload
    // with one tap.
    let toastShownForThisController = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (toastShownForThisController) return;
      toastShownForThisController = true;

      // Lazy-import the toast hook so it's not in the initial bundle.
      // useToast() returns { showToast } — the toasts signal is
      // module-level so it works even outside a Solid reactive root.
      import("~/shared/hooks/useToast")
        .then(({ useToast }) => {
          const { showToast } = useToast();
          showToast(
            "New version available! Refresh to update.",
            "action",
            0, // duration: 0 = persistent until dismissed or action taken
            {
              actionLabel: "Refresh",
              onAction: () => {
                // Hard reload to bust any cached chunks.
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }
            }
          );
        })
        .catch((err) => {
          // If the toast module fails to load (e.g. chunk load error
          // on a flaky connection), capture the error via Sentry (so
          // we see it in production monitoring) AND log to console.info
          // so the user at least sees something in devtools.
          //
          // Phase 8 Chunk 1: previously this was console.info-only,
          // which meant chunk-load failures on flaky connections were
          // invisible in production. Now they're reported to Sentry.
          captureException(err, {
            feature: "sw-update-toast",
            message: "Toast module failed to load on controllerchange"
          });
          console.info(
            "[SW] New version available — refresh to update. (Toast module failed to load.)",
            err
          );
        });
    });

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Watch for a new SW waiting to take over. When a new version
        // is installed (e.g. after a deploy), skipWaiting() so it
        // activates immediately on the next navigation.
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // A new SW has finished installing and is waiting. Tell
              // it to skip waiting — it will activate on the next
              // navigation.
              newWorker.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch((err) => {
        // SW registration failures are non-fatal — the app works
        // without push notifications. Log so it's visible in devtools
        // but don't propagate.
        console.warn("[SW] Registration failed:", err);
      });
  });
}
